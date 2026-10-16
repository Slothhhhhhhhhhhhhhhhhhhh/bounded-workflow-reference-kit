import { Store } from './src/workflow.mjs';
import { HistorySimulator, DeliverySimulator } from './src/simulator.mjs';

// An in-memory demonstration; on-disk reopen/crash behavior is covered separately by tests.
const store = new Store(':memory:');
try {
  const scope = { id: 'scope-001', snapshot: 'snapshot-001', query: 'Cedar sample' };
  const history = new HistorySimulator(Array.from({ length: 5 }, (_, index) => ({
    id: `event-00${index + 1}`, value: `invented-${index + 1}`,
  })));
  const sweeps = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    sweeps.push(await store.sweep(scope, history));
    if (sweeps.at(-1).complete) break;
  }
  const qualified = store.qualifiedRecords(scope).map(record => record.id);
  const delivery = new DeliverySimulator();
  store.prepareIntent('action-001', Buffer.from('Cedar sample document'));
  const first = await store.dispatch('action-001', delivery);
  const duplicate = await store.dispatch('action-001', delivery);
  console.log(JSON.stringify({ sweeps, qualified, firstState: first.state,
    duplicateState: duplicate.state, acceptedSimulatedEffects: delivery.effects.length }, null, 2));
} finally { store.close(); }
