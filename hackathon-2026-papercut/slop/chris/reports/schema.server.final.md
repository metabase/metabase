# Papercut tracker schema: final design

The schema the server uses from schema version 9 on.
It settles the four server reviews in this folder:

- [`schema.server.claude.md`](schema.server.claude.md)
- [`schema.server.codex.md`](schema.server.codex.md)
- [`schema.server.claude-on-codex.md`](schema.server.claude-on-codex.md)
- [`schema.server.codex-on-claude.md`](schema.server.codex-on-claude.md)

It also fits the server mapping in [`schema.papercut.claude.md`](schema.papercut.claude.md).

## Goal

Keep every submitted report as evidence, so that reports can be reclassified and regrouped later.

- A **report** is a fact: someone submitted it, and it never changes.
  The one exception is which papercut it belongs to.
- A **papercut** is the current grouping and triage decision over a set of reports.
  Versions 1 and 2 called it an issue.
- A **fingerprint** is a key that routes new reports to a papercut.
  A papercut can have several.
- A **relation** links two papercuts.
  It never merges them or their counts.
- An **event** records one triage decision: who changed what, when, and why.
- An **assessment** records whether a papercut is ready for an agent to fix.
- A **dispatch** tracks one attempt by an agent to fix a papercut.

## Tables

```sql
CREATE TABLE papercuts (
    id                INTEGER PRIMARY KEY,
    repository        TEXT NOT NULL,
    title             TEXT NOT NULL,
    description       TEXT NOT NULL,
    path              TEXT NOT NULL,
    area              TEXT NOT NULL DEFAULT '',
    category          TEXT CHECK (category IN ('agent-trap', 'code-smell', 'flaky-test', 'tooling', 'documentation', 'other')),
    status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'wontfix')),
    owner             TEXT CHECK (owner IN ('repo-code', 'repo-tooling', 'personal-tooling', 'third-party', 'harness', 'agent-practice')),
    severity          TEXT CHECK (severity IN ('low', 'medium', 'high')),
    status_changed_at TEXT,
    merged_into       INTEGER REFERENCES papercuts (id),
    first_seen        TEXT NOT NULL,
    last_seen         TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE (id, repository),
    CHECK (merged_into IS NULL OR merged_into != id)
);

CREATE TABLE papercut_fingerprints (
    repository  TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    papercut_id INTEGER NOT NULL,
    PRIMARY KEY (repository, fingerprint),
    FOREIGN KEY (papercut_id, repository) REFERENCES papercuts (id, repository)
);

CREATE TABLE reports (
    id                    INTEGER PRIMARY KEY,
    papercut_id           INTEGER NOT NULL,
    repository            TEXT NOT NULL,
    reporter              TEXT NOT NULL,
    machine               TEXT,
    agent                 TEXT,
    session               TEXT,
    report_id             TEXT,
    fingerprint           TEXT NOT NULL,
    submitted_fingerprint TEXT,
    submitted_category    TEXT CHECK (submitted_category IN (...same as papercuts.category...)),
    title                 TEXT NOT NULL,
    description           TEXT NOT NULL,
    path                  TEXT NOT NULL,
    area                  TEXT NOT NULL DEFAULT '',
    cost_minutes          REAL CHECK (cost_minutes >= 0),
    source_type           TEXT,
    source_ref            TEXT,
    payload               TEXT,
    received_at           TEXT NOT NULL,
    observed_at           TEXT,
    branch                TEXT,
    commit_sha            TEXT CHECK (commit_sha IS NULL OR (length(commit_sha) BETWEEN 7 AND 40 AND commit_sha NOT GLOB '*[^0-9a-f]*')),
    commit_source         TEXT CHECK (commit_source IN ('exact', 'reflog', 'before-timestamp', 'session-start')),
    repository_url        TEXT,
    UNIQUE (repository, reporter, report_id),
    FOREIGN KEY (papercut_id, repository) REFERENCES papercuts (id, repository)
);

CREATE TABLE relations (
    repository TEXT NOT NULL,
    papercut_a INTEGER NOT NULL,
    papercut_b INTEGER NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('suggested', 'manual', 'rejected')),
    score      REAL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (papercut_a, papercut_b),
    CHECK (papercut_a < papercut_b),
    FOREIGN KEY (papercut_a, repository) REFERENCES papercuts (id, repository),
    FOREIGN KEY (papercut_b, repository) REFERENCES papercuts (id, repository)
);

CREATE TABLE events (
    id          INTEGER PRIMARY KEY,
    papercut_id INTEGER NOT NULL REFERENCES papercuts (id),
    at          TEXT NOT NULL,
    actor       TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('status', 'category', 'title', 'description', 'path', 'area', 'reopened',
                                              'merged', 'absorbed', 'related', 'unrelated', 'fingerprint', 'comment',
                                              'owner', 'severity', 'assessed', 'dispatched', 'dispatch_updated')),
    old_value   TEXT,
    new_value   TEXT,
    body        TEXT
);

CREATE TABLE assessments (
    id                    INTEGER PRIMARY KEY,
    papercut_id           INTEGER NOT NULL REFERENCES papercuts (id),
    at                    TEXT NOT NULL,
    actor                 TEXT NOT NULL,
    verdict               TEXT NOT NULL CHECK (verdict IN ('not_ready', 'ready', 'needs_human')),
    evidence_score        REAL,
    fixability_score      REAL,
    fixability_confidence REAL,
    inputs                TEXT,
    model                 TEXT,
    reason                TEXT
);

CREATE TABLE dispatches (
    id              INTEGER PRIMARY KEY,
    papercut_id     INTEGER NOT NULL REFERENCES papercuts (id),
    assessment_id   INTEGER REFERENCES assessments (id),
    state           TEXT NOT NULL CHECK (state IN ('claimed', 'linear_created', 'running',
                                                   'pr_opened', 'already_fixed', 'needs_human', 'not_reproducible', 'failed')),
    actor           TEXT NOT NULL,
    linear_issue_id TEXT,
    linear_url      TEXT,
    branch          TEXT,
    pr_url          TEXT,
    run_log         TEXT,
    cost_usd        REAL CHECK (cost_usd >= 0),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- At most one dispatch per papercut is in progress.
CREATE UNIQUE INDEX dispatches_active ON dispatches (papercut_id) WHERE state IN ('claimed', 'linear_created', 'running');
```

The server also creates indexes on:

- `papercuts(updated_at)`
- `papercut_fingerprints(papercut_id)`
- `reports(papercut_id)` and `reports(branch)`
- `relations(papercut_b)`
- `events(papercut_id)`
- `assessments(papercut_id)`
- `dispatches(state)`

It records the schema version in `PRAGMA user_version`.

## Decisions

### Reports record what was submitted

- `payload` holds the request body as JSON, including fields the server doesn't know.
  The ingest response names those fields in `extra_fields`, so a reporter can spot a misspelled one.
- `submitted_fingerprint` and `submitted_category` hold what the reporter sent.
  They are NULL when the reporter sent nothing and the server computed or guessed the value.
- `fingerprint` is the key that assigned the report: the submitted one, or the server's hash of the normalized path and title.
  It stays on the report when a merge moves the report to another papercut.
- `title`, `description`, `path` and `area` are the trimmed values the server uses.
  The untrimmed values are in `payload`.
- `source_type` and `source_ref` record where a report came from.
  Examples are `local-papercuts` with a writeup filename, and `transcript-scan` with a transcript line.
- `report_id` is required from version 3 on.
  Without it, a retry can't be told apart from a second occurrence.

### Who reported it, and what it cost

- **`reporter`** is the person who reported it, and it scopes `report_id`.
  The API still accepts `machine_id` as another name for it; a client sending both must send the same value.
- **`agent`** records which agent hit the papercut, such as `claude` or `codex`.
  Version 2 packed it into `reporter` as `<user>.<agent>`.
- **`machine`** and **`session`** are optional and narrow down where it happened.
- **`cost_minutes`** is the reporter's estimate of the time lost.
- **Papercut lists compute** `report_count`, `reporter_count`, `agent_count` and total `cost_minutes` from the reports, and can sort by each.

### Reports record where the papercut was hit

- `branch` and `commit_sha` record the git state the reporter was on, and `repository_url` the remote.
- `commit_source` says how the reporter knows the commit.
  Only `exact` was read at the moment the papercut was hit.
  `reflog`, `before-timestamp` and `session-start` are reconstructed afterwards, from the branch reflog at the observed time, the last commit before it, or the commit the session started on.
  The server rejects a commit sent without its source, because it would read as exact.
- `repository_url` is stored without user info or a query string, which is where HTTPS remotes carry credentials.
  The same cleaning applies to the copy in `payload`, because the detail endpoint returns the payload.

### `path` and `area` are separate

`path` is a file path.
`area` is a free-text description of where the papercut lives, such as "test harness" or a list of files.
The importer used to put writeups' free-text area in `path`, which broke the fingerprint hash's assumption that `path` is a path.

### An unclassified papercut has no category

`papercuts.category` is NULL until a reporter or a person sets it.
The server no longer guesses from keywords.
The list endpoint filters for these with `category=unclassified`.

- A report's category fills a NULL category on its papercut, but never overwrites one.
- `category_votes` on a papercut counts the categories its reports sent, to help a person pick one.

### Owner and severity work like category

`owner` says where a fix would go, and `severity` how bad the papercut is.
Their values are the transcript scanner's.

- Both are NULL until a report or a person sets them.
- A report's value fills a NULL field on its papercut, but never overwrites one.
- A person can change either, and the change is recorded as an event.

### Readiness is assessed, then dispatched

The server records the agent-fixing loop, but doesn't run it.
A separate dispatcher does.

- **Importance.** A papercut counts as important when it has 2 or more reporters, 3 or more reports, an hour of reported cost, or high severity.
  The list can sort by this.
- **Assessments** are append-only.
  Each records a verdict (`not_ready`, `ready` or `needs_human`), optional scores, the inputs and model behind it, and a reason.
  Only a change of verdict writes an event, so reassessing with the same result doesn't put the papercut back in the change feed.
- **Dispatches** start on an open papercut, which moves it to `investigating`.
  A partial unique index keeps at most one dispatch per papercut in progress.
- **Dispatch states** move only forward: `claimed`, then `linear_created`, then `running`, then one final state.
  A dispatch can also fail from any earlier state.
- **Final states** hand the papercut back, but only while it is still `investigating`:
  - `already_fixed` resolves it.
  - `needs_human`, `not_reproducible` and `failed` reopen it.
  - `pr_opened` leaves it `investigating`.

  If a person changed the status while the dispatch ran, their decision stands.

### Fingerprints route to papercuts through a mapping

- `papercut_fingerprints` lets several fingerprints lead to one papercut.
- `POST /api/papercuts/{id}/fingerprints` adds one.
  If the fingerprint already routes to another papercut, the server rejects the request with 409 and asks for a merge instead.
- The importer registers each writeup's `merged_from` slugs this way.
  It merges when an old slug still has its own papercut.

### Replays must match the original grouping key

A report with an existing `(repository, reporter, report_id)` is a replay.

- **Same fingerprint:** the server returns the existing papercut and stores nothing.
  Edited text in a replay is not recorded.
  The importer relies on this, because its writeups gain "Additional occurrence" sections over time.
- **Different fingerprint:** the server rejects the replay with 409.

### A merge moves reports, keeping the papercut it moved them from

`POST /api/papercuts/{source}/merge` with `{"into": target}` runs in one transaction:

1. **Moves reports and fingerprints.**
   Every report and fingerprint moves to the target, so later reports with the source's fingerprints land on the target.
2. **Keeps the source as a pointer.**
   The source papercut stays, with `merged_into` pointing at the target.
   GET requests for it redirect with 301, so old links keep working.
   Lists leave it out, except the change feed, which must tell clients to drop it.
3. **Recomputes seen times.**
   The target's `first_seen` and `last_seen` are recomputed from its reports.
4. **Carries triage over only when both agree.**
   If the two papercuts differ in status or category, the target goes back to `open`.
   A category fills the target's only when the target has none.
5. **Moves an active dispatch.**
   An agent working on the source is now working on the target.
   If both papercuts have a dispatch in progress, the merge is rejected with 409.
6. **Moves relations.**
   The target's own relation to a third papercut wins, unless it was only a suggestion and the source's came from a person.
   Suggested relations are then recomputed for the target.
7. **Records it.**
   `merged` and `absorbed` events are recorded on both papercuts.

This follows the regroup rules from both reviews.
Triage carries over only when it still means the same thing.
The server never picks a status by majority.
Earlier values stay in the event history.

### Triage history is recorded

Every change to status, category, title, description, path or area writes an event with the actor, the time, the old and new values, and an optional reason.
Relation decisions, merges, added fingerprints and comments write events too.
The actor is whatever name the client sends, and anyone with the token can claim any name.

### A new report can reopen a resolved papercut

A resolved papercut goes back to `open` when a new report was observed after the status changed.
Either the fix didn't hold, or a stale copy of the trap remains.
The server records this as a `reopened` event by the actor `server`.
`status_changed_at` records when the status last changed, to make the comparison.

### Relations can be rejected

- A **`rejected`** relation hides a wrong suggestion and stops the pair from being suggested again.
- **Suggested relations are recomputed** whenever a papercut is created, merged into, or has its title or description edited.
  They compare title and description, at a threshold tuned on the local archive.
  Manual and rejected relations are never recomputed.

### Clients can poll for changes

`updated_at` is stamped under the write lock with microsecond precision.
It changes whenever a papercut's fields, reports, relations or events change.

- `GET /api/papercuts?since=<cursor>` returns only the papercuts changed after the cursor, including merged ones.
- Every list response includes the cursor for the next poll.

### The database enforces the rules it can

- `CHECK` constraints cover category, owner, severity, status, relation source, event kind, verdict, dispatch state, commit format and source, costs and self-merges.
- Composite foreign keys on `(papercut_id, repository)` keep a report in its papercut's repository.
  They also stop a relation from linking papercuts in different repositories.
- `papercuts.id` is unique on its own, so `UNIQUE (id, repository)` exists only so these foreign keys can reference it.

### Counts are computed; seen times are stored

- Report counts, reporter counts, agent counts and cost are computed from `reports`.
- `first_seen` and `last_seen` are stored so the list can sort without an aggregate.
  Ingest widens them with `MIN` and `MAX`, and a merge recomputes them.

### Schema changes are versioned

Each migration runs once, in order, inside one `BEGIN IMMEDIATE` transaction:

- Foreign key enforcement is off while tables are rebuilt.
- `PRAGMA foreign_key_check` must come back empty before the commit.
- The migration re-reads `user_version` after taking the lock.
  If two servers start at the same time, only one of them migrates.

A server running older code against a migrated database fails on every request, so restart it after pulling a new migration.

## Migrations

Every migration backfills only what the old data proves.

### Version 1 to version 2

| Column | Backfill | Why it is exact |
|---|---|---|
| `issue_fingerprints` | One row per issue, from `issues.fingerprint` | The mapping is the old column split into its own table |
| `reports.fingerprint` | The issue's fingerprint | Version 1 grouped reports by exact fingerprint only |
| `reports.submitted_fingerprint` | The issue's fingerprint, when it differs from the server hash of the report's path and title; otherwise NULL | Anything other than the server hash must have been submitted |
| `reports.reporter` | `machine_id` | Rename only |
| `reports.source_type`, `source_ref` | `local-papercuts` and the filename, from a trailing `Source: local-papercuts/<file>` line in the description | The importer wrote exactly this line. The description keeps it |
| `relations.repository` | The repository of `issue_a` | Version 1 already required both issues to share a repository |
| `reports.submitted_category` | NULL | Version 1 did not store it, and the issue category may be a server guess or a later triage edit |
| `reports.payload` | NULL | Version 1 did not store it. NULL means "migrated from version 1" |

`submitted_category` is left NULL instead of copied from the issue, because the issue category is not evidence of what the reporter sent.
Two Codex writeups (`active-search-table` and `provenance-alias`) sent no category, so their issues hold the server's keyword guess.

### Version 2 to version 3

| Column | Backfill | Why it is exact |
|---|---|---|
| `papercuts`, `papercut_fingerprints` | Copied from `issues` and `issue_fingerprints` | Rename only |
| `papercuts.path`, `area` | For papercuts with imported reports, `path` moves to `area` and `path` becomes empty | The importer put each writeup's free-text area in `path` |
| `papercuts.category` | NULL when no report sent a category and every report has a recorded body; otherwise kept | Only then is the category certainly the server's guess. Version 1 rows have no body, so their categories stay |
| `papercuts.status_changed_at` | The migration time for papercuts that aren't open; otherwise NULL | The real time was not recorded; the migration time keeps later reports able to reopen them |
| `reports.reporter`, `agent` | For imported reports, `<user>.<agent>` is split into the two columns | The importer built the reporter that way |
| `reports.session` | For imported reports, the transcript's file name, when the request body recorded it | The importer sent the transcript path |
| `reports.path`, `area` | For imported reports, `path` moves to `area` | Same as for papercuts |
| `papercuts.updated_at`, `relations.updated_at` | The migration time | Nothing earlier was recorded |
| `events` | Empty | No history was recorded before version 3 |

### Version 3 to version 4

Adds `branch`, `commit_sha`, `commit_source` and `repository_url` to reports.
They are filled from each report's stored request body, when it sent valid values.
Reports without a body, or with invalid git fields, keep NULLs.

### Version 4 to version 5

Adds `owner` and `severity` to papercuts, the `assessments` and `dispatches` tables, and the new event kinds.

- The events table is rebuilt to widen its `kind` constraint, and every event is copied across.
- `owner` and `severity` are filled from the earliest report whose stored request body carries a valid value, either at the top level or in the transcript scanner's `details`.

### Version 5 to version 6

Removes credentials from repository URLs stored before the server cleaned them.
It cleans both the `repository_url` column and the copy in each stored request body.

### Version 6 to version 7

Cleans repository URLs again, trimmed first.
Ingestion trimmed the column but stored the request body as sent, so a body URL with surrounding spaces escaped version 6.

### Version 8 to version 9

Cleans repository URLs once more, stripped in Python the way ingestion strips them.
SQLite's `trim()` removes only spaces, so a URL wrapped in tabs, newlines or other whitespace kept its credentials.

## Deferred

- **Split.** No operation moves some of a papercut's reports to a new papercut yet.
  When it exists, it should follow the merge rules: one transaction, recomputed seen times and suggestions, and triage reset whenever membership changes.
- **Similarity scaling.** Suggestions scan every live papercut in the repository.
  That is fine at a few hundred papercuts.
- **Search.** Search uses `LIKE`.
  Consider full-text search when the list gets slow.
