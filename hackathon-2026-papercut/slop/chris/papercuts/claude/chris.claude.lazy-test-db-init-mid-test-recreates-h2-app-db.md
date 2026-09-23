---
title: A test namespace without an :once initialize fixture triggers lazy `initialize :db` mid-test (via mt/user->id), which recreates the H2 app DB underneath rows the test already wrote -- "Table ... not found (this database is empty)"
slug: lazy-test-db-init-mid-test-recreates-h2-app-db
kind: test-harness
impact: wasted-time
severity: medium
status: documented-still-hit
area: test harness -- metabase.test.initialize, metabase.test.fixtures; enterprise/backend/test/metabase_enterprise/search/scoring_test.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
    lines: 1437-1555
    date: 2026-08-24
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.48, misleading_signal: 0.59, user_correction: 0.09, codebase_trap: 0.87, flailing: 0.75, env_friction: 0.64}
---
## Summary
Test initialization is lazy: `initialize-if-needed! :db` runs the first time something asks for it. The EE search
scoring namespace had no `use-fixtures :once (fixtures/initialize :db ...)`. Its `appdb-verified-test` wrote search
index bookkeeping (`SearchIndexMetadata`) first; later in the same test, `search-results` called `mt/user->id`,
which triggered `:test-users` -> `:db` initialization, which ran `mdb/setup-db!` and recreated the H2 app DB. The
`finally` then failed with `Table "SEARCH_INDEX_METADATA" not found (this database is empty)`. It only happens when
the namespace runs first in a JVM (standalone, or first in a CI partition), so it looked like the agent's own edit
had broken the namespace.

## Symptom
`ERROR in metabase-enterprise.search.scoring-test/appdb-verified-test (DbException.java:502)` with
`org.h2.jdbc.JdbcSQLSyntaxErrorException: Table "SEARCH_INDEX_METADATA" not found (this database is empty)`; no
`testing` context because the error is in the `finally`.

## Timeline
- L1437 "OSS combo fully green; the EE namespace got worse -- read the actual EE errors."
- L1455 "The stock file ALSO errors solo -- the vanishing-db bug pre-exists my edit".
- L1459-1463 suspects the coordinator's latest commit; rules it out.
- L1475-1496 instruments `with-temp-index-table` to print app-db identity: `ZZDEBUG temp-index start app-db-id 1` / `finally app-db-id 1` -- identity unchanged, tables gone.
- L1499 adds `(use-fixtures :once (fixtures/initialize :db :test-users))` with comment "the first lazy `initialize` (triggered mid-test via `mt/user->id` inside `search-results`) recreates the H2 test db underneath them". L1529 DbException errors gone.

## Root cause
Lazy initialization with side effects that destroy existing state (setup-db on a fresh H2) can fire in the middle of
a test, and whether it does depends on which namespace ran first in the JVM. 44 namespaces declare the fixture by
convention; nothing enforces it.

## Why agents fall for it
The error names a real table as missing and appears only in solo/first-in-JVM runs, which is exactly how agents
verify their edits. It reads as "my edit broke the schema".

## Current state
Fixed for that namespace: `enterprise/backend/test/metabase_enterprise/search/scoring_test.clj:21`
`(use-fixtures :once (fixtures/initialize :db :test-users))`. The general lazy-init hazard remains; no lint requires
the fixture. Not specifically documented in CLAUDE.md or memory (the rollback-only memory covers test-users creation,
not DB recreation).

## Suggested fix
Initialize `:db` (and `:test-users`) eagerly in a hawk `before-run` hook so it can never happen mid-test, or make
`initialize :db` a no-op-or-throw when app-DB tables already have rows written in the current test.

## Detection signal
"(this database is empty)" H2 errors in test output; errors that appear only in single-namespace runs.

## Raw excerpts
```
L1457 29:org.h2.jdbc.JdbcSQLSyntaxErrorException: Table "SEARCH_INDEX_METADATA" not found (this database is empty); SQL statement:
34:    originalMessage: "Table \"SEARCH_INDEX_METADATA\" not found (this database is empty)"
L1459 No testing-context = the error is in the finally.
```
