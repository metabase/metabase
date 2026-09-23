---
title: Every clj-kondo run prints "WARNING: error while reading .clj-kondo/inline-configs/metabase.lib.expression.cljc/config.edn (Invalid token ...)" — a corrupt cache that keeps regenerating
slug: kondo-inline-config-invalid-token-warning
kind: misleading-signal
impact: wasted-time
severity: low
status: documented-still-hit
area: .clj-kondo/inline-configs (gitignored kondo cache); src/metabase/lib/expression.cljc:366 ignore annotation; any `clj-kondo --lint` / `./bin/mage kondo`
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 1603, 1651, 4971, 5112, 5169, 5203, 5247, 5261, 5278
    date: 2026-09-08..17
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.95, misleading_signal: 0.81, user_correction: 0.66, codebase_trap: 0.63, flailing: 0.33, env_friction: 0.93}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/48981bba-503a-49e5-a945-9a5c51572a3a.jsonl
    lines: 357
    date: 2026-09-14/15
    jev: {self_inflicted_bug: 0.87, tool_misuse: 0.81, misleading_signal: 0.60, user_correction: 0.75, codebase_trap: 0.69, flailing: 0.42, env_friction: 0.56}
---
## Summary
clj-kondo turns the `#_{:clj-kondo/ignore [:unresolved-namespace :syntax]}` annotation above
`(lib.common/defop / ...)` in `src/metabase/lib/expression.cljc:366` into an inline-config cache entry.
It writes the linters vector as the non-EDN token `<vector: [...]>`. Every later kondo run fails to
read that file and prints a WARNING. The file is gitignored and regenerates, so every worktree gets it,
including fresh ones. Agents learn to filter it (`grep -v inline-configs`, `grep -v "^- \.clj-kondo"`).
Meanwhile it adds noise to every lint result, and the same token crashes the pod-based
`mage fix-unused-requires` pre-commit step (see `memory-no-verify-workaround-invites-preemptive-hook-bypass`).

## Symptom
```
WARNING: error while reading /Users/christruter/workspace/metabase/metabase.untangle-util-knots/.clj-kondo/inline-configs/metabase.lib.expression.cljc/config.edn (Invalid token: <vector: ...>
linting took 145ms, errors: 0, warnings: 0
```
This appears in almost every kondo call in the nested-modules session. In L1599 it inflated a
`grep -cE 'warning|error'` count (`lint-findings=6` when there were 4 real warnings).

## Timeline
Background noise across both sessions. L1599 → L1602: the agent had to re-run kondo without `-c` to
see which "findings" were real.

## Root cause
A clj-kondo serialization bug for `:config-in-call` inline configs (prints a vector object as
`<vector: ...>`), triggered by the ignore annotation on a macro-generated `defop`.

## Why agents fall for it
It says WARNING and "error while reading", so line or word counting of kondo output is off by one. It
also looks like repo config breakage.

## Current state
Still present: `.clj-kondo/inline-configs/metabase.lib.expression.cljc/config.edn` in the main checkout,
dated Sep 16, holds `{:config-in-call {metabase.lib.expression//-clause {:ignore {... :linters <vector: [:unresolved-namespace :syntax ...]>}}}}`.
Source annotation: `src/metabase/lib/expression.cljc:366-367`. Documented in memory
`project_fix_unused_requires_pod_crash.md` ("a corrupted gitignored artifact
`.clj-kondo/inline-configs/metabase.lib.expression.cljc/config.edn` ... safe to delete, it
regenerates"). Deleting it does not help, because it regenerates.

## Suggested fix
- Rewrite the annotation so kondo does not produce a `:config-in-call` inline config (e.g. an ns-level `{:clj-kondo/config ...}` or a hook for `defop`). Or upgrade clj-kondo if a newer version fixes the serialization.
- Or have `./bin/mage kondo` filter this known line.

## Detection signal
`error while reading .*inline-configs` in kondo output; agents appending `grep -v inline-configs`.

## Raw excerpts
```
L1599 ./bin/mage kondo ... | grep -cE 'warning|error' | sed 's/^/lint-findings=/'
L1600 [RESULT] lint-findings=6
L1603 [RESULT] WARNING: error while reading /Users/christruter/workspace/metabase/metabase.nested-modules-infrastructure-master/.clj-kondo/inline-configs/metabase.lib.expression.cljc/config.edn (Invalid token: <REDACTED>
... linting took 233ms, errors: 0, warnings: 4
```
