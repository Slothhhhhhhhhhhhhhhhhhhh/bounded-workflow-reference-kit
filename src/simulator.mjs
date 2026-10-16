/** Deliberately local fixtures. These adapters do not import network or filesystem APIs. */
export class HistorySimulator {
  constructor(records, { snapshot = 'snapshot-001', pageSize = 2 } = {}) {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('invalid_page_size');
    this.records = structuredClone(records);
    this.snapshot = snapshot;
    this.pageSize = pageSize;
    this.counts = { pages: 0, details: 0 };
  }
  async list(cursor) {
    const offset = cursor === null ? 0 : Number(/^cursor-(\d+)$/.exec(cursor)?.[1]);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > this.records.length) throw new Error('invalid_cursor');
    this.counts.pages++;
    const end = Math.min(offset + this.pageSize, this.records.length);
    return Buffer.from(JSON.stringify({ snapshot: this.snapshot,
      items: this.records.slice(offset, end).map(row => ({ id: row.id })),
      next: end === this.records.length ? null : `cursor-${end}` }));
  }
  async detail(id) {
    this.counts.details++;
    const row = this.records.find(record => record.id === id);
    if (!row) throw new Error('missing_record');
    return Buffer.from(JSON.stringify({ snapshot: this.snapshot, id, value: row.value }));
  }
}

export class DeliverySimulator {
  constructor() { this.effects = []; }
  async send({ id, digest, payload }) {
    const receipt = { id, digest, receiptId: `receipt-${this.effects.length + 1}` };
    // Deliberately accepts duplicate calls, so duplicate prevention must come from the journal.
    this.effects.push({ ...receipt, payload: Buffer.from(payload) });
    return receipt;
  }
  async lookup({ id, digest }) {
    const matches = this.effects.filter(effect => effect.id === id && effect.digest === digest);
    if (matches.length > 1) throw new Error('ambiguous_simulated_receipt');
    if (!matches.length) return null;
    return { id, digest, receiptId: matches[0].receiptId };
  }
}
