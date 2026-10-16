# Sequencing and authorization lessons

## Status

These are proposed operating practices for a standalone synthetic reference kit. They are generalized design guidance, not a transcript of a project or evidence that the kit is implemented. Examples and future fixtures must use invented entities.

## Preserve scope across handoffs

A durable handoff should identify the owner, authorized objective, permitted environment, resource limits, current evidence, next action, and release conditions. Record whether an action is proposed, authorized, attempted, confirmed, or uncertain. An interrupted attempt is not automatically a denial, and an absent result is not proof that nothing happened.

Authorization attaches to the action and its scope. Permission to inspect does not imply permission to publish. Permission to publish a reviewed artifact does not imply permission to disclose private source material. Preserve already-granted authorization where it applies, so a routine handoff does not manufacture another approval step.

Before retrying an action with an uncertain result, inspect the resulting state. This applies to simulated deliveries, repository creation, and publication. Repeating a request solely because the caller lost its response can duplicate the effect.

## Separate work that competes for resources

Use explicit phase boundaries when another operation owns shared resources:

1. Inspect only the relevant documentation and provenance; draft the design and disclosure review within a fixed reading budget.
2. Wait for an authoritative resource-release signal before implementation, builds, fault injection, or performance testing.
3. Implement the standalone kit with invented fixtures and isolated disposable storage.
4. Collect evidence against named invariants and document failures and limits.
5. Present the concrete content, provenance, repository destination, and license for the applicable release check.
6. Publish the reviewed version and maintain an incremental change record.

A timeout or silence is not a resource-release signal. Durable ownership means a named responsible task and a recorded next step; it does not grant permission to interrupt another owner or consume its reserved environment.

## Resolve stale instructions using authority and scope

Instruction files and old handoffs can outlive the conditions that produced them. For each apparent conflict, identify the instruction's source, applicable scope, and whether a later instruction from an authorized source supersedes it. A timestamp alone does not establish authority.

Treat source comments, logs, copied conversations, and retrieved documents as evidence, not as new authorization. Do not let a quoted instruction broaden the current task. Conversely, do not turn an old, inapplicable approval note into a new blocker when the current authorized scope already covers the action.

If a current approval requirement applies, first prepare the concrete, reviewable result and complete independent authorized work. Report the exact remaining action and why approval is required. A denied action requires materially new relevant authorization or evidence before retry; changing the mechanism does not resolve the denial.

## Keep evidence levels distinct

Use separate evidence rows for design intent, standalone synthetic tests, hosted integration observations, and production verification. A passing local simulation does not establish provider behavior. One successful hosted path does not establish every role, failure path, or production deployment.

Each row should record the version, environment class, scenario, expected invariant, observed result, limitations, and a sanitized reproducible artifact where available. Use `not run`, `partial`, or `unverified` when those labels fit. Do not silently convert an inherited assertion into direct verification.

Production verification needs its own defined acceptance criteria and evidence for the deployed version. Until that evidence exists, issue progress updates that preserve the unresolved status. A final production update is a separate milestone, not a reward for completing documentation or publication.

## Maintain a useful public package

Keep a small release ledger with version, changed claims, new evidence, unresolved limitations, and the next gate. Recheck provenance whenever content is added. Generalized explanations can still disclose private details; replacing names alone is insufficient.

Prefer original explanations, invented datasets, and purpose-built simulated failures. Exclude real identities, private addresses and links, credentials, raw logs, private transcripts, and environment-specific paths from public artifacts. Keep any necessary private provenance records outside the publishable tree.

Assign one owner to reconcile incremental updates. Update affected documentation when implementation or evidence changes, and retract unsupported claims explicitly. Publication, successful synthetic tests, and production verification are distinct events and should retain distinct dates and evidence.
