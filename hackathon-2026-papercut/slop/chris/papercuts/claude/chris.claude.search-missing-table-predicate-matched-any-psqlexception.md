---
title: search's table-not-found-exception? matched any PSQLException, so the missing-index-table test passed on Postgres for the wrong reason (upsert never reached the table)
slug: search-missing-table-predicate-matched-any-psqlexception
kind: codebase-trap
impact: both
severity: medium
status: fixed
area: src/metabase/search/appdb/index.clj (safe-batch-upsert!, delete!), test/metabase/search/appdb/index_test.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 1784-1892, 2846-2966
    date: 2026-09-08
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.90, misleading_signal: 0.68, user_correction: 0.55, codebase_trap: 0.72, flailing: 0.70, env_friction: 0.89}
---
## Summary
Master's predicate was:
```clojure
(defn- table-not-found-exception? [e]
  ;; Use with care, obviously this can give false positives if used with a query that's *actually* malformed.
  ;; TODO we should handle the MySQL and MariaDB flavors here too
  (or (instance? PSQLException (ex-cause e))
      (= mdb/jdbc-sql-syntax-error-exception-classname (some-> e ex-cause class .getName))))
```
The user asked the agent to address the TODO (L1784), and the agent narrowed the predicate to SQLState
`42P01`/`42S02`. `missing-index-table-does-not-abort-enclosing-transaction-test` then failed on Postgres.
Probing showed that the test's upsert entry, `{:model "card" :model_id "1"}`, has no column beyond the
conflict target. The Postgres upsert therefore had an empty `DO UPDATE SET` and failed with a *syntax
error* (`42601`) before it touched the dropped table. The old "any PSQLException" predicate read that
syntax error as "table missing", so the test had always passed without exercising its scenario. The fix
added `:name "x"` to the entry, with a comment. Later, roborev (L2846-2876) noted that the codebase
already classifies missing-table errors per driver (`driver/table-known-to-not-exist?`, H2
`42S02`/`42S03`/`42S04`), and the agent aligned the codes.

## Symptom
```
L1849 FAIL in ...missing-index-table-does-not-abort-enclosing-transaction-test (index_test.clj:858)
expected: (thrown-with-msg? clojure.lang.ExceptionInfo #"Currently tracked index does not exist" ...)
  actual: nil
L4000-4001 (rendered) PROBE raw [0] clojure.lang.ExceptionInfo sqlstate=null msg=ERROR: syntax error at end of input
                      PROBE raw [1] org.postgresql.util.PSQLException sqlstate=42601 msg=ERROR: syntax error at end of input
L1861 [ASSISTANT] Found it, and it's a genuine bug the tightening exposed rather than caused.
```

## Root cause
The exception classifier was too broad, and its own comment admitted it. The test fixture used a
minimal entry that is invalid for the dialect's upsert builder. Together they produced a vacuous pass.

## Why agents fall for it
A green test named for exactly the scenario looks like proof. The broad predicate hides the fixture
bug, and tightening the predicate looks like it *caused* a regression.

## Current state
Fixed on current master: `src/metabase/search/appdb/index.clj:279,289,374` now calls
`sql-errors/table-not-found?` (`src/metabase/app_db/sql_errors.clj:81-84`, "Whether `e` was caused by
querying a table that does not exist", via `error-kind`). The local predicate and the PSQLException import are gone.

## Suggested fix
Done. General lesson for a tracker: an exception predicate keyed on a driver's exception *class*
instead of on SQLState or error code is a vacuous-pass risk.

## Detection signal
Code that uses `(instance? PSQLException ...)` or a class-name comparison as a classifier. Tests that
assert "throws X" where X is thrown on a broad catch. Tightening a predicate that flips a test from pass to `actual: nil`.

## Raw excerpts
See Summary and Symptom.
