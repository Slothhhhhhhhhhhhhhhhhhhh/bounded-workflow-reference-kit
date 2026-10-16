# Bounded Workflow Reference Kit

A small runnable example of resumable history acquisition and durable local duplicate-send suppression. All records and effects are synthetic. No network, provider account, credential or package installation is needed.

**Version 0.1.0.** Licensed under [MIT](LICENSE). No production or exactly-once remote-delivery claim is made.

## Run

Use an existing Node.js installation with `node:sqlite`. The candidate is qualified on Node.js 22.17.1, bundled SQLite 3.50.0, Windows x64. SQLite emits an experimental-feature warning in that Node version. From this directory:

```sh
node demo.mjs
node --test --test-concurrency=1 test/core.test.mjs
```

The demo uses an in-memory store and prints three bounded sweeps over five invented events, then one simulated effect despite two dispatch requests. The test suite uses small temporary databases and controlled child-process exits to exercise persistence. It removes only its own temporary fixtures. See the [evidence matrix](docs/EVIDENCE-MATRIX.md) for the actual executed scope and limitations.

## Implemented core

| Mechanism | Behavior |
| --- | --- |
| Resumable acquisition | Persist a pending page, then each detail and its next index in one transaction; resume from the last committed detail. |
| Completeness gate | `qualifiedRecords(scope)` refuses incomplete or failed history. Completion means exhaustion of the simulator's immutable snapshot response chain. |
| Bounded work | Per-sweep page/detail/response-byte/time limits and a logical retained-data ceiling; budget stops preserve committed progress. |
| Conflict refusal | Scope changes, conflicting duplicate event bodies, malformed responses and cursor cycles cannot qualify the history. |
| Durable intent | Copy exact request bytes into SQLite, consume the attempt before calling the simulator and suppress all later automatic dispatches for that action. |
| Explicit uncertainty | Lost responses and interrupted attempts stay uncertain across reopen; matching simulated receipt lookup can reconcile them. |

These are two independent building blocks. Dispatch is not automatically tied to history; an application requiring history qualification must call the completeness gate before preparing its dependent action. The reference does not implement business approval or remote receipt authentication.

The core uses file-backed SQLite with WAL and FULL synchronous settings for durable tests. The demo's in-memory database is not durable. There are no third-party package dependencies or business-source files. See [dependency provenance](DEPENDENCIES.md).

## Scope and limits

This version does not implement lease-protected terminal closure, platform admission, a general resource supervisor, provider adapters, production deployment or power-loss certification. Those design topics are recorded as deferred. Cancellation is cooperative; an in-process adapter can ignore an abort signal or block the event loop. Response-size checks bound accepted bytes after receipt, not memory a malicious adapter may allocate.

Consuming an attempt before dispatch can omit an effect if the process exits before the simulator is called. This is intentional: the journal prefers an explicit uncertain outcome to an automatic duplicate. It cannot atomically commit a downstream effect and a local confirmation.

## Review the candidate

- [API and state transitions](docs/API.md)
- [Failure model](docs/FAILURE-MODEL.md)
- [Synthetic scenarios](docs/SYNTHETIC-SCENARIOS.md)
- [Executed evidence](docs/EVIDENCE-MATRIX.md)
- [Sequencing lessons](docs/SEQUENCING-LESSONS.md)
- [Provenance](PROVENANCE.md) and [changelog](CHANGELOG.md)

The MIT notice names Guntersville Getaway LLC for this standalone kit. It does not assign rights in any other repository or runtime. Package metadata keeps `private: true` to prevent accidental npm publication; it does not restrict use under the license.
