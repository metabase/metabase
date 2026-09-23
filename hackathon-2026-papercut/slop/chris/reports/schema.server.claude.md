# Papercut tracker: schema review

Review of the SQLite schema in `hackathon-2026-papercut/server.py` (`Store.__init__`), as of commit `3e11a2a1183`.

**Summary.** The design fits the goal: keep every raw report so it can be reclassified and regrouped later.
Two things the reporter sends are not stored per report (its fingerprint and category), and the importer drops transcript details.
Fix those before regrouping.
Regrouping also needs a rule for carrying triage state across, because status and manual links belong to groups.

## Schema

**`issues`**: one row per papercut, which is a group of reports that match exactly.

- `repository` and `fingerprint` are unique together.
  The fingerprint comes from the reporter, or is a sha256 of the normalized path and title.
- `title`, `description` and `path` come from the first report.
- `category` and `status` hold the triage state.
- `first_seen` and `last_seen` are ISO timestamps in UTC.

**`reports`**: one row per report, never merged.

- `issue_id` points to `issues`, and there is an index on it.
- Each report keeps its own `repository`, `machine_id`, `title`, `description` and `path`.
- `report_id` is optional. `(repository, machine_id, report_id)` is unique.
- `received_at` is when the server got the report.
  `observed_at` is an optional time from the reporter, for backfills.

**`relations`**: undirected links between issues.

- The primary key is `(issue_a, issue_b)`, with a check that `issue_a < issue_b`.
- `source` is `suggested` (Jaccard similarity ≥ 0.45 on title and path) or `manual`.
- `score` is the similarity score, or NULL for manual links.

The populated DB has 139 issues, 277 reports, 2 machines and 3 suggested relations.

## Why it works

1. **Reports and issues are separate, so raw data is never lost.**
   Grouping is a decision the server makes, so it can be wrong.
   Each report keeps its own text, machine and times.
   Counts are computed with `COUNT(r.id)` and `COUNT(DISTINCT machine_id)` rather than stored, so no counter can drift.
2. **Exact matching is the only thing that merges.**
   `UNIQUE(repository, fingerprint)` is the single rule that makes two reports the same papercut.
   Fuzzy similarity only writes to `relations`, so a false positive costs one wrong link, not merged counts that can't be separated.
3. **Retries are safe because the DB enforces idempotency.**
   `UNIQUE(repository, machine_id, report_id)` rejects a repeated report.
   SQLite treats NULLs as distinct, so a report without a `report_id` never counts as a duplicate.
   That is the right default: without an ID, a retry and a second occurrence look the same.
   Report IDs are scoped per machine, so reporters don't have to coordinate.
4. **Each relation is stored once per pair.**
   `CHECK(issue_a < issue_b)` makes A–B and B–A the same row.
   A manual link then replaces a suggested one with a single `ON CONFLICT ... DO UPDATE`.
5. **`first_seen` and `last_seen` are stored so the list can sort without an aggregate.**
   The update uses `MIN` and `MAX` rather than overwriting, so backfilled reports can arrive in any order.
   All timestamps have the same UTC format, so sorting them as text is also chronological.
6. **`reports.repository` is duplicated on purpose.**
   The idempotency check has to find a prior report before it knows the issue.
   With `repository` on `reports`, that check is a single-table unique lookup.
7. **The SQLite settings suit a small inbox.**
   WAL mode, `BEGIN IMMEDIATE` for ingest and a 5-second busy timeout run concurrent reporters one at a time without lost updates.
   Readers aren't blocked.

## Gaps for reclassifying and regrouping

The current grouping cannot be rebuilt from `reports` alone.
You need it as the baseline before trying a new grouping.

- **The fingerprint the reporter sent is lost.**
  It is written only to `issues.fingerprint`, and only by the first report.
  The importer's key (`local-papercuts:{slug}`, `import_local.py:196`) is what turns 277 reports into 139 issues.
  Today you can get it back only through `issue_id`, and that stops working after the first regroup.
- **The category the reporter sent is lost.**
  It goes only onto the issue, from the first report.
  The importer passes the writeup's own category (`import_local.py:200`), which is better than the keyword classifier.
  If a later report sends a different category, that category is lost.
- **Fields the schema doesn't know are lost.**
  `ingest` drops unknown keys.
  The importer builds a transcript and line numbers for each occurrence but doesn't send them.
  They survive only inside `report_id`, and parsing them back out of it is fragile.

## Suggestions

1. **Add `reports.fingerprint` and `reports.category`.**
   Make both nullable, and fill them only with what the reporter sent.
   Leave them NULL when the server computed the value.
   Reporter claims and server guesses then stay separate, so a reclassification can tell which labels to trust.
2. **Add `reports.payload TEXT` holding the raw request JSON.**
   Future fields then survive without a schema change.
3. **Send transcript details from the importer.**
   Send `transcript` and `lines` as their own fields and let `payload` keep them.
4. **Backfill the existing rows.**
   Copy `fingerprint` and `category` from each report's issue.
   This is exact for imported reports, because the importer always sent both.
   For demo reports, first check which values were computed rather than sent.
5. **Decide how triage state carries across a regroup before running one.**
   `status`, manual `relations` and the issue ids all belong to groups.
   Here is a workable rule:
   - A new group inherits the status of the old issue that contributed most of its reports.
   - A manual relation is remapped through the same mapping.
   - A relation whose two ends land in the same group is dropped.
   Without a rule like this, every regroup loses the triage state.
6. **Replace the ad-hoc migration.**
   `observed_at` is added with a one-off `ALTER TABLE` when it's missing.
   Use `PRAGMA user_version` and an ordered list of migrations before adding the columns above.

## Smaller issues

These are fine for a prototype.

- **Several rules live only in Python.**
  `category`, `status` and `source` have no `CHECK` constraints.
  The rule that related issues must share a repository is also only in code.
  Anything that writes to the DB directly can break these.
- **Nothing makes the two `repository` columns agree.**
  A report and its issue have the same `repository` today only because `ingest` writes both from one value.
- **An issue's text is fixed at its first report.**
  Later reports don't update it, even when the first write-up is the weakest.
- **Some lookups and suggestions scan.**
  `relations` has no index on `issue_b`, so the `OR` lookup in `get_issue` scans the table.
  `_suggest_relations` compares each new issue against every issue in its repository.
  Neither matters at 139 rows.
- **`list_issues` uses an inner join.**
  An issue with no reports would not be listed.
  That can't happen today, because `ingest` always inserts the report in the same transaction as the issue.
