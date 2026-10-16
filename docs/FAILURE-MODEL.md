# Failure model

This candidate implements a small trusted-local-caller model with an immutable synthetic history source, SQLite storage and a simulated delivery service. It has no provider integration. New-kit evidence is recorded separately from the originating system that motivated these concepts.

## Acquisition and completeness

The pending page is committed before its details. Each detail and its next pending-page index commit together. Only after all required details commit may the cursor advance. A crash before a detail commit repeats that read; a crash afterward resumes at the next detail. Read duplication is acceptable; skipping committed progression is not.

Page/detail/time/storage budgets yield incomplete state. The gate stays closed even if a plausible success event has already been observed. Scope mismatch, conflicting duplicate bodies, invalid response shape and cursor cycles refuse completion. A terminal response establishes only exhaustion of the adapter's declared immutable snapshot. It cannot prove provider retention, historical completeness or coverage of a changing source.

SQLite transactions and checkpoint revisions prevent a concurrent stale sweep from overwriting new progress. This is not a distributed acquisition lease. Unknown adapter errors retain the last checkpoint and propagate; they are not automatically relabeled as a safe completed sweep.

## Durable uncertainty and duplicate suppression

| Boundary | Durable result and recovery |
| --- | --- |
| Before intent commit | No intent exists. A trusted caller may prepare it. |
| Pending intent before claim | A caller may dispatch it. |
| After attempt commit, before simulated effect | Consumed and uncertain; automatic redispatch is suppressed, even if no effect occurred. |
| Effect accepted, response lost or process exits | Consumed and uncertain; matching receipt lookup can reconcile. |
| Exact receipt committed | Confirmed simulated acceptance; subsequent dispatch is suppressed. |
| Conflicting request bytes or receipt | Refused; previously retained state is preserved. |

The local claim uses `BEGIN IMMEDIATE` before reading and updating the intent. The exact stored request bytes are hashed and copied before delivery. The remote call occurs after commit, so there is an unavoidable gap. This policy cannot provide exactly-once delivery or guaranteed eventual delivery. An uncertain intent may represent either omission or an unacknowledged effect.

The receipt interface is trusted simulation. Matching identity and digest do not authenticate a real provider. No arbitrary manual success flag is offered, but a caller able to replace the adapter or modify the database is outside the threat model.

## Persistence and resource limits

File-backed tests request WAL and FULL synchronous mode. Reopen/process-exit tests establish only the exercised crash boundaries on the recorded runtime. They do not establish power-loss behavior, storage failure, corruption recovery, network-filesystem support or backup restoration. Losing or replacing the journal can also lose suppression history. No retention feature deletes it.

The sweep deadline races an asynchronous operation and passes an abort signal. An adapter that ignores cancellation can continue working after the caller returns, and blocking JavaScript can prevent the timer from firing. This is not a kernel-enforced deadline or memory quota. Byte ceilings limit accepted responses and logical retained content, not pre-receipt allocations or physical SQLite files. Tests use small bounded fixtures and no network.

## Deferred mechanisms

Lease-protected independent terminal cleanup, trusted platform admission, authentication, a process/resource supervisor and production adapters are not implemented or qualified here. Future terminal cleanup would need identity/lease reads under an immediate transaction, atomic fencing, preserved uncertainty and verified repeatable readback; closing a SQLite connection is not that operation.

The current payload feature validates exact byte limits and immutable reuse. It does not implement a general schema validator, native bundle serializer or cross-platform admission system. The evidence matrix labels these distinctions explicitly.
