# Synthetic scenario specification

These are the original invented scenario requirements. The evidence matrix maps the implemented subset to actual executed tests. A case listed here is not by itself a passed test. Lease/terminal-closure and platform/resource-supervisor cases remain deferred.

## Shared model

- Workspace `Cedar`, actors `Birch`, `Maple`, `Elm`; no real recipient addresses.
- Actions `action-001` through `action-003`, payload `sample-document-001`, and scope `scope-001`.
- A simulator with five immutable records `event-001` through `event-005`, pages of two, and an explicit terminal response. A separate mode deliberately changes history or returns a repeated cursor.
- The implemented SQLite store has action identity, exact request digest, attempt-consumed flag, outcome, checkpoint revision and exact scope binding. Work leases and terminal-closure receipts remain deferred.
- Example limits: one list page and two detail reads per sweep, three sweeps per scenario, 4 KiB per simulated response and 16 KiB retained checkpoint. These numbers are invented test inputs, not operational recommendations or measured limits.
- A controllable clock for deterministic lease/deadline assertions. Real wall-clock, resource and subprocess observations must be labeled separately from simulated time.

## Cases and observable oracles

| Case | Input or injected fault | Required result |
| --- | --- | --- |
| S01 | Read five records with the small per-sweep budget. | First two sweeps remain incomplete; final chain exhaustion qualifies only the declared scope. Stored IDs equal the expected five exactly once. |
| S02 | Stop after the first detail of a page, close/reopen the store, then resume. | Last committed detail remains; next uncommitted detail is acquired; no cursor skips an uncommitted record. If a request outcome is unknown, report it explicitly. |
| S03 | Change scope or checkpoint revision, repeat a cursor, or replace an existing record's payload. | Reject the mismatch/cycle/conflict; no success transition; preserve prior evidence and the reason. |
| S04 | Return a plausible matching success event but stop before chain exhaustion. | Store progress and conflict evidence as allowed; leave the success gate closed. |
| S05 | Commit the consumed attempt, then crash before simulator invocation. | Reopen as uncertain/consumed; no automatic second dispatch. This deliberately exposes the possible-omission tradeoff. |
| S06 | Simulator accepts the effect, then loses the response before local confirmation. | Reopen as uncertain; reconcile the same action's authoritative simulated receipt; no extra effect. |
| S07 | Two workers claim the same action; repeat after reopening. | One local claim wins; request digest mismatch is rejected; consumed attempt never becomes pending solely because a lease expired. |
| S08 | Request terminal closure during an active work lease. | Refuse without changing control, gate, counters or receipt state. |
| S09 | Close an expired interrupted run; inject failure between control and gate updates; retry closure; alter a receipt. | Atomic rollback on injection; successful closure preserves attempts and diagnostics; repeat is stable; tampering refuses. Closure never implies successful delivery. |
| S10 | Serialize a payload with escaped quotes and multibyte text immediately below, at and above a byte limit. | Admission follows encoded byte length; the consumed digest matches the validated bytes. Mutation after validation fails. |
| S11 | Use an unsupported capability profile or missing trusted input binding. | Refuse before store creation, process start or simulated effect; record the precise unsupported requirement. |
| S12 | Simulated slow read, excessive output, memory growth, uncertain child exit and stale process identity. | Stop within the enforceable declared bounds; preserve the first fault; distinguish sampled memory from enforced limits and zero RSS from confirmed exit. Never certify completion without the required exit/readback evidence. |

## Minimal public receipt

For each executed case, retain case ID, kit version, runtime/platform, fixture seed, injected fault, configured limits, attempted calls, accepted simulated effects, final state, observed resource values, assertion outcome and limitations. Do not record ambient environment variables, host paths, credentials or raw external payloads. Publish synthetic evidence only after reviewing the exact output.

Fast deterministic cases precede fresh-process crash cases. Repeat a case only for a relevant change, failure or unresolved concern. See EVIDENCE-MATRIX.md for executed, failed and unrun coverage; S08-S09 and S11-S12 are not claimed as implemented.
