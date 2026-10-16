import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/workflow.mjs';
import { HistorySimulator, DeliverySimulator } from '../src/simulator.mjs';

const scope = Object.freeze({ id: 'scope-001', snapshot: 'snapshot-001', query: 'invented' });
const records = Array.from({ length: 5 }, (_, i) => ({ id: `event-00${i + 1}`, value: `invented-${i + 1}` }));
const payload = () => Buffer.from(JSON.stringify({ document: 'sample-document-001', message: 'invented' }));
const bytes = value => Buffer.from(JSON.stringify(value));

test('R01: equivalent detail key order does not invent a record conflict', async t => {
  const f = fixture(t);
  const store = f.open();
  let details = 0;
  const result = await store.sweep(scope, {
    async list(cursor) {
      return bytes({ snapshot: scope.snapshot, items: [{ id: 'event-001' }], next: cursor === null ? 'cursor-1' : null });
    },
    async detail(id) {
      details++;
      return bytes(details === 1 ? { snapshot: scope.snapshot, id, value: 'invented' }
        : { value: 'invented', id, snapshot: scope.snapshot });
    }
  }, { maxPages: 2, maxDetails: 2 });
  assert.equal(result.complete, true);
  assert.equal(result.records, 1);
  assert.equal(details, 2);
});

test('R02: expiry before read admission does not count a request never invoked', async t => {
  const f = fixture(t);
  const store = f.open();
  let ticks = 0;
  let calls = 0;
  const result = await store.sweep(scope, {
    async list() { calls++; throw new Error('must not be called'); }
  }, { now: () => ticks++ < 2 ? 0 : 1000, deadlineMs: 1000 });
  assert.equal(result.reason, 'time_limit');
  assert.equal(result.complete, false);
  assert.equal(calls, 0);
  assert.deepEqual(result.counts, { pages: 0, details: 0 });
});

test('R03: a stale malformed sweep cannot fail another connection completed checkpoint', async t => {
  const f = fixture(t);
  const first = f.open();
  const second = f.open();
  let release;
  let signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const pending = first.sweep(scope, {
    list() { signalStarted(); return new Promise(resolve => { release = resolve; }); }
  });
  await started;
  const completed = await second.sweep(scope, historyAdapter(records.slice(0, 1)));
  assert.equal(completed.complete, true);
  release(bytes({ invalid: true }));
  await assert.rejects(pending, /stale_checkpoint/);
  assert.equal(first.history(scope).complete, true);
  assert.equal(first.history(scope).revision, completed.revision);
  assert.equal(first.qualifiedRecords(scope).length, 1);
});

// Only this helper's uniquely named, marked directory can be recursively removed.
function fixture(t) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'bounded-kit-test-'));
  const token = randomUUID();
  const marker = join(root, '.reference-kit-test-owner');
  writeFileSync(marker, token, { flag: 'wx' });
  const stores = new Set();
  const db = join(root, 'workflow.sqlite');
  const open = () => {
    const store = new Store(db);
    stores.add(store);
    return store;
  };
  const close = store => {
    store.close();
    stores.delete(store);
  };
  t.after(() => {
    for (const store of stores) store.close();
    assert.equal(dirname(resolve(root)), parent, 'temporary directory parent changed');
    assert.equal(realpathSync(root), resolve(root), 'temporary directory became a link');
    assert.ok(basename(root).startsWith('bounded-kit-test-'), 'unrecognized temporary directory');
    assert.equal(readFileSync(marker, 'utf8'), token, 'temporary ownership marker changed');
    rmSync(root, { recursive: true });
  });
  return { root, db, token, open, close };
}

function historyAdapter(input = records, pageSize = 2) {
  const calls = { pages: [], details: [] };
  return {
    calls,
    async list(cursor) {
      calls.pages.push(cursor);
      const offset = cursor === null ? 0 : Number(cursor.slice('cursor-'.length));
      const page = input.slice(offset, offset + pageSize);
      const next = offset + page.length < input.length ? `cursor-${offset + page.length}` : null;
      return bytes({ snapshot: scope.snapshot, items: page.map(({ id }) => ({ id })), next });
    },
    async detail(id) {
      calls.details.push(id);
      const record = input.find(item => item.id === id);
      return bytes({ snapshot: scope.snapshot, id, value: record.value });
    }
  };
}

function assertClosed(store) {
  assert.equal(store.history(scope).complete, false);
  assert.throws(() => store.qualifiedRecords(scope));
}

test('S01: five records need three bounded sweeps before the gate opens', async t => {
  const f = fixture(t);
  const store = f.open();
  const adapter = new HistorySimulator(records);
  store.ensureHistory(scope);
  for (let sweep = 0; sweep < 2; sweep++) {
    const result = await store.sweep(scope, adapter, { maxPages: 1, maxDetails: 2 });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.complete, false);
    assert.equal(result.records, (sweep + 1) * 2);
    assert.ok(result.counts.pages <= 1);
    assert.ok(result.counts.details <= 2);
    assertClosed(store);
  }
  const result = await store.sweep(scope, adapter, { maxPages: 1, maxDetails: 2 });
  assert.equal(result.complete, true);
  assert.deepEqual(store.qualifiedRecords(scope).map(item => item.id).sort(), records.map(item => item.id));
  f.close(store);
  const reopened = f.open();
  assert.equal(reopened.history(scope).complete, true);
  assert.equal(reopened.qualifiedRecords(scope).length, 5);
});

test('S02a: interruption after a detail commit resumes at the next detail', async t => {
  const f = fixture(t);
  const adapter = historyAdapter(records.slice(0, 2));
  let store = f.open();
  store.ensureHistory(scope);
  await assert.rejects(store.sweep(scope, adapter, {
    hook(stage) { if (stage === 'after_detail_commit') throw new Error('synthetic interruption'); }
  }), /synthetic interruption/);
  assert.equal(store.history(scope).records, 1);
  assert.equal(store.history(scope).pendingIndex, 1);
  f.close(store);
  store = f.open();
  assertClosed(store);
  assert.equal((await store.sweep(scope, adapter)).complete, true);
  assert.deepEqual(adapter.calls.details, ['event-001', 'event-002']);
  assert.equal(adapter.calls.pages.length, 1);
});

test('S02b: interruption before detail commit replays only the uncommitted detail', async t => {
  const f = fixture(t);
  const adapter = historyAdapter(records.slice(0, 2));
  let store = f.open();
  store.ensureHistory(scope);
  await assert.rejects(store.sweep(scope, adapter, {
    hook(stage) { if (stage === 'before_detail_commit') throw new Error('synthetic interruption'); }
  }), /synthetic interruption/);
  assert.equal(store.history(scope).records, 0);
  assert.equal(store.history(scope).pendingIndex, 0);
  f.close(store);
  store = f.open();
  assert.equal((await store.sweep(scope, adapter)).complete, true);
  assert.deepEqual(adapter.calls.details, ['event-001', 'event-001', 'event-002']);
  assert.equal(adapter.calls.pages.length, 1);
});

test('S03a: the same history identifier cannot acquire a changed scope', t => {
  const f = fixture(t);
  const store = f.open();
  store.ensureHistory(scope);
  assert.throws(() => store.ensureHistory({ ...scope, query: 'different-invented-query' }));
  assert.throws(() => store.history({ ...scope, snapshot: 'snapshot-002' }));
  assertClosed(store);
  assert.equal(store.history(scope).records, 0);
});

test('S03b: conflicting detail for a repeated identifier durably closes the gate', async t => {
  const f = fixture(t);
  let store = f.open();
  store.ensureHistory(scope);
  let reads = 0;
  const adapter = {
    async list(cursor) {
      return bytes({ snapshot: scope.snapshot, items: [{ id: 'event-001' }], next: cursor === null ? 'cursor-1' : null });
    },
    async detail(id) {
      reads++;
      return bytes({ snapshot: scope.snapshot, id, value: reads === 1 ? 'invented-original' : 'invented-conflict' });
    }
  };
  const result = await store.sweep(scope, adapter, { maxPages: 2, maxDetails: 2 });
  assert.equal(result.status, 'failed');
  assert.equal(result.records, 1);
  assertClosed(store);
  f.close(store);
  store = f.open();
  assert.equal(store.history(scope).status, 'failed');
  assertClosed(store);
  await store.sweep(scope, historyAdapter(records.slice(0, 1)));
  assert.equal(store.history(scope).status, 'failed');
});

test('S03c: a cursor cycle fails instead of qualifying an exhausted budget', async t => {
  const f = fixture(t);
  const store = f.open();
  store.ensureHistory(scope);
  let pages = 0;
  const adapter = {
    async list() {
      pages++;
      return bytes({ snapshot: scope.snapshot, items: [{ id: 'event-001' }], next: 'cursor-loop' });
    },
    async detail(id) { return bytes({ snapshot: scope.snapshot, id, value: 'invented' }); }
  };
  const result = await store.sweep(scope, adapter, { maxPages: 3, maxDetails: 3 });
  assert.equal(result.status, 'failed');
  assert.ok(pages <= 3);
  assertClosed(store);
});

test('S04: page and detail budgets retain partial state without opening the gate', async t => {
  const f = fixture(t);
  const store = f.open();
  const adapter = historyAdapter();
  store.ensureHistory(scope);
  const detailBound = await store.sweep(scope, adapter, { maxPages: 1, maxDetails: 1 });
  assert.equal(detailBound.status, 'incomplete');
  assert.equal(detailBound.records, 1);
  assert.equal(detailBound.counts.details, 1);
  assert.equal(store.history(scope).pendingIndex, 1);
  assertClosed(store);
  const pageBound = await store.sweep(scope, adapter, { maxPages: 1, maxDetails: 10 });
  assert.equal(pageBound.status, 'incomplete');
  assert.ok(pageBound.counts.pages <= 1);
  assert.ok(pageBound.records >= 2 && pageBound.records <= 4);
  assertClosed(store);
});

test('S04b: the injected elapsed-time budget leaves an incomplete checkpoint', async t => {
  const f = fixture(t);
  const store = f.open();
  store.ensureHistory(scope);
  let clock = 0;
  const adapter = historyAdapter();
  const list = adapter.list.bind(adapter);
  adapter.list = async cursor => {
    const response = await list(cursor);
    clock = 10;
    return response;
  };
  const result = await store.sweep(scope, adapter, { deadlineMs: 5, now: () => clock });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.complete, false);
  assert.equal(result.counts.details, 0);
  assertClosed(store);
});

test('S04 storage: an over-budget detail rolls back and resumes after reopening', async t => {
  const f = fixture(t);
  let store = f.open();
  store.ensureHistory(scope);
  const adapter = historyAdapter(records.slice(0, 2).map(record => ({ ...record, value: 'x'.repeat(100) })));
  const result = await store.sweep(scope, adapter, { maxStoredBytes: 450 });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'storage_limit');
  assert.equal(result.records, 1);
  assert.equal(store.history(scope).pendingIndex, 1);
  assertClosed(store);
  f.close(store);
  store = f.open();
  assert.equal((await store.sweep(scope, adapter)).complete, true);
  assert.deepEqual(adapter.calls.details, ['event-001', 'event-002', 'event-002']);
});

test('S04c: malformed and oversized responses cannot qualify history', async t => {
  for (const variant of ['malformed-json', 'extra-field', 'oversized-detail']) {
    await t.test(variant, async sub => {
      const f = fixture(sub);
      const store = f.open();
      store.ensureHistory(scope);
      const adapter = historyAdapter(records.slice(0, 1));
      if (variant === 'malformed-json') adapter.list = async () => Buffer.from('{"snapshot":');
      if (variant === 'extra-field') adapter.list = async () => bytes({ snapshot: scope.snapshot, items: [], next: null, surprise: true });
      if (variant === 'oversized-detail') adapter.detail = async id => bytes({ snapshot: scope.snapshot, id, value: 'x'.repeat(256) });
      const result = await store.sweep(scope, adapter, { maxResponseBytes: 128 });
      assert.equal(result.status, 'failed');
      assert.equal(result.records, 0);
      assertClosed(store);
    });
  }
});

test('S06: lost response retains uncertainty until a matching receipt is reconciled', async t => {
  const f = fixture(t);
  let store = f.open();
  store.prepareIntent('action-001', payload());
  let receipt;
  let effects = 0;
  const service = {
    async send({ id, digest }) {
      effects++;
      receipt = { id, digest, receiptId: 'receipt-001' };
      throw new Error('synthetic response loss');
    },
    async lookup() { return receipt; }
  };
  assert.equal((await store.dispatch('action-001', service)).state, 'uncertain');
  assert.equal(effects, 1);
  assert.equal(store.intent('action-001').state, 'uncertain');
  assert.equal(store.intent('action-001').consumed, true);
  f.close(store);
  store = f.open();
  await store.dispatch('action-001', service);
  assert.equal(effects, 1);
  await store.reconcile('action-001', service);
  assert.equal(store.intent('action-001').state, 'confirmed');
  await store.dispatch('action-001', service);
  assert.equal(effects, 1);
});

test('S06b: a wrong receipt cannot confirm a consumed intent', async t => {
  const f = fixture(t);
  const store = f.open();
  store.prepareIntent('action-001', payload());
  const result = await store.dispatch('action-001', {
    async send({ digest }) { return { id: 'action-other', digest, receiptId: 'receipt-002' }; }
  });
  assert.equal(result.state, 'uncertain');
  assert.equal(store.intent('action-001').state, 'uncertain');
  await assert.rejects(store.reconcile('action-001', {
    async lookup() { return { id: 'action-001', digest: '0'.repeat(64), receiptId: 'receipt-002' }; }
  }));
  assert.equal(store.intent('action-001').state, 'uncertain');
});

test('S07: two connections dispatch one durable intent at most once', async t => {
  const f = fixture(t);
  const first = f.open();
  const second = f.open();
  first.prepareIntent('action-001', payload());
  const service = new DeliverySimulator();
  await Promise.all([first.dispatch('action-001', service), second.dispatch('action-001', service)]);
  assert.equal(service.effects.length, 1);
  assert.equal(first.intent('action-001').state, 'confirmed');
  f.close(first);
  f.close(second);
  const reopened = f.open();
  await reopened.dispatch('action-001', service);
  assert.equal(service.effects.length, 1);
});

test('S10: payload identity and limits apply to the exact UTF-8 bytes retained', async t => {
  const f = fixture(t);
  const store = f.open();
  const input = Buffer.from(JSON.stringify({ message: 'invented é 🌲 "quote"' }));
  const original = Buffer.from(input);
  assert.ok(input.length > input.toString('utf8').length);
  assert.throws(() => store.prepareIntent('action-small', input, { maxBytes: input.length - 1 }));
  const intent = store.prepareIntent('action-001', input, { maxBytes: input.length });
  assert.equal(intent.state, 'pending');
  assert.equal(intent.consumed, false);
  assert.equal(store.prepareIntent('action-001', original).digest, intent.digest);
  assert.throws(() => store.prepareIntent('action-001', Buffer.concat([original, Buffer.from(' ')])));
  input.fill(0);
  let sent;
  await store.dispatch('action-001', {
    async send({ id, digest, payload: sentPayload }) {
      sent = Buffer.from(sentPayload);
      return { id, digest, receiptId: 'receipt-001' };
    }
  });
  assert.deepEqual(sent, original);
  assert.equal(store.intent('action-001').state, 'confirmed');
});

for (const mode of ['before-send', 'after-acceptance']) {
  test(`S05/S06 process: abrupt exit ${mode} preserves the consumed attempt`, async t => {
    const f = fixture(t);
    const receiptPath = join(f.root, 'simulated-receipt.json');
    const child = fileURLToPath(new URL('./crash-child.mjs', import.meta.url));
    const result = spawnSync(process.execPath, ['--no-warnings', child, f.db, mode, receiptPath, f.token], {
      env: { TEMP: dirname(f.root), TMP: dirname(f.root) },
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
      maxBuffer: 4096
    });
    assert.equal(Boolean(result.error), false, 'synthetic child could not finish within its bound');
    assert.equal(result.signal, null, 'synthetic child was terminated unexpectedly');
    assert.equal(result.status, 86, 'synthetic child did not reach the requested interruption');
    const store = f.open();
    const intent = store.intent('action-crash-001');
    assert.equal(intent.state, 'uncertain');
    assert.equal(intent.consumed, true);
    let extraEffects = 0;
    const service = {
      async send() { extraEffects++; throw new Error('unexpected second effect'); },
      async lookup() { return JSON.parse(readFileSync(receiptPath, 'utf8')); }
    };
    await store.dispatch('action-crash-001', service);
    assert.equal(extraEffects, 0);
    assert.equal(existsSync(receiptPath), mode === 'after-acceptance');
    if (mode === 'after-acceptance') {
      await store.reconcile('action-crash-001', service);
      assert.equal(store.intent('action-crash-001').state, 'confirmed');
    } else {
      assert.equal(store.intent('action-crash-001').state, 'uncertain');
    }
  });
}
