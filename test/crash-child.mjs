import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/workflow.mjs';

// Invoked only by the test runner. No inherited provider configuration is used.
const [dbArgument, mode, receiptArgument, token] = process.argv.slice(2);
const db = resolve(dbArgument ?? '.');
const root = dirname(db);
const receiptPath = resolve(receiptArgument ?? '.');
if (!['before-send', 'after-acceptance'].includes(mode)
    || dirname(root) !== realpathSync(tmpdir())
    || !basename(root).startsWith('bounded-kit-test-')
    || realpathSync(root) !== root
    || db !== join(root, 'workflow.sqlite')
    || receiptPath !== join(root, 'simulated-receipt.json')
    || readFileSync(join(root, '.reference-kit-test-owner'), 'utf8') !== token) {
  throw new Error('unrecognized synthetic child fixture');
}

const store = new Store(db);
store.prepareIntent('action-crash-001', Buffer.from(JSON.stringify({ document: 'sample-document-001', message: 'invented' })));
await store.dispatch('action-crash-001', {
  async send({ id, digest }) {
    const receipt = { id, digest, receiptId: 'receipt-crash-001' };
    // This is a deliberately tiny synthetic acceptance ledger, not a provider.
    writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', flush: true });
    return receipt;
  }
}, {
  hook(stage) {
    if ((mode === 'before-send' && stage === 'after_attempt_commit')
        || (mode === 'after-acceptance' && stage === 'after_effect')) {
      process.exit(86);
    }
  }
});
store.close();
throw new Error('synthetic interruption hook was not reached');
