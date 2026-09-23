# Papercut tracker server schema: findings and suggestions

Based on `hackathon-2026-papercut/server.py`, `README.md`, and `import_local.py` on the `hackathon-2026-papercut` branch (reviewed 2026-09-23).

## Design goal

Keep every submitted report as evidence. An issue is the current grouping and triage decision over those reports; its membership can change when a classifier improves or a person corrects the grouping. A related-issue link is a suggestion or association, not a merge.

## Current schema

| Table | Contents | Key constraints |
| --- | --- | --- |
| `issues` | Repository, fingerprint, representative title/description/path, category, status, first and last seen | `id` primary key; unique `(repository, fingerprint)` |
| `reports` | Assigned `issue_id`, repository, machine ID, optional report ID, trimmed title/description/path, receive time, optional observation time | `id` primary key; foreign key to `issues`; unique `(repository, machine_id, report_id)`; index on `issue_id` |
| `relations` | Two issue IDs, `source` (`suggested` or `manual`), optional similarity score | Primary key `(issue_a, issue_b)`; `issue_a < issue_b` prevents reverse duplicates |

Ingest computes a default fingerprint from normalized path and title unless the caller supplies one. `(repository, fingerprint)` identifies an exact group. A stable report ID within a repository and machine makes retries idempotent; a null report ID allows repeated submissions. New issues receive similarity-based relation suggestions within their repository, without combining reports. Issue lists compute report count and distinct `machine_id` count from `reports`; `first_seen` and `last_seen` are stored on `issues` and updated from `observed_at` or receive time. Ingest uses an immediate transaction, foreign keys are enabled per connection, and SQLite runs in WAL mode.

The three-table split is a sound starting point: it preserves individual occurrences, makes triage operate on groups, and prevents a tentative similarity match from changing counts.

## What prevents reliable regrouping today

1. **The saved report is not the complete submitted report.** Ingest uses but does not save a caller-supplied `fingerprint` or `category`. It trims text fields and ignores additional payload fields. Consequently, a later classifier cannot distinguish a reporter's explicit grouping or category from a server-generated choice. Preserve the submitted payload (for example, as `raw_payload` JSON alongside queryable columns), or at minimum save the supplied fingerprint, supplied category, and source metadata separately. Existing rows cannot recover these discarded values.
2. **One issue can have only one fingerprint.** The unique `(repository, fingerprint)` key works for initial exact matching, but a manual merge may put reports from several fingerprints into one issue. New reports matching an old fingerprint would then need a way to find the merged issue. An `issue_fingerprints` mapping table with unique `(repository, fingerprint)` and an `issue_id` foreign key would allow several keys to resolve to one issue. The issue ID should remain the durable triage identity.
3. **`reports.issue_id` is currently an assignment, not an immutable fact.** That is appropriate if regrouping is intended: move the assignment while leaving the submitted report fields intact. A regroup operation should run in one transaction, reconcile or remove affected relation edges, and recalculate `first_seen` and `last_seen` for both affected issues. Counts already come from reports and need no stored counter update.
4. **Triage decisions need a merge rule.** Status and category live on issues, and the first report supplies the initial representative text and category. Later reports do not revise them. When two issues merge, preserve a deliberate human category/status decision rather than silently taking the first issue's values. If auditability matters, record who changed grouping or triage and when.

## Other improvements, in priority order

- **Name the identity and metric accurately.** The local importer sets `machine_id` to a `<user>.<agent>` label. `COUNT(DISTINCT machine_id)` is therefore not always a count of physical machines. Either call it a distinct reporter count or store reporter and machine identities separately.
- **Store structured provenance.** The importer currently appends a source filename to description text. A source type and source reference on each report would support navigation, deduplication, and later review without parsing prose.
- **Detect conflicting idempotency replays.** A reused `(repository, machine_id, report_id)` currently returns the earlier issue even if the new payload describes a different papercut. Consider rejecting a replay whose stable identity matches but substantive report content differs.
- **Strengthen database integrity when other writers appear.** The API checks categories, statuses, and same-repository relations, but the database does not enforce them. `reports.repository` can also disagree with its parent issue. Add constraints or composite foreign keys as the application grows beyond one controlled writer.
- **Version schema changes.** Startup currently creates missing tables and special-cases one `observed_at` column addition. Explicit schema versions and migrations will make future regrouping changes repeatable for existing databases.
- **Index for observed workloads.** The `reports(issue_id)` and unique-key indexes cover current ingestion and issue details. At larger scale, consider an index for issue list filters and `last_seen` ordering, an index on `relations(issue_b)`, and full-text search for `q`. Similarity suggestions currently scan issues in the repository; measure that before changing the algorithm.

## Suggested next schema step

Make `reports` a faithful record of input first. Keep `issue_id` as the current assignment. When merge/split or classifier reruns are implemented, introduce the fingerprint-to-issue mapping and a transactional regroup operation. This preserves the ability to revise classification without losing the evidence that led to the original grouping.
