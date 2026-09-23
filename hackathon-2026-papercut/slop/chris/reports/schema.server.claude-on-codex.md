# Papercut tracker schema: Claude's review of the Codex review

Reviews [`schema.server.codex.md`](schema.server.codex.md) and compares it with [`schema.server.claude.md`](schema.server.claude.md).
Both review the schema at commit `3e11a2a1183`. Checked against `populated.sqlite3` on 2026-09-23.

**Summary.** The Codex review is sound and better structured.
It finds three gaps the Claude review missed.
One of its factual claims is wrong for the current data, and one of its recommendations would break the importer.

## Where the Codex review is stronger

1. **One issue can have only one fingerprint.**
   After a merge, one issue holds reports with different fingerprints.
   A later report with the old fingerprint then has no issue to go to.
   The Codex fix is an `issue_fingerprints` table: `(repository, fingerprint)` stays unique, and many fingerprints can point to one `issue_id`.
   The Claude review covered carrying status and relations across a regroup, but not how later reports find the merged issue.
2. **Regrouping makes the stored `first_seen` and `last_seen` wrong.**
   The Claude review defended storing them because the `MIN`/`MAX` update handles backfills.
   That holds only while reports never move between issues.
   The Codex review correctly makes recomputing them part of the regroup transaction.
3. **`machine_id` is not a machine.**
   `reporter_and_slug` sets it to `<user>.<agent>`, so `COUNT(DISTINCT machine_id)` counts reporters.
   The Claude review got this wrong: it described the populated DB as having "2 machines", which are really the reporter labels `chris.claude` (259 reports) and `chris.codex` (18 reports).

The Codex review also suggests storing where each report came from in its own fields.
Today the importer appends `Source: local-papercuts/...` to the description instead.
That is a cleaner version of the Claude suggestion to add a `payload` column and send transcript fields.

## Where the Codex review is wrong or goes too far

- **"Existing rows cannot recover these discarded values" is false for this DB.**
  - All 139 issues came from the importer, and every one has a `local-papercuts:<slug>` fingerprint.
    Grouping only merges exact fingerprint matches, so every report in an issue was sent with that issue's fingerprint.
    Backfilling the fingerprint from the issue is exact.
  - The category the reporter sent is in each writeup's frontmatter, and those files are now in the repo.
  - The claim holds for future reporters, but not for these rows.
    Getting this right matters, because the claim makes a cheap, exact backfill sound impossible.
- **Rejecting a replay with changed content would break re-imports.**
  - The importer's `report_id` is `local-papercuts:<slug>:<session>:<lines>`, which is stable across runs.
    The description comes from the writeup, which changes.
  - Writeups do get edited: the drill-down prompt tells agents to add "Additional occurrence" sections to existing files.
  - Under the proposed rule, re-running the importer would fail for every edited writeup.
  - A narrower check works better: reject a replay only when its fingerprint differs, because the fingerprint is the one field that changes grouping.
    For other changes, flag the replay in the response or record the newer text.
- **The index suggestions are premature.**
  Indexes on the list filters, on `last_seen` and full-text search for `q` would help at scale, but the DB has 139 issues.
  The Codex review does say to measure first, but these ideas still take space in a list sorted by priority.

## What both reviews missed

- **Suggested relations go stale.**
  `_suggest_relations` runs only when an issue is created, and it compares that issue's first-report title and path.
  Reclassifying, regrouping or re-titling never recomputes them.
  A regroup operation should recompute or drop the suggested links, and keep only the manual ones.
- **The Codex review doesn't say which commit it reviewed.**
  It names the branch, but the branch history was rewritten on 2026-09-23, so the branch name alone doesn't pin down the code.

## Combined recommendation

The Codex review's first step is the right priority: make `reports` a faithful record of what was submitted.
Combining both reviews gives this order:

1. **Store what the reporter sent.**
   Add the fingerprint and category the reporter sent, the raw payload, and structured fields for where the report came from.
2. **Backfill the existing rows.**
   Copy fingerprints from the issues and read categories from the writeups.
   Both are exact for this DB.
3. **Add `issue_fingerprints`.**
   Several fingerprints can then lead to one issue.
4. **Build regrouping as one transaction** that does all of the following:
   - recomputes `first_seen` and `last_seen`
   - gives each new group the status of the old issue that contributed most of its reports
   - remaps manual relations through the same mapping
   - recomputes suggested relations
