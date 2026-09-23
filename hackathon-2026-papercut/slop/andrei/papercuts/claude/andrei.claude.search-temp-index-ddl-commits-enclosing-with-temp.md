---
title: The reindex orphan sweep issues `DROP TABLE` on whatever connection is bound, including a request transaction conveyed into a reindex `future`, so on Postgres a sweep that loses a race to another sweep aborts the request's transaction
slug: search-temp-index-ddl-commits-enclosing-with-temp
kind: codebase-trap
impact: introduced-bug
severity: high
status: open # master still drops orphans with plain DROP TABLE on the ambient connection; only the 58 backport got IF EXISTS
area: src/metabase/search/appdb/index.clj (delete-obsolete-tables!, orphan-indexes); src/metabase/search/db.clj (drop-search-index-table!); setup API (t2/with-transaction) and the site-locale setting's reindex future; test/metabase/setup_rest/api_test.clj
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/43c18504-de2f-4b9e-999c-99fbc7a01bbc.jsonl
    lines: 651-854
    date: 2026-09-04
    jev: {any_papercut: 0.89, env_toolchain: 0.94, stale_state: 0.31, verify_mismatch: 0.80, misleading_code: 0.22, hidden_coupling: 0.67, stale_docs: 0.31, tool_footgun: 0.86, flaky: 0.87, agent_bug: 0.90, wasted_effort: 0.53, user_correction: 0.53}
---
## Summary
A change that moved the orphaned search-index sweep to the start of `reindex!` was backported to the 58 LTS line and turned the Postgres app-DB jobs red on every attempt, each time in `setup-rest.api-test` with 500s and `ERROR: table "search_index__..." does not exist`. The agent showed from the Postgres server log that every missing-table error was a `DROP TABLE` and that the same backend then hit 'current transaction is aborted': `POST /api/setup` runs in a transaction, setting the site locale fires a reindex `future` that inherits the transaction's connection through binding conveyance, and concurrent sweeps race for the same orphans. 58 also lacked master's exclusion of `_temp` tables from the orphan query, which made races common. Fix on 58: `DROP TABLE IF EXISTS`.

## Symptom
L658-L670: `app-db-tests / Postgres Latest EE App DB Tests (Part 2) fail`, `expected: 200 actual: 500`, `:cause "ERROR: table \"search_index__p3nd97jmobavubihgy_3l\" does not exist"`; L805-L817: Postgres log lines `[100] STATEMENT: DROP TABLE "search_index__..."` followed by the same backend's `current transaction is aborted`.

## Timeline
- L651: the user reports both backport PRs persistently failing.
- L657-L670: failures read: setup API 500s from a missing search_index table.
- L686-L725: agent reads the 58 code paths and finds the race fix (#71290) was never on 58.
- L736-L797: compares markers across jobs and confirms the 58 branch itself was green on its last 8 runs, so the backport caused it.
- L805-L817: Postgres log shows every missing-table error is a `DROP TABLE`.
- L827-L854: explains the mechanism, switches the drop to `:if-exists` as its own commit, reruns tests.
- Cost: two red CI attempts on the backport and about 12 minutes of diagnosis (23:06 to 23:18); the local namespace run had been green.

## Root cause
`delete-obsolete-tables!` runs DDL on the ambient toucan2 connection. When reindexing is triggered inside a request transaction (the setup endpoint sets `site-locale`, which starts a reindex `future`), Clojure's binding conveyance hands the future the transaction's connection. Concurrent sweeps race for the same orphan tables; the loser's `DROP TABLE` fails, and on Postgres any failed statement aborts the enclosing transaction even though the Clojure code catches the exception. Master's `_temp` exclusion only narrows the window.

## Why agents fall for it
The sweep is wrapped in try/catch and logs 'Failed to drop stale index' as harmless, the single-namespace local run passes, and the failures land in an unrelated namespace (setup API tests) only under the parallel suite on Postgres.

## Current state
Checked origin/master: `delete-obsolete-tables!` still calls `search.db/drop-search-index-table!` (plain `DROP TABLE`, no `IF EXISTS`) inside a per-table try/catch on the ambient connection; `drop-search-index-table-if-exists!` exists but is not used there.

## Suggested fix
- Use `drop-search-index-table-if-exists!` in the sweep on master too.
- Run search-index DDL on a fresh connection (`t2/with-connection` bound to a new app-DB connection) so it can never share a caller's transaction.
- Do not convey the request's connection binding into the reindex future; start reindexes after commit.

## Detection signal
Postgres log `STATEMENT:  DROP TABLE "search_index__..."` followed by `current transaction is aborted` on the same backend; test failures with `table "search_index__..." does not exist` in non-search namespaces.

## Raw excerpts
```
L658 [RESULT] === 81984 ===
    head 7f90fc5398d draft=false OPEN
    app-db-tests / Postgres Latest EE App DB Tests (Part 2)	fail	14m32s	https://github.com/metabase/metabase/actions/runs/33924924999/job/101197624863	
L670 [RESULT] 1364:expected: 200
    1365:  actual: 500
    1378:expected: {:id #<Fn@4e72872d metabase.util.string/valid_uuid_QMARK_>}
    1379:  actual: {:cause "ERROR: table \"search_index__p3nd97jmobavubihgy_3l\" does not exist",
L797 [RESULT] 2026-09-04T21:22 run 33920814623: all app-db ok
    2026-09-04T13:48 run 33880142721: all app-db ok
    2026-09-04T11:05 run 33866292733: all app-db ok
L806 [RESULT] === attempt 2: postgres server log lines for backend [100] ===
     2026-09-04 22:59:10.846 UTC [100] WARNING:  there is no transaction in progress
     2026-09-04 22:59:11.466 UTC [100] ERROR:  table "search_index__dviytmhyxpbn_tfe_0kga" does not exist
     2026-09-04 22:59:11.466 UTC [100] STATEMENT:  DROP TABLE "search_index__dviytmhyxpbn_tfe_0kga"
L837 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git status --short | head -3; git log --oneline -1; python3 - <<'EOF'
    import pathlib
    p = pathlib.Path("src/metabase/search/appdb/index.clj")
    s = p.read_text()
    old = "            (t2/query (sql.helpers/drop-table table))\n            (vswap! dropped conj table)"
    new = "            (t2/query (sql.helpers/drop-table :if-exists table))\n            (vswap! dropped conj table)"
```
