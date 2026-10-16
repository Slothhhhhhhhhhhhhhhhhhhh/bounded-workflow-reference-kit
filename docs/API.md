# API and state transitions

Import `Store` from `src/workflow.mjs`. Open a dedicated new SQLite database; do not point this reference at another application's store. The example assumes trusted local callers and an intact database. It has no user authentication, migration framework or hostile-database parser.

## History

`ensureHistory(scope)` creates an incomplete acquisition or verifies an existing scope. A scope is exactly `{id, snapshot, query}`. IDs are ASCII letters/digits/underscore/hyphen, at most 64 characters; the query is at most 256 JavaScript characters. Reusing an ID with changed scope fields is refused.

`await sweep(scope, adapter, options)` acquires one bounded increment. `adapter.list(cursor, {signal})` returns compact UTF-8 JSON bytes shaped as `{snapshot, items:[{id}], next}`. The first cursor is null; `next: null` ends the chain. `adapter.detail(id, {signal})` returns bytes shaped as `{snapshot, id, value}`, where value is a string. The simulator's snapshot is immutable. Matching snapshot labels are an adapter promise, not proof of a real provider's completeness.

Responses must be byte arrays containing the exact compact `JSON.stringify` representation. Extra keys, duplicate JSON keys, whitespace variations, invalid UTF-8, unexpected snapshots and malformed shapes are refused. This deliberately narrow wire contract belongs to the simulator, not a general external JSON API.

| Option | Default | Maximum |
| --- | --- | --- |
| `maxPages` | 1 | 100 per sweep |
| `maxDetails` | 2 | 1000 per sweep |
| `maxResponseBytes` | 4096 | 1048576 per response |
| `maxStoredBytes` | 16384 | 4194304 logical bytes |
| `deadlineMs` | 1000 | 10000 per sweep |

All limits are positive integers. Page/detail counters count attempted reads within this sweep. The storage estimate includes record JSON, record identifiers/digests, scope JSON, pending-page JSON and cursor-history JSON; it is not physical database or WAL size. Work may resume under a different explicitly supplied budget, but never under a changed scope. A storage-limit stop does not delete retained data.

`now` is an injectable clock, and `hook(stage)` is a synchronous fault-injection callback. Stages are `after_page_commit`, `before_detail_commit` and `after_detail_commit`. They exist for deterministic tests, not authorization. Unexpected adapter errors and injected exceptions propagate with the last committed checkpoint retained. Known format/conflict faults persist `failed`; budget expiry returns `incomplete`. Completed and failed scopes do not perform further acquisition.

`history(scope)` reports status, reason, revision, record count, current cursor and pending-page index. `qualifiedRecords(scope)` returns records only when status is complete. A completion check does not send or authorize anything. Concurrent sweeps use revision checks and reject stale progress rather than silently overwrite another writer; a caller may inspect and resume separately.

## Intent journal

`prepareIntent(id, payloadBytes, {maxBytes=4096})` copies exact bytes and their digest. Repeating the same ID/bytes returns the existing intent. Changed bytes are refused. The maximum configurable payload limit is 1048576 bytes. Encoding and application schema are the caller's responsibility.

`await dispatch(id, service, {hook})` performs an immediate SQLite transaction to consume an unconsumed intent and set its state to `uncertain` before calling `service.send({id,digest,payload})`. Later dispatch calls never send that consumed intent again. The simulator deliberately accepts duplicate calls so the journal's suppression is observable.

A matching `{id,digest,receiptId}` receipt changes the state to `confirmed`. This means receipt-confirmed simulated acceptance, not real recipient delivery. Transport errors or malformed acknowledgements leave the consumed state uncertain. `hook` stages `after_attempt_commit` and `after_effect` interrupt before the next operation and are used by the crash fixtures.

`await reconcile(id, service)` calls `service.lookup({id,digest})` and validates a returned receipt's binding. No receipt leaves uncertainty unchanged; conflicting receipts are refused. Lookup is a trusted local simulator interface. The code does not authenticate remote claims or prove that a malicious service told the truth.

The implemented intent states are `pending`, `uncertain` and `confirmed`, with a durable consumed flag. There is no automatic retry/reset method, lease, cancellation or retention deletion. A consumed uncertain intent can represent either zero effects or an effect whose acknowledgement was lost. `close()` closes the database connection; it is not terminal trial cleanup.
