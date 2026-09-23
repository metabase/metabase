---
title: `with-model-cleanup` silently runs a full in-place search reindex at scope exit (not in its docstring), so hundreds of tests acquire the search lease inside ambient transactions
slug: with-model-cleanup-hidden-search-reindex
kind: codebase-trap
impact: wasted-time
severity: medium
status: open
area: test/metabase/test/util.clj (do-with-model-cleanup / reindex-search-index!), search lease (src/metabase/search/lease.clj ambient-transactions-allowed?)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-search-reindex-should-use-a-dedicated-lease-not-the-cluster/e3372045-21d0-4423-a7d8-a42d1960d9f7/subagents/agent-a866d6468d3e9ce14.jsonl
    lines: 33-97
    date: 2026-09
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.89, misleading_signal: 0.61, user_correction: 0.25, codebase_trap: 0.75, flailing: 0.44, env_friction: 0.85}
---
## Summary
While measuring what breaks if the search lease refuses acquisition inside an ambient app-db transaction, a subagent found ~40 deftests across 7 files failing at `lease.clj:413`. 16 of them (all of the `actions` module) flow through one path: `with-actions` -> `with-temp` + `tu/with-model-cleanup` -> cleanup `reindex-search-index!` -> `search/reindex! {:in-place? true :async? false}`. The docstring of `with-model-cleanup` says it deletes new rows with raw SQL; it does not mention that it also wipes and repopulates the whole search index whenever any listed model is search-relevant. 147 test files use `with-model-cleanup`. The lease code carries a test-only exception (`ambient-transactions-allowed?` returns `config/is-test?`) largely to accommodate this.

## Symptom
```
L53 171 assertions, 0 failures, 16 errors.
ERROR in metabase.actions.models-test/create-update-select-implicit-action-test (lease.clj:413) ... (16 in actions)
L51 [ASSISTANT] `with-model-cleanup` — used by hundreds of tests — runs a full in-place reindex at scope exit. Whether that's in-txn depends on nesting; the runs will tell.
L95 grep -rln "with-model-cleanup" test enterprise/backend/test | wc -l -> 147
```

## Root cause
A generic test cleanup helper has a heavyweight search side effect (added because "Search has no delete hook, so a row the body deleted may still have its document in the index"), hidden behind a private fn and undocumented in the macro's docstring.

## Why agents fall for it
Reading a failing test, nothing mentions search; the stack points at `lease.clj`. Agents changing search/lease behaviour see unrelated modules (actions, data-studio, metabot) break and can misattribute it. It also makes these tests slow and deadlock-prone (the helper already retries on deadlock).

## Current state
Still present: `test/metabase/test/util.clj:978` `reindex-search-index!` (with deadlock retry), `:989-1016` `do-with-model-cleanup` calls it in `finally` when `reindex?`; macro docstring at `:1018` does not mention search. It has a `TODO (Cam 9/29/25)` to deprecate the macro in favour of rollback-only transactions.

## Suggested fix
- Mention the reindex in the `with-model-cleanup` docstring.
- Once search has delete capture (the search-delete stack), drop the reindex from the cleanup, or scope it to the deleted ids.

## Detection signal
Failures in unrelated modules whose stack bottoms out in search reindex/lease code; `with-model-cleanup` in the failing test's fixture chain.

## Raw excerpts
```
test/metabase/test/util.clj
          ;; Search has no delete hook, so a row the body deleted may still have its document in the index.
          ;; Reindex whenever the cleanup scope touches search, even when nothing is left to delete here.
          (when reindex?
            (reindex-search-index!))
```
