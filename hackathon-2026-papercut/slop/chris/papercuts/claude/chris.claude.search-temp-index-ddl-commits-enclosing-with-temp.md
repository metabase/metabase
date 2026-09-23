---
title: Search-index DDL (with-temp-index-table's CREATE/DROP TABLE, delete-obsolete-tables!) runs on the ambient connection; nested inside a rollback-only mt/with-temp it implicitly commits on H2/MySQL, destroys the savepoint and leaks every row into later tests (one leaked Transform broke four serialization tests); nested with-temp-index-table also silently reuses the outer table
slug: search-temp-index-ddl-commits-enclosing-with-temp
kind: codebase-trap
impact: both
severity: high
status: open  # mitigated: connection.clj:364-384 throws in tests when a rollback-only savepoint vanished; drop-table!/delete-obsolete-tables! still run DDL on the ambient connection on master (checked 2026-09-23)
merged_from: [ddl-inside-rollback-only-with-temp-leaks-rows]
area: src/metabase/app_db/connection.clj (rollback-only transactions), src/metabase/search/appdb/index.clj (drop-table!, create-table!, with-temp-index-table, delete-obsolete-tables!), src/metabase/search/db.clj, test/metabase/search/test_util.clj, search scoring and transform tests
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
    lines: 1327-1631
    date: 2026-08-24
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.48, misleading_signal: 0.59, user_correction: 0.09, codebase_trap: 0.87, flailing: 0.75, env_friction: 0.64}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc.jsonl
    lines: 2743-2771
    date: 2026-08-24
    jev: {self_inflicted_bug: 0.74, tool_misuse: 0.70, misleading_signal: 0.67, user_correction: 0.68, codebase_trap: 0.87, flailing: 0.23, env_friction: 0.69}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 1932-2258
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.45, tool_misuse: 0.92, misleading_signal: 0.87, user_correction: 0.29, codebase_trap: 0.92, flailing: 0.81, env_friction: 0.89}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 861-976 (the agent's own "savepoint-gone?" change, which roborev flagged High and the agent reverted)
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.98, tool_misuse: 0.64, misleading_signal: 0.63, user_correction: 0.42, codebase_trap: 0.87, flailing: 0.63, env_friction: 0.70}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-boost-metabot-library-selection/83b14905-733c-4844-8ea9-7f3fb00a3cb9.jsonl
    lines: 105-149, 292-310
    date: 2026-09-16
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.81, misleading_signal: 0.63, user_correction: 0.43, codebase_trap: 0.75, flailing: 0.46, env_friction: 0.91}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl
    lines: 623-1018
    date: 2026-09-20
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.95, misleading_signal: 0.76, user_correction: 0.29, codebase_trap: 0.81, flailing: 0.49, env_friction: 0.81}
---
## Summary
Each top-level `mt/with-temp` is a rollback-only transaction that uses a savepoint. On H2 and MySQL/MariaDB app
DBs, any DDL issued on the same connection (`DROP TABLE`, `CREATE TABLE`) commits the open transaction. This makes
the temp rows durable and destroys the savepoint. At scope exit, `ROLLBACK TO SAVEPOINT` fails with
`Savepoint is invalid` (H2) or `SAVEPOINT does not exist` / 1305 (MySQL). toucan's compensating deletes run after
the implicit commit and are rolled back, so the rows leak into later tests. Postgres keeps DDL transactional, so the
same code is harmless there. Postgres is the local default app DB (see
`local-test-appdb-differs-per-worktree-lein-env`), which hides the trap locally.

The vehicle every time was the search appdb index. `search.index/with-temp-index-table` inserts index metadata,
`create-table!`s a temp index table, runs the body, and `drop-table!`s it in a `finally`; `delete-obsolete-tables!`
drops orphan tables. All of it runs on whatever connection is current. Tests that open the index scope *inside*
`mt/with-temp` therefore commit the with-temp transaction halfway through. In CI one leaked `Transform` named "test
transform" (from `enterprise search.scoring-test/transforms-user-recency-test`) made all four
`serialization.api-test` export tests see +1 entity (models 12->13, archive files 13->14), because collection-scoped
exports include every Transform unconditionally. The leak and the failure are in unrelated namespaces, connected only
by JVM run order.

A second facet pulls the other way: `with-temp-index-table` silently **reuses** the outer table when nested
("Uses the existing index if we're already mocking"). Hoisting one index scope around a whole deftest, the obvious
fix for the DDL problem, makes every nested `with-index-contents` insert into the same table, so ranking assertions
see rows from sibling blocks. The index scope must sit outside `with-temp` (DDL), yet each case needs its own scope
(no nested reuse).

The rollback warning that would have pointed at this was invisible in test output; see
`test-log-console-fatal-hides-warnings` (the log console shows only FATAL).

## Symptom
- Subagent a60c5f8a / a4d08ba6: four serialization tests failing in CI with exactly one extra entity; typed-schemas
  and transforms-rest tests also failing on "extra" committed cards; no local reproduction without the right
  predecessor set.
- Session 31b066ea: driver CI jobs fail on unrelated tests. `root-collection-items-include-transforms-test`
  expected 1 transform and got 4. `filter-transforms-test` got an extra `{:id 13371338 ...}`. The failures move
  between drivers across reruns, so the agent first called them infra (L1913).
- Session 83b14905: `metabot-weights-test` errors on a fresh H2 app DB with `Savepoint is invalid:
  "SYSTEM_SAVEPOINT_676"`; after the hoist, ranking tests fail with extra ids from sibling blocks.
- Session 025e8586: a reported CI failure, `Could not roll back a rollback-only transaction (Savepoint is invalid:
  "SYSTEM_SAVEPOINT_260" ...)`, "did not reproduce" locally because the run used Postgres (L820), then reproduced
  on H2 (L848-857).

## Timeline
Subagent a60c5f8a and parent a4d08ba6 (fix/app-db-rollback-only, 2026-08-24):
- Subagent L1321-1337: builds a probe namespace that dumps surviving rows after the suspect set; a tap reports
  `in-txn` where the wrapper should have prevented it (turned out to be a model-hook transaction).
- L1386-1401: wraps six tests so the index-table scope is *outside* the with-temp; the parent agent had committed
  under it in the meantime ("The coordinator has been committing under me").
- L1455-1531: EE scoring namespace also errors solo -- a second, pre-existing bug (lazy DB init, see
  `lazy-test-db-init-mid-test-recreates-h2-app-db`).
- L1535: extra search hit `["database" 1 "test-data (h2)"]` because the test-data Database materialized inside the
  temp-index scope; fix: hoist `(mt/id)` above the wrapper.
- Parent L2759-2768 commit `53ea07d71a4` "Create the temp search index before the transaction, not inside it";
  predecessor set 5011 assertions / 5 failures -> 4714 / 0. (Session 31b066ea later cites the same fix as
  `6bc04de1f0e`, presumably the rebased hash.)

Session 31b066ea (fix/app-db-rollback-only, PR #80065, 2026-08-25):
- L869-901: to address a CI deadlock, the agent adds `savepoint-gone?`. When the savepoint no longer exists, the
  new code skips setting `*rollback-required*`. Reasoning: "the server has already discarded the writes".
- L962-976: roborev 4873 (High): "A missing savepoint does not prove that no writes remain pending. After MySQL
  implicitly commits and removes the savepoint, later statements can start a new transaction ..." The agent:
  "my `savepoint-gone?` change is a regression, and I should revert it ... I anchored on 'the server already
  discarded the writes' and never checked what happens to writes made *after* the implicit commit."
- L1932-1957: failures reproduce under `DRIVERS=mysql` with a MariaDB container: branch 3 failures, master 0.
- L2098: the bisect blames the PR's core commit `8540522087a`. Before that commit, `:rollback-only` silently
  committed and toucan's compensating deletes cleaned up.
- L2219 (subagent): the three leaking tests wrap `search.tu/with-appdb-search-and-legacy-search` inside a top-level
  `mt/with-temp [:model/Transform ...]`. `drop-table!` (index.clj) "issues `DROP TABLE` through the ambient tx
  connection". Three more latent cases are in `enterprise/.../transforms/api_test.clj`. All six are gated on
  `mt/normal-drivers-with-feature :transforms/table`, so an H2-only run never executes them.
- L2245: fix. The index scope is hoisted above `mt/with-temp`, "the same hoist as `6bc04de1f0e` 'Create the temp
  search index before the transaction, not inside it'". The earlier sweep had missed these six because they are
  driver-gated.
- L2280-2317: the user asks how to catch this class in future. #1 routes the warning to the console. #2 throws in
  test mode, stacked.

Session 83b14905 (boost-metabot-library-selection, PR #82337, 2026-09-16):
- L105-114: the branch's own `metabot-weights-test` in `test/metabase/search/appdb/scoring_test.clj` had a library
  block that called `mt/with-temp` and then `with-index-contents` (-> `search.tu/with-temp-index-table` ->
  `create-table!`) inside it. On a fresh H2 app DB (`MB_DB_TYPE=h2 MB_DB_DBNAME= ... MB_ENCRYPTION_SECRET_KEY=`)
  it failed with the savepoint error (Raw excerpts).
- L138: after hoisting one `with-temp-index-table` around the whole deftest (the fix `user-recency-test`
  documents), 4 FAILs at scoring_test.clj:465/473/474/485 ("Now the blocks share one index table and their rows pile
  up").
- L292-310 (a later edit): `expected: [5 11] actual: (5 11 4 3)` / `expected: [11 3] actual: (5 4 11 3)`. "The
  failures are the same row pile-up as before: nested `with-index-contents` reuse the outer table."
- The fix both times was one `with-temp-index-table` per `with-temp` block, created *outside* that block.

Session 025e8586 (2026-09-20):
- L623-710: the agent works out a burst-flake mechanism. A `with-model-cleanup` reindex inside `with-temp` reaches
  `delete-obsolete-tables!`, which drops orphan tables on the ambient connection.
- L779-820: the test passes with the fix and fails as a control. The agent concludes "Timofei's stated mechanism
  does not reproduce. On this H2, `DROP TABLE` inside a transaction is transactional" (wrong, see below).
- L829-857: the user asks "what about postgres and mysql". `.lein-env` set the app DB to postgres. With
  `MB_DB_TYPE=h2`: `Could not roll back a rollback-only transaction (Savepoint is invalid ...). Something in it
  committed the transaction -- DDL commits implicitly on H2 and MySQL`.
- L869: MariaDB skips the test (appdb search supports only `#{:postgres :h2}`).
- L922-1018: fix. On H2 inside a transaction, the drop borrows its own connection. Draft PR #82810, branch
  `search-sweep-isolate-h2-ddl`, commit `d3a5a218a55` "Sweep orphan search index tables off the caller's
  transaction on h2" ("Dropping a table is DDL, which commits implicitly on h2 ... the rollback fails with
  'Savepoint is invalid', leaking the transaction's writes into later tests").

## Root cause
The transaction semantics differ by backend and nothing in the API shows it. `t2/with-connection`, `t2/query` or raw
`jdbc/execute!` DDL inside any caller's transaction silently runs on that transaction's connection. The code that
issues DDL (search index helpers) does not know it may run inside a test's rollback-only scope. The tests that nest
it do not know the helper issues DDL. Before PR #80065, rollback-only did not really roll back, which masked the
problem. Separately, `with-temp-index-table` short-circuits to the enclosing table when `*mocking-tables*` is
already bound, so nesting it is not isolation.

## Why agents fall for it
- Macro nesting order (`with-temp` outside vs inside `with-temp-index-table`) looks cosmetic, and the nested-reuse
  behaviour punishes the obvious "hoist one scope over everything" fix.
- The local default app DB is Postgres (`.lein-env`), where DDL is transactional. Locally, everything passes.
- Many affected tests are skipped on H2 by driver gates, so only a driver CI job shows the leak.
- The leak shows up in a different, later test, so the failing test name points away from the cause.
- The rollback warning was invisible in test output (see `test-log-console-fatal-hides-warnings`).
- "Savepoint is gone" reads like "nothing to roll back", which invites the unsafe `savepoint-gone?` shortcut.

## Current state
Checked 2026-09-23 against the checkout at `bf3d250f132` (branch off master; `d3a5a218a55` is on neither it nor
origin/master). The two write-ups disagreed (`fixed` vs `open # mitigated`); the code supports `open`, mitigated:
- `src/metabase/app_db/connection.clj:364-384`: at depth 1, a failed rollback-only rollback now throws under
  `config/is-test?`: "Those writes will leak into every later test. Run the DDL outside the rollback-only scope, or
  on its own connection." The comment names "search's `drop-table!` send raw SQL over the ambient connection". This
  makes the trap loud in tests rather than silent.
- `src/metabase/search/appdb/index.clj:111-114` `drop-table!` calls `search.db/drop-search-index-table-if-exists!`
  (`src/metabase/search/db.clj:118-121`, a plain `t2/query`) on whatever connection is current.
  `with-temp-index-table` (`index.clj:417-438`) still calls it in its `finally`.
- `delete-obsolete-tables!` (`index.clj:120-139`) still drops orphans with `search.db/drop-search-index-table!` on
  the ambient connection. The H2 isolation fix is only on branch `search-sweep-isolate-h2-ddl` (`d3a5a218a55`, draft
  PR #82810).
- `create-table!` (`index.clj:141-147`) wraps the DDL in `t2/with-transaction [_ (mdb/app-db)]`. The 31b066ea
  subagent called it "safe (own connection)", but under the default `:nested-transaction-rule :allow`
  (`connection.clj:479-520`) that appears to nest a savepoint on the caller's connection rather than open a new
  one, and the 83b14905 occurrence tripped the savepoint error through `create-table!`. Treat it as unsafe.
- Nested reuse is unchanged: `index.clj:419` `(if @#'*mocking-tables* ~@body ...)`. The only documentation is a
  comment on `user-recency-test` (`test/metabase/search/appdb/scoring_test.clj:307-309`): "The nested index-table
  scope below reuses this table."
- Affected tests reordered (e.g. `enterprise/backend/test/metabase_enterprise/search/scoring_test.clj:203`).
- Memory: `reference_rollback_only_cache_pattern.md` (DDL mechanism), `reference_drop_table_if_exists_no_signal.md`
  (related), `reference_local_test_agent_uses_postgres.md` (H2 vs Postgres DDL difference, from 025e8586). The
  related `chris.codex.cluster-lock-transaction.md` covers the near-miss `in-transaction?` guard from 025e8586.

## Suggested fix
- Make `drop-table!`, `create-table!` and every search-index DDL helper run on a dedicated connection whenever
  `(mdb/in-transaction?)`, on every backend (the approach `d3a5a218a55` takes for the sweep). Then nesting order
  stops mattering and no caller can put DDL inside someone else's transaction.
- Make nested `with-temp-index-table` either create a fresh table or throw, instead of silently reusing the outer
  one.
- Add a toucan pipeline or JDBC-level guard: in tests, throw when a DDL statement runs while
  `*transaction-depth*` > 0 on H2 or MySQL. This catches the bug where it happens instead of at rollback.
- Add a CLAUDE.md note under testing: "No DDL inside `mt/with-temp`; give each `with-temp` block its own
  `with-temp-index-table`, created outside it."

## Detection signal
- The test output has `Savepoint is invalid` / `SAVEPOINT does not exist` / `Could not roll back a rollback-only
  transaction`, or the connection.clj "committed the transaction -- DDL commits implicitly" exception.
- "+1 entity" / count-off-by-one failures in export or listing tests, especially where the extra row has a test-ish
  name ("test transform", random uppercase names), or only on MySQL/MariaDB driver jobs.
- Ranking tests whose `actual` contains extra ids from sibling `testing` blocks.
- Static check: `with-temp-index-table`, `with-index-contents`, `create-table!` or `drop-table!` lexically inside
  `mt/with-temp`/`with-transaction` in test code; nested `with-temp-index-table`.

## Raw excerpts
```
a4d08ba6 L2743 subagent report headline: the serialization api-test group was one leaked committed `Transform` riding along
in every export -- leaked by `metabase-enterprise.search.scoring-test/transforms-user-recency-test` through a
mechanism that is a general leak factory: `search.index/with-temp-index-table` runs `CREATE/DROP TABLE` on the
ambient connection, so any test that opens it *inside* a `with-temp` gets its transaction implicitly committed on
H2/MySQL and its rows leak. I found six such tests ...
```
```
a60c5f8a L1398 comment added to tests: "the temp index table is created here, before `with-temp` opens its transaction:
creating it inside would run DDL on the ambient connection, which on H2/MySQL implicitly commits the transaction, so ..."
```
```
31b066ea L2258 [ASSISTANT] ## The mechanism
1. Each opens a top-level `mt/with-temp [:model/Transform …]` — a rollback-only transaction — and *inside it* enters `with-appdb-search-and-legacy-search`.
2. That reaches `search.index/with-temp-index-table`. `create-table!` is safe (own connection), but the `finally`'s **`drop-table!` runs `DROP TABLE` on the ambient connection**.
3. H2 and MySQL implicitly commit to do DDL — so the temp Transforms become durable and the savepoint is destroyed.
4. The rollback then fails, lands in the vanished-savepoint path, and plain-rolls-back the connection — discarding toucan's compensating deletes, which had run *after* the implicit commit. The rows survive.

31b066ea L976 [ASSISTANT] depth 2:  DDL          → MySQL commits implicitly, all savepoints destroyed
          INSERT       → starts a *new* transaction, writes now pending
          body ends    → ROLLBACK TO SAVEPOINT fails (1305)
                       → my code suppresses *rollback-required*
depth 1:  catches it, continues, reaches .commit
                       → commits the INSERT
```
```
83b14905 L114 ERROR in metabase.search.appdb.scoring-test/metabot-weights-test (connection.clj:379)
clojure.lang.ExceptionInfo: Could not roll back a rollback-only transaction (Savepoint is invalid: "SYSTEM_SAVEPOINT_676"; SQL statement:
ROLLBACK TO SAVEPOINT SYSTEM_SAVEPOINT_676 [90063-214]). Something in it committed the tr…
```
```
025e8586 L848 [RESULT] ERROR in metabase.search.appdb.index-test/sweep-leaves-an-enclosing-transaction-intact-test (connection.clj:379)
Uncaught exception, not in assertion.
  clojure.lang.ExceptionInfo: Could not roll back a rollback-only transaction (Savepoint is invalid: "SYSTEM_SAVEPOINT_260"; SQL statement:
  ROLLBACK TO SAVEPOINT SYSTEM_SAVEPOINT_260 [90063-214]). Something in it committed the transaction -- DDL commits implicitly on H2 and MySQL -- so its writes up to that point are already durable. ...
```
