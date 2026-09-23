---
title: "App-DB queries only in <module>/db.clj" convention was unlinted and invisible; agent put raw t2 calls back into specialization namespaces during a restack
slug: app-db-queries-only-in-module-db-namespace
kind: codebase-trap
impact: both
severity: medium
status: fixed
area: src/metabase/*/db.clj convention; search module (search.db, appdb/index, specialization/h2|postgres, lease)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 440-470, 635-1067
    date: 2026-09-07
    jev: {self_inflicted_bug: 0.90, tool_misuse: 0.91, misleading_signal: 0.62, user_correction: 0.92, codebase_trap: 0.74, flailing: 0.52, env_friction: 0.85}
---
## Summary
Master (#81824, #81865) moved every module's app-DB queries into `src/metabase/<module>/db.clj`.
The rule lived only in PR history and review; no linter enforced it. Restacking a long-lived branch
(which threaded explicit `conn`s through the same search call sites) onto that master, the agent
resolved conflicts by keeping the branch's raw `t2/delete!`/`t2/insert!`/`t2/query` calls and "fixed
requires" by re-adding `[toucan2.core :as t2]` to `specialization/h2.clj`. It reported the stack as
done. The user corrected: "we're not supposed to use toucan2 outside of <module>.db namespaces now".
A second pass moved ~20 functions plus the lease queries into `search.db` with conn arities.

## Symptom
clj-kondo after restack: `h2.clj:39:12: warning: Unresolved namespace t2. Are you missing a require?`
(L441). The agent treated that as a missing require rather than as a pointer to master's move.

## Timeline
- L440-441: kondo warns t2 unresolved in h2.clj and `search.db` unused in search_index_metadata.clj.
- L462: sed adds `[toucan2.core :as t2]` back to h2.clj; removes `search.db` require.
- L468 commit "Fix requires after restacking onto master's search.db extraction ... h2 needs toucan2 back".
- L635 ASSISTANT: reports restack done; notes it "stopped rather than inventing" the db-namespace pass.
- L637 USER: "we're not supposed to use toucan2 outside of <module>.db namespaces now"
- L641-642: agent greps `.clj-kondo/config.edn` for a toucan2 restriction -- only `t2/debug` found.
- L651-666: agent discovers #81824/#81865 and that only one conn-taking fn (`delete-index-metadata-by-name-on-conn!`) exists across all db.clj.
- L753-963: moves queries into `search.db` (conn arities), lease queries too; strips t2 from h2/postgres specializations.
- L968-969: sweep "t2 query calls outside db.clj" -> clean.
- L1059: writes memory `reference_module_db_namespace_convention.md` ("Nothing lints this yet -- it is a review convention.").

## Root cause
A codebase-wide convention introduced by one large PR (681 files) with no lint, no CLAUDE.md line, and
the db.clj ns docstring as the only statement ("no other namespace in the module runs a query itself").
The `search.db` extraction also mixed styles (dialect SQL lifted out of specializations, five
identical `(t2/query query)` passthroughs), so the "right shape" was not obvious from the code.

## Why agents fall for it
During a conflict-heavy restack, keeping the branch's explicit-connection code and re-adding a require
is the minimal, locally correct fix; kondo's "missing require" message points toward it.

## Current state
Fixed on current master: `.clj-kondo/src/hooks/metabase/toucan/db_ns.clj:126-137` registers
`:metabase/t2-query-namespace` ("Application database query calls like `%s` must live in
metabase[-enterprise].<module>.db ..."), enabled at `.clj-kondo/config.edn:75` (`{:level :warning}`),
off for test namespaces (config.edn:948) and app-db namespaces (config.edn:957). A follow-on
`:metabase/unsafe-app-db-query` (config.edn:76-79, off by default) pushes db.clj toward map queries
with `[:auto/param ...]`. Also documented in auto-memory `reference_module_db_namespace_convention.md`
(now slightly stale: it says "Nothing lints this yet"). Repo CLAUDE.md still does not mention it.

## Suggested fix
Done (linter). Remaining: update the memory's "Nothing lints this yet" line; add one line to the repo
CLAUDE.md "Module Boundaries" section; consider making the lint message suggest "add a conn arity to
the db.clj fn" for explicit-connection callers.

## Detection signal
- User message matching "not supposed to use (toucan2|t2) outside".
- Agent adding `[toucan2.core :as t2]` to a non-db.clj src namespace (diff-level check; now the linter).

## Raw excerpts
```
L441 [RESULT] src/metabase/search/appdb/specialization/h2.clj:39:12: warning: Unresolved namespace t2. Are you missing a require?
src/metabase/search/models/search_index_metadata.clj:5:5: warning: namespace metabase.search.db is required but never used
L637 [USER] we're not supposed to use toucan2 outside of <module>.db namespaces now
L660 [RESULT] === -on-conn naming across master db namespaces ===
   1 defn delete-index-metadata-by-name-on-conn!
L737 [RESULT] (ns metabase.search.db
  "Application database queries for the search module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (connection and transaction handling still use `toucan2.core`)."
```
