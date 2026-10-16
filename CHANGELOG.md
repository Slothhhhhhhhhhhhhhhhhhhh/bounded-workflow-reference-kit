# Changelog

## 0.1.0 - 2026-10-16

- Added a newly written Node.js/SQLite core for resumable acquisition, a completeness gate and durable dispatch uncertainty with duplicate suppression.
- Added local history/delivery simulators, an in-memory demo, interruption/reopen tests and two controlled fresh-process crash cases.
- Qualified the initial core on Node.js 22.17.1 and SQLite 3.50.0 on Windows x64: syntax checks, demo and 19/19 focused tests passed. Independent review identified detail-key-order normalization and request-counter accuracy defects; both were corrected and the expanded 21/21 suite passed. A separate stale-sweep regression was then added and qualified as recorded in the evidence receipt.
- Updated public evidence to describe only the kit's own execution. Originating-system outcome tracking remains private.
- Kept terminal cleanup, trusted platform admission and general resource supervision deferred.
- No npm dependencies, vendored runtime, business code or provider integration were added.
- Adopted MIT with the owner-selected Guntersville Getaway LLC notice for this standalone package. External runtime and other-source rights remain separate.

Earlier documentation-only preparation established the design and disclosure boundary. A final production update may be added only when production is separately verified; package publication or a local pass is insufficient.
