# Evidence matrix

Local qualification recorded 2026-10-16 UTC. This matrix reports this kit's own execution only. Source-system outcomes remain in private review records and do not count toward these results.

## Executed environment and commands

Node.js 22.17.1, bundled SQLite 3.50.0, Windows x64. No dependency installation, provider calls, WSL or system changes were used. The runtime emits an experimental SQLite warning.

From the candidate root:

```sh
node --check src/workflow.mjs
node --check src/simulator.mjs
node demo.mjs
node --test --test-concurrency=1 test/core.test.mjs
```

Syntax checks and demo passed. The initial suite passed 19/19 tests. Independent review then reproduced two defects not covered by that suite: equivalent detail fields in a different order caused a false conflict, and a deadline-expired request was counted before invocation. Both were corrected. The expanded full suite passed **21/21 tests** (18 top-level cases including three nested malformed-response cases), with zero failed, cancelled, skipped or todo tests. A further targeted stale-sweep regression passed 1/1; the final file therefore contains 22 tests, of which 21 ran together and the added case ran separately on unchanged implementation bytes.

The full runs took 888.6547 ms initially and 996.4088 ms after correction; the final targeted run took 100.9015 ms. These are observations, not performance guarantees. The two child exits with code 86 were intentional injected faults and their parent recovery assertions passed.

See the compact [local receipt](../evidence/local-results.json). No raw process logs, host paths or business records are packaged.

The CI workflow repeats syntax checks, the full focused suite and demo on Windows with Node.js 22.17.1. It uses read-only repository permissions and pinned official actions. Workflow configuration is not a passed run; consult the run associated with the exact repository commit for hosted CI results. Hosted CI is still synthetic testing, not production verification.

## Coverage

| Cases | Executed assertions | Result and limits |
| --- | --- | --- |
| S01 | Five records acquired in three bounded sweeps; gate closed for the first two, open only after exhaustion; completion survives reopen. | Passed for immutable synthetic snapshot. No remote coverage claim. |
| S02a-S02b | Interrupt after detail commit and before detail commit; close/reopen; resume the next detail or replay only the uncommitted detail. | Passed. Injected exceptions plus separate process-exit intent tests; no acquisition power-loss certification. |
| S03a-S03c | Scope changes refuse; conflicting repeated IDs durably fail; cursor cycle fails without opening gate. | Passed. No hostile-database tampering model. |
| S04 variants | Page/detail/time/storage limits retain incomplete state; storage overflow rolls back; malformed JSON, extra keys and oversized detail fail. | Passed. Time case uses an injected clock; no hard resource enforcement claim. |
| S05/S06 process | Fresh child exits immediately after attempt commit or after simulated acceptance; parent opens persisted store and cannot redispatch. | Passed in two child processes. Receipt evidence is synthetic. |
| S06/S06b | Lost response preserves uncertainty; matching lookup reconciles; mismatched receipt cannot confirm. | Passed. Lookup is a trusted local interface, not provider authentication. |
| S07 | Two SQLite connections race dispatch for one action; only one simulated send; reopen retains suppression. | Passed within one process with concurrent async calls; simultaneous multi-process writer stress is unrun. |
| S10 subset | Exact UTF-8 byte length, immutable payload copy, changed-byte refusal and repeated preparation. | Passed for byte admission. General schema/native serializer/platform admission is unimplemented. |
| R01-R02 | Equivalent detail key orders deduplicate; deadline expiry before adapter invocation reports zero request attempts. | Passed in the expanded full suite after independent review corrections. |
| R03 | A stale worker receives malformed data after another connection completes; it cannot replace the completed checkpoint with failed state. | Passed in a separate targeted run using two connections and controlled asynchronous ordering. |
| Demo | Three sweeps retain 2, then 4, then 5 records; duplicate dispatch leaves one simulated effect. | Passed with an in-memory store; persistence evidence comes from tests above. |

## Unimplemented or unrun

- S08-S09: independent terminal closure and work leases.
- S11: trusted platform admission and native bundle placement.
- S12: process/resource supervisor, RSS measurements and enforced resource isolation.
- General remote receipt authentication, provider integration and business approvals.
- Power loss, corrupt or lost storage, backup restoration, network filesystems, other OS/runtime versions and simultaneous multi-process contention.
- Hosted deployment, complete source-system journeys and production readiness.

The runnable core deliberately omits these mechanisms. A design scenario or source-inspection observation is not a passed kit test. Suite executions had no failures, but independent probes found the two defects above before correction. Prior successful tests did not establish those properties. Future corrections and reruns must be appended rather than silently replacing prior results.
