# Papercut tracker schema: final design

The schema the server uses from schema version 2 on.
It settles the four server reviews in this folder:

- [`schema.server.claude.md`](schema.server.claude.md)
- [`schema.server.codex.md`](schema.server.codex.md)
- [`schema.server.claude-on-codex.md`](schema.server.claude-on-codex.md)
- [`schema.server.codex-on-claude.md`](schema.server.codex-on-claude.md)

It also fits the server mapping in [`schema.papercut.claude.md`](schema.papercut.claude.md).

## Goal

Keep every submitted report as evidence, so that reports can be reclassified and regrouped later.

- A **report** is a fact: someone submitted it, and it never changes.
  The one exception is its issue assignment.
- An **issue** is the current grouping and triage decision over a set of reports.
- A **fingerprint** is a key that routes new reports to an issue.
  An issue can have several.
- A **relation** links two issues.
  It never merges them or their counts.

## Tables

```sql
CREATE TABLE issues (
    id          INTEGER PRIMARY KEY,
    repository  TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    path        TEXT NOT NULL,
    category    TEXT NOT NULL CHECK (category IN ('agent-trap', 'code-smell', 'flaky-test', 'tooling', 'documentation', 'other')),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'wontfix')),
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    UNIQUE (id, repository)
);

CREATE TABLE issue_fingerprints (
    repository  TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    issue_id    INTEGER NOT NULL,
    PRIMARY KEY (repository, fingerprint),
    FOREIGN KEY (issue_id, repository) REFERENCES issues (id, repository)
);

CREATE TABLE reports (
    id                    INTEGER PRIMARY KEY,
    issue_id              INTEGER NOT NULL,
    repository            TEXT NOT NULL,
    reporter              TEXT NOT NULL,
    machine               TEXT,
    report_id             TEXT,
    fingerprint           TEXT NOT NULL,
    submitted_fingerprint TEXT,
    submitted_category    TEXT CHECK (submitted_category IN (...same as issues.category...)),
    title                 TEXT NOT NULL,
    description           TEXT NOT NULL,
    path                  TEXT NOT NULL,
    source_type           TEXT,
    source_ref            TEXT,
    payload               TEXT,
    received_at           TEXT NOT NULL,
    observed_at           TEXT,
    UNIQUE (repository, reporter, report_id),
    FOREIGN KEY (issue_id, repository) REFERENCES issues (id, repository)
);

CREATE TABLE relations (
    repository TEXT NOT NULL,
    issue_a    INTEGER NOT NULL,
    issue_b    INTEGER NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('suggested', 'manual')),
    score      REAL,
    PRIMARY KEY (issue_a, issue_b),
    CHECK (issue_a < issue_b),
    FOREIGN KEY (issue_a, repository) REFERENCES issues (id, repository),
    FOREIGN KEY (issue_b, repository) REFERENCES issues (id, repository)
);
```

The server also creates indexes on `reports(issue_id)`, `issue_fingerprints(issue_id)` and `relations(issue_b)`.
It records the schema version in `PRAGMA user_version`.

## Decisions

### Reports record what was submitted

- `payload` holds the request body as JSON, including fields the server doesn't know.
  The importer sends `transcript` and `lines` this way.
- `submitted_fingerprint` and `submitted_category` hold what the reporter sent.
  They are NULL when the reporter sent nothing and the server computed or guessed the value.
  A reclassifier can then tell reporter claims from server guesses.
- `fingerprint` is the key that assigned the report: the submitted one, or the server's hash of the normalized path and title.
  It stays on the report when the report moves to another issue.
- `title`, `description` and `path` are the trimmed values the server uses.
  The untrimmed values are in `payload`.
- `source_type` and `source_ref` record where a report came from, such as `local-papercuts` and a writeup filename.
  Before this, the importer appended that information to the description as prose.

### Reporter and machine are separate

The column that was called `machine_id` is now `reporter`.
The importer sets it to `<user>.<agent>`, which is not a machine, so the old "distinct machines" count was really a count of reporters.

- `reporter` is required, and it scopes `report_id`.
- `machine` is optional.
- Issue responses report `reporter_count`.
- The API still accepts `machine_id` as another name for `reporter`, so older clients keep working.

### Fingerprints route to issues through a mapping

`issue_fingerprints` replaces `issues.fingerprint`.
Several fingerprints can point at one issue.
When two issues merge, the fingerprints of both keep routing new reports to the merged issue.
This also supports the `aliases` field in the case format.

### Replays must match the original grouping key

A report with an existing `(repository, reporter, report_id)` is a replay.

- **Same fingerprint:** the server returns the existing issue and stores nothing.
  Edited text in a replay is not recorded.
  The importer relies on this, because its writeups gain "Additional occurrence" sections over time.
- **Different fingerprint:** the server rejects the replay with 409.
  Before this, it silently returned the earlier issue.

### The database enforces the rules it can

- `CHECK` constraints cover category, status and relation source.
- Composite foreign keys on `(issue_id, repository)` keep a report in its issue's repository.
  They also stop a relation from linking issues in different repositories.
- `issues.id` is unique on its own, so the extra `UNIQUE (id, repository)` exists only so these foreign keys can reference it.

### Counts are computed; seen times are stored

- Report and reporter counts are computed from `reports`.
- `first_seen` and `last_seen` are stored so the list can sort without an aggregate.
  Ingest widens them with `MIN` and `MAX`.
  Any operation that moves reports between issues must recompute both from the reports.

### Schema changes are versioned

Each migration runs once, in order, inside one `BEGIN IMMEDIATE` transaction:

- Foreign key enforcement is off while tables are rebuilt.
- `PRAGMA foreign_key_check` must come back empty before the commit.
- The migration re-reads `user_version` after taking the lock.
  If two servers start at the same time, only one of them migrates.

## Migrating from version 1

Version 1 is the original schema, including the `observed_at` column added later.
Migration 2 rebuilds the tables and fills in only what it can prove.

| Column | Backfill | Why it is exact |
|---|---|---|
| `issue_fingerprints` | One row per issue, from `issues.fingerprint` | The mapping is the old column split into its own table |
| `reports.fingerprint` | The issue's fingerprint | Version 1 grouped reports by exact fingerprint only, so every report in an issue had its issue's fingerprint |
| `reports.submitted_fingerprint` | The issue's fingerprint, when it differs from the server hash of the report's path and title; otherwise NULL | Anything other than the server hash must have been submitted |
| `reports.reporter` | `machine_id` | Rename only |
| `reports.source_type`, `source_ref` | `local-papercuts` and the filename, from a trailing `Source: local-papercuts/<file>` line in the description | The importer wrote exactly this line. The description keeps it |
| `relations.repository` | The repository of `issue_a` | Version 1 already required both issues to share a repository |
| `reports.submitted_category` | NULL | Version 1 did not store it, and the issue category may be a server guess or a later triage edit |
| `reports.payload` | NULL | Version 1 did not store it. NULL means "migrated from version 1" |

### Not copying the issue category

`submitted_category` is left NULL instead of copied from the issue, because the issue category is not evidence of what the reporter sent:

- Two Codex writeups (`active-search-table` and `provenance-alias`) sent no category.
  Their issues hold the server classifier's guess.
- A triage edit can change an issue's category after import.

For the local archive, re-importing the committed writeups into an empty database gives full-fidelity rows, including `payload` and `submitted_category`.

## Deferred: merge, split and regroup

None of these are implemented yet.
When they are, they follow these rules:

1. **One transaction per operation.**
   It moves report assignments, moves fingerprint rows, and recomputes `first_seen` and `last_seen` for every affected issue.
2. **Triage carries forward only when a group is unchanged.**
   Status and category carry over to a new group only if its membership is unchanged.
   Otherwise the group goes back to triage, and the old decisions are kept in history.
   A majority rule may suggest a status, but never sets it.
3. **Suggested relations are recomputed; manual relations are reviewed.**
   Suggested relations are recomputed for every affected issue.
   A manual relation carries over only when its endpoint maps to exactly one new issue.
   Otherwise it is queued for review.
4. **Merged writeups need fingerprint aliases.**
   Since `populated.sqlite3` was built, some writeups have been merged into others, with the old slugs listed in `merged_from`.
   Four old slugs, such as `ddl-inside-rollback-only-with-temp-leaks-rows`, still have their own issues in the migrated DB.
   Registering each `merged_from` slug as an extra fingerprint on the surviving issue, and then merging the issues, would fix this.
5. **Triage history needs a new table.**
   A `triage_events` table (issue, field, old value, new value, actor, time, reason) would record these decisions.
   It isn't needed until triage is done by more than one person or by automated regrouping.

## Not changed

- **Similarity suggestions** still run only when an issue is created, and still scan the issues in that repository.
  That is fine at the current size, a few hundred rows.
- **Search** still uses `LIKE`.
  Consider full-text search when the issue list gets slow.
