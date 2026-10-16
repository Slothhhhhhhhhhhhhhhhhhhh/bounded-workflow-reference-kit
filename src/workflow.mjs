import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
const exact = (value, names) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...names].sort().join(',');
const positive = value => Number.isSafeInteger(value) && value > 0;
class Refusal extends Error {}
class Budget extends Error {}

function scopeBytes(scope) {
  if (!exact(scope, ['id', 'snapshot', 'query']) || !identifier(scope.id)
    || !identifier(scope.snapshot) || typeof scope.query !== 'string' || scope.query.length > 256) {
    throw new Refusal('invalid_scope');
  }
  return JSON.stringify({ id: scope.id, snapshot: scope.snapshot, query: scope.query });
}

function decode(bytes, maxBytes) {
  if (!(bytes instanceof Uint8Array)) throw new Refusal('response_not_bytes');
  if (bytes.byteLength > maxBytes) throw new Refusal('response_too_large');
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    // The simulator wire contract is compact JSON: rejects duplicate keys/BOM/extra whitespace.
    if (!Buffer.from(bytes).equals(Buffer.from(JSON.stringify(value)))) throw new Error();
    return value;
  } catch { throw new Refusal('invalid_wire_json'); }
}

function receiptMatches(receipt, id, hash) {
  return exact(receipt, ['id', 'digest', 'receiptId']) && receipt.id === id
    && receipt.digest === hash && identifier(receipt.receiptId);
}

/** Single-machine reference store. No network client, credential reader or remote authority. */
export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
      if (this.db.prepare('PRAGMA synchronous').get().synchronous !== 2) throw new Refusal('durability_unavailable');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS histories (
          id TEXT PRIMARY KEY, scope TEXT NOT NULL, status TEXT NOT NULL,
          reason TEXT NOT NULL, revision INTEGER NOT NULL, cursor TEXT,
          pending TEXT, position INTEGER NOT NULL, cursors TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS records (
          scope_id TEXT NOT NULL REFERENCES histories(id), id TEXT NOT NULL,
          body TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(scope_id,id)
        );
        CREATE TABLE IF NOT EXISTS intents (
          id TEXT PRIMARY KEY, payload BLOB NOT NULL, digest TEXT NOT NULL,
          state TEXT NOT NULL, consumed INTEGER NOT NULL, receipt TEXT
        );
      `);
    } catch (error) { this.db.close(); throw error; }
  }

  close() { this.db.close(); }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  ensureHistory(scope) {
    const serialized = scopeBytes(scope);
    this.transaction(() => {
      const old = this.db.prepare('SELECT scope FROM histories WHERE id=?').get(scope.id);
      if (old && old.scope !== serialized) throw new Refusal('scope_mismatch');
      if (!old) this.db.prepare('INSERT INTO histories VALUES (?,?,?, ?,0,NULL,NULL,0,?)')
        .run(scope.id, serialized, 'incomplete', 'not_started', '[]');
    });
    return this.history(scope);
  }

  row(scope) {
    const serialized = scopeBytes(scope);
    const row = this.db.prepare('SELECT * FROM histories WHERE id=?').get(scope.id);
    if (!row || row.scope !== serialized) throw new Refusal('scope_mismatch');
    return row;
  }

  history(scope) {
    const row = this.row(scope);
    const records = this.db.prepare('SELECT count(*) AS n FROM records WHERE scope_id=?').get(scope.id).n;
    return { complete: row.status === 'complete', status: row.status, reason: row.reason,
      revision: row.revision, records, pendingIndex: row.position, cursor: row.cursor };
  }

  qualifiedRecords(scope) {
    if (!this.history(scope).complete) throw new Refusal('history_incomplete');
    return this.db.prepare('SELECT body FROM records WHERE scope_id=? ORDER BY id').all(scope.id)
      .map(row => JSON.parse(row.body));
  }

  /** Per-sweep budgets are independent of the durable scope and checkpoint. */
  async sweep(scope, adapter, options = {}) {
    const { maxPages = 1, maxDetails = 2, maxResponseBytes = 4096,
      maxStoredBytes = 16384, deadlineMs = 1000, now = Date.now, hook = () => {} } = options;
    if (![maxPages, maxDetails, maxResponseBytes, maxStoredBytes, deadlineMs].every(positive)
      || maxPages > 100 || maxDetails > 1000 || maxResponseBytes > 1048576
      || maxStoredBytes > 4194304 || deadlineMs > 10000) throw new Refusal('invalid_budget');
    this.ensureHistory(scope);
    let row = this.row(scope);
    const counts = { pages: 0, details: 0 };
    const result = () => ({ ...this.history(scope), counts });
    if (row.status !== 'incomplete') return result();
    const start = now();
    let last = start;
    const remaining = () => {
      const current = now();
      if (!Number.isFinite(current) || current < last) throw new Refusal('clock_reversed');
      last = current;
      if (current - start >= deadlineMs) throw new Budget('time_limit');
      return deadlineMs - (current - start);
    };
    if (!Number.isFinite(start)) throw new Refusal('invalid_clock');
    const save = (changes, detail) => {
      this.transaction(() => {
        const current = this.row(scope);
        if (current.revision !== row.revision) throw new Error('stale_checkpoint');
        const next = { ...current, ...changes, revision: current.revision + 1 };
        if (detail) {
          const body = JSON.stringify({ snapshot: detail.snapshot, id: detail.id, value: detail.value });
          const old = this.db.prepare('SELECT body FROM records WHERE scope_id=? AND id=?').get(scope.id, detail.id);
          if (old && old.body !== body) throw new Refusal('record_conflict');
          this.db.prepare('INSERT OR IGNORE INTO records VALUES (?,?,?,?)').run(scope.id, detail.id, body, digest(body));
        }
        const logicalBytes = this.db.prepare('SELECT coalesce(sum(length(CAST(body AS BLOB))+length(id)+64),0) AS n FROM records WHERE scope_id=?').get(scope.id).n
          + Buffer.byteLength(next.scope + (next.pending ?? '') + next.cursors);
        if (logicalBytes > maxStoredBytes) throw new Budget('storage_limit');
        this.db.prepare('UPDATE histories SET status=?,reason=?,revision=?,cursor=?,pending=?,position=?,cursors=? WHERE id=?')
          .run(next.status, next.reason, next.revision, next.cursor, next.pending, next.position, next.cursors, scope.id);
        row = next;
      });
    };
    const stop = (status, reason) => {
      // Reason-only updates remain possible even when a new lower storage budget cannot fit existing data.
      this.transaction(() => {
        const current = this.row(scope);
        if (current.revision !== row.revision) throw new Error('stale_checkpoint');
        this.db.prepare('UPDATE histories SET status=?,reason=?,revision=revision+1 WHERE id=?').run(status, reason, scope.id);
        row = this.row(scope);
      });
      return result();
    };
    const read = async operation => {
      const ms = remaining(), controller = new AbortController();
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Budget('time_limit')); }, ms);
        });
        const bytes = await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]);
        remaining();
        return decode(bytes, maxResponseBytes);
      } finally { clearTimeout(timer); }
    };
    try {
      for (;;) {
        remaining();
        if (row.pending === null) {
          if (counts.pages >= maxPages) return stop('incomplete', 'page_limit');
          const page = await read(signal => { counts.pages++; return adapter.list(row.cursor, { signal }); });
          if (!exact(page, ['snapshot', 'items', 'next']) || page.snapshot !== scope.snapshot
            || !Array.isArray(page.items) || page.items.length > 1000
            || page.items.some(item => !exact(item, ['id']) || !identifier(item.id))
            || page.next !== null && !identifier(page.next)
            || page.items.length === 0 && page.next !== null) throw new Refusal('invalid_page');
          const cursors = JSON.parse(row.cursors);
          if (page.next !== null && (page.next === row.cursor || cursors.includes(page.next))) throw new Refusal('cursor_cycle');
          save({ pending: JSON.stringify(page), position: 0, reason: 'page_retained' });
          hook('after_page_commit');
        }
        const page = JSON.parse(row.pending);
        while (row.position < page.items.length) {
          remaining();
          if (counts.details >= maxDetails) return stop('incomplete', 'detail_limit');
          const id = page.items[row.position].id;
          const detail = await read(signal => { counts.details++; return adapter.detail(id, { signal }); });
          if (!exact(detail, ['snapshot', 'id', 'value']) || detail.snapshot !== scope.snapshot
            || detail.id !== id || typeof detail.value !== 'string') throw new Refusal('invalid_detail');
          hook('before_detail_commit');
          save({ position: row.position + 1, reason: 'detail_retained' }, detail);
          hook('after_detail_commit');
        }
        if (page.next === null) {
          remaining();
          save({ status: 'complete', reason: 'response_exhausted', pending: null, position: 0 });
          return result();
        }
        save({ cursor: page.next, pending: null, position: 0,
          cursors: JSON.stringify([...JSON.parse(row.cursors), page.next]), reason: 'page_finished' });
      }
    } catch (error) {
      if (error instanceof Budget) return stop('incomplete', error.message);
      if (error instanceof Refusal) return stop('failed', error.message);
      // Unknown adapter or injected interruption: checkpoint remains at its last commit.
      throw error;
    }
  }

  prepareIntent(id, payload, { maxBytes = 4096 } = {}) {
    if (!identifier(id) || !(payload instanceof Uint8Array) || !positive(maxBytes)
      || maxBytes > 1048576 || payload.byteLength > maxBytes) throw new Refusal('invalid_payload');
    const bytes = Buffer.from(payload), hash = digest(bytes);
    return this.transaction(() => {
      const old = this.db.prepare('SELECT digest FROM intents WHERE id=?').get(id);
      if (old && old.digest !== hash) throw new Refusal('intent_conflict');
      if (!old) this.db.prepare('INSERT INTO intents VALUES (?,?,?, ?,0,NULL)').run(id, bytes, hash, 'pending');
      return this.intent(id);
    });
  }

  intent(id) {
    const row = this.db.prepare('SELECT id,digest,state,consumed,receipt FROM intents WHERE id=?').get(id);
    if (!row) throw new Refusal('unknown_intent');
    return { ...row, consumed: Boolean(row.consumed), receipt: row.receipt ? JSON.parse(row.receipt) : null };
  }

  confirm(id, receipt) {
    return this.transaction(() => {
      const row = this.intent(id);
      if (!row.consumed || !receiptMatches(receipt, id, row.digest)) throw new Refusal('receipt_mismatch');
      const encoded = JSON.stringify({ id: receipt.id, digest: receipt.digest, receiptId: receipt.receiptId });
      if (row.receipt && JSON.stringify(row.receipt) !== encoded) throw new Refusal('receipt_conflict');
      this.db.prepare('UPDATE intents SET state=?,receipt=? WHERE id=?').run('confirmed', encoded, id);
      return this.intent(id);
    });
  }

  async dispatch(id, service, { hook = () => {} } = {}) {
    const claim = this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM intents WHERE id=?').get(id);
      if (!row) throw new Refusal('unknown_intent');
      if (row.consumed) return null;
      if (digest(row.payload) !== row.digest) throw new Refusal('stored_payload_mismatch');
      this.db.prepare('UPDATE intents SET state=?,consumed=1 WHERE id=?').run('uncertain', id);
      return { id, digest: row.digest, payload: Buffer.from(row.payload) };
    });
    if (!claim) return this.intent(id);
    hook('after_attempt_commit');
    let receipt;
    try { receipt = await service.send(claim); }
    catch { return this.intent(id); }
    hook('after_effect');
    // Invalid acknowledgement leaves the consumed attempt uncertain.
    if (!receiptMatches(receipt, id, claim.digest)) return this.intent(id);
    return this.confirm(id, receipt);
  }

  async reconcile(id, service) {
    const row = this.intent(id);
    if (!row.consumed) throw new Refusal('attempt_not_consumed');
    const receipt = await service.lookup({ id, digest: row.digest });
    if (receipt == null) return row;
    return this.confirm(id, receipt);
  }
}
