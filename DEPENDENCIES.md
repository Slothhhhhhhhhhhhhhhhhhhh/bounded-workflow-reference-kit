# Dependency provenance

The kit uses only Node.js built-in modules. There are no npm dependencies, downloaded packages, vendored libraries or copied runtime binaries. Running it requires an existing Node.js installation with `node:sqlite` available. Do not run an install command for this candidate.

The implementation was authored for this kit from documented invariants and invented fixtures. No business source module, test fixture, repository history or operational script was copied or adapted. Prior source inspection informed the concepts; this is not a certified clean-room claim.

Runtime admission was checked on Node.js 22.17.1, bundled SQLite 3.50.0, Windows x64. `node:sqlite` is experimental in that runtime. The `engines` field expresses a minimum requirement, not verification of every newer Node version or platform. Runtime upgrades need relevant requalification.

Node.js and its bundled SQLite implementation are external runtime components, governed by the notices shipped with the user's installation. They are not redistributed in this candidate. Their complete notices and any future dependencies must be reviewed if a later package bundles them. This candidate does not assign a new license to those components.

Built-in imports in the implementation: `node:sqlite`, `node:crypto`, `node:util`. Tests additionally use built-in test/assert, filesystem, path, operating-system, URL and child-process utilities as declared in their source. The simulator has no network or credential interface.

CI invokes official `actions/checkout` and `actions/setup-node` at full commit pins verified against their v4 refs during release preparation. Their implementations are fetched by GitHub's runner and are not vendored into the kit. CI uses standard Windows runners, read-only repository permissions, a five-minute job limit and no deployment credentials. Local commands need neither action nor network.

The kit is released under the [MIT license](LICENSE) with the owner-selected Guntersville Getaway LLC notice, covering this newly authored standalone package. This notice is not an assignment of anyone else's rights. No concrete copied-source or vendored-dependency ownership gap was identified in the bounded review. `private: true` remains in package metadata to prevent accidental npm publication.
