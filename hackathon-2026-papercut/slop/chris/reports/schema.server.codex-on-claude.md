# Papercut tracker schema: Codex review of Claude's review

Review of [Claude's server schema review](schema.server.claude.md), checked against `server.py`, `import_local.py`, and the read-only `populated.sqlite3` on 2026-09-23. The server and importer are unchanged between the review's cited commit `3e11a2a1183` and current HEAD `28617639c2b8`.

## Assessment

Claude's review gets the central design right: preserve reports as evidence, treat issues as groupings, and keep similarity links separate from exact grouping. Its recommendation to retain the submitted fingerprint, category, and raw payload is the right immediate step. The current database has 139 issues and 277 reports; all issue fingerprints start with `local-papercuts:`.

I would change the following claims and recommendations before implementing regrouping.

### 1. Backfill the submitted category only where it is known

[Claude proposes](schema.server.claude.md#L92-L95) copying each issue's fingerprint and category to its reports, saying the importer always sent both. The fingerprint part is recoverable for this database: the importer always supplies `local-papercuts:{slug}`, and exact fingerprint matching puts those reports in the corresponding issue.

The category part is false. `parse_codex` can return `None` for category, and the importer sends `category` [only when it is truthy](../../../import_local.py#L201). The current `provenance-alias` and `active-search-table` Codex writeups send no category, while their issues have `code-smell`, consistent with the server's classifier. Copying `issues.category` would turn a server guess into a supposed reporter claim. An issue category may also have been changed later through triage.

Backfill explicit categories from a known version of the source writeups where possible. Leave the rest null or mark them as inferred. Keep `submitted_category` distinct from the issue's current triage category.

### 2. Do not inherit triage state by report majority

[Claude's proposed rule](schema.server.claude.md#L96-L102) gives a new group the status of whichever old issue contributed most reports and remaps manual relations. A status such as `resolved` is a judgment about the old group's scope. After a split, the majority can be resolved while the minority remains open. A manual A–B link also has no unambiguous destination when A splits into A1 and A2.

Carry status and manual links forward automatically only when the relevant group's membership and meaning are unchanged. Preserve old decisions as history and put changed groups or ambiguous links back in a triage queue. A deterministic majority can be a suggestion, but should not silently become the new decision.

### 3. Regrouping needs a lookup for every accepted fingerprint

The review explains how to carry state across a regroup but does not say how a later report finds a manually merged issue. `UNIQUE(repository, fingerprint)` currently allows only one key on an issue. If fingerprints A and B are merged into one issue, a later B report must resolve to that same issue. An `issue_fingerprints` mapping with unique `(repository, fingerprint)` and an `issue_id` foreign key allows multiple keys to point to one issue. The report's original submitted fingerprint should remain on the report regardless of its current assignment.

### 4. Recompute derived group data after assignments move

[The review's defense of cached seen times](schema.server.claude.md#L54-L56) covers out-of-order inserts, but not moving reports between issues. Regrouping must recalculate `first_seen` and `last_seen` for affected groups from their reports. Counts are already queried from reports. Suggested relations also need removal or recomputation: `_suggest_relations` runs only when an issue is created and scores its then-current title and path. A moved, merged, or retitled group can leave obsolete suggestions. Manual relations need separate review as above.

### 5. Qualify the raw-data and retry claims

The claim that ["raw data is never lost"](schema.server.claude.md#L39-L42) conflicts with the review's own findings: ingest trims text and drops the submitted fingerprint, category, and unknown fields. The current table preserves selected report fields, not the raw submission. That wording matters because faithful input is the basis for later reclassification.

[The idempotency section](schema.server.claude.md#L46-L50) is also broader than the guarantee. A stable `report_id` prevents duplicate rows, but reusing an ID for a different fingerprint silently returns the earlier issue. Detect a changed grouping key on replay. Do not reject every content difference: the importer reuses its report ID when a writeup's description is edited. Decide separately whether edited text updates an existing report, is recorded as a revision, or is reported as a difference.

## Recommended order

1. Save the raw submitted payload and explicit reporter fields on each report, with structured source references.
2. Backfill only values that can be proved from the current data or pinned source artifacts; mark inferred values.
3. Add fingerprint aliases before allowing manual merges.
4. Implement regrouping as a transaction that moves assignments, recalculates seen times, refreshes suggested links, and queues ambiguous triage decisions for review.

The updated Claude review correctly calls the two `machine_id` values **reporter labels** rather than physical machines. Its migration and database-constraint suggestions are sensible later steps for a durable or multi-writer service.
