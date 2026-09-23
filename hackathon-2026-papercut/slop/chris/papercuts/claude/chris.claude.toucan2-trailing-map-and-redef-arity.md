---
title: Toucan 2 treats a trailing map in t2/delete!/exists? as a Honey SQL query, and a test's (with-redefs [t2/query identity]) breaks nil-conn delegation
slug: toucan2-trailing-map-and-redef-arity
kind: codebase-trap
impact: both
severity: medium
status: documented-still-hit
area: toucan2 API; src/metabase/search/db.clj; test/metabase/search/appdb/specializations/postgres_test.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 753-991, 2642-2702
    date: 2026-09-07..08
    jev: {nearest flagged chunk 998-1344: self_inflicted_bug: 0.38, tool_misuse: 0.93, misleading_signal: 0.87, user_correction: 0.86, codebase_trap: 0.60, flailing: 0.63, env_friction: 0.88}
---
## Summary
Two Toucan 2 shape traps hit while adding conn arities to `search.db`:
1. The agent factored shared conditions into a helper returning a map
   (`(pending-conditions engine version lang-code index-name)`) and passed it as the last arg of
   `t2/delete!` / `t2/exists?`. Toucan 2 treats a trailing map as a Honey SQL *query*, so every call
   failed at runtime: `These SQL clauses are unknown or have nil values: :engine, :version, :lang_code, :status`.
2. It first wrote `([table entries] (postgres-batch-upsert! nil table entries))` delegation. A
   test does `(with-redefs [t2/query identity] ...)` and expects the 1-arg call shape; `(t2/query nil q)`
   has a different arity than `(t2/query q)`, so delegation through nil breaks the redef. The agent
   reverted to writing both bodies out (L770-774).
Later (L2642-2702) the user asked to DRY the repeated kv conditions; the agent had to explain that
kv args are the only shape where model transforms apply (Honey SQL `:where` bypasses them, which is
why master writes `[:= :status "pending"]` with a string), and the user chose "keep the repetition".

## Symptom
```
L972 [RESULT] ERROR in metabase.search.appdb.index-test/table-cleanup-test (sql.cljc:1975)
clojure.lang.ExceptionInfo: These SQL clauses are unknown or have nil values: :engine, :version, :lang_code, :status (perhaps you need [:lift {:engine ...}] here?)
```

## Timeline
- L794-796: introduces `pending-conditions` returning a map, used as trailing arg.
- L971-972: tests explode with the Honey SQL "unknown clauses" error across index/metadata tests.
- L975-988: rewrites each as explicit kv args with an `if index-name` branch.
- L760-774: finds postgres_test's `with-redefs [t2/query identity]`, rewrites delegating arities as duplicated bodies.
- L2646-2702: DRY discussion; helper/macro options rejected as "hideous"/"yikes".

## Root cause
Toucan 2's variadic arg parser dispatches on arg *types*: kv pairs are conditions (and go through
model transforms), a trailing map is a query. Nothing in the call site distinguishes these.
The redef trap: a test stubs a variadic library fn by arity-sensitive identity.

## Why agents fall for it
Extracting repeated kv conditions into a map-returning helper is the natural DRY refactor; it compiles
and lints clean. The error only shows at runtime.

## Current state
Documented in auto-memory `reference_module_db_namespace_convention.md` (written in this same session,
after the hit): "t2/delete! and t2/exists? treat a trailing map as a Honey SQL query..." and the
`with-redefs [t2/query identity]` arity note. The redef is still present:
`test/metabase/search/appdb/specializations/postgres_test.clj:13` `(with-redefs [t2/query identity]`.
Master is moving db.clj toward map queries with `[:auto/param ...]` (`:metabase/unsafe-app-db-query`,
`.clj-kondo/config.edn:76-79`, off by default), which will change the tradeoff.

## Suggested fix
- A kondo hook: flag `t2/delete!`/`t2/exists?`/`t2/select*` whose last arg is a non-literal symbol/call
  (probably a map) after a model arg.
- Replace `(with-redefs [t2/query identity])` in postgres_test with a test of the built query
  (call the private query-builder directly), removing the arity coupling.

## Detection signal
Test output containing `These SQL clauses are unknown or have nil values:` followed by column names.

## Raw excerpts
```
L761 [RESULT] (deftest batch-upsert-test
  (with-redefs [t2/query identity]
    (let [query (specialization/batch-upsert! :some-table [{:a :b} {:b :c}])]
      (is (= [{:a :b} {:b :c}] (:values query)))
L2693 [ASSISTANT] Checked the source rather than repeating myself: transforms hook `query/apply-kv-arg`, so they apply to kv conditions only. A `:where` you build yourself never passes through it, which is why master writes the encoded string in the one place it does this
L2702 [USER] ok keep the repetition
```
