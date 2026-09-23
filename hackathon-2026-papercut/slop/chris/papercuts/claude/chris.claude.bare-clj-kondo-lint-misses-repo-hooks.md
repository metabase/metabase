---
title: Running `clj-kondo --lint <file>` directly (not via ./bin/mage kondo) fails to load repo hooks and prints dozens of bogus errors
slug: bare-clj-kondo-lint-misses-repo-hooks
kind: tool-quirk
impact: wasted-time
severity: low
status: documented-still-hit
area: .clj-kondo config/hooks, ./bin/mage kondo, CLAUDE.md
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-search-delete-00-memoize-model-hooks/bc72fc8d-5805-4236-9f38-c525a085b500.jsonl
    lines: 295-343
    date: 2026-08-17
    jev: {self_inflicted_bug: 0.85, tool_misuse: 0.89, misleading_signal: 0.63, user_correction: 0.44, codebase_trap: 0.61, flailing: 0.56, env_friction: 0.88}
---
## Summary
To check whether an inline `#_{:clj-kondo/ignore [:metabase/validate-deftest]}` was still needed, the agent removed it and ran the system `clj-kondo --lint test/metabase/search/models_test.clj`. Hooks resolve from a classpath that `./bin/mage kondo` sets up (it copies dependency configs into gitignored `.clj-kondo/` dirs), so the bare run printed `WARNING: file hooks/toucan2/tools/with_temp not found while loading hook` repeatedly, `Unresolved symbol` errors for every `with-temp` binding, and `errors: 30`. The agent had to filter with `grep -v 'with_temp not found\|with-temp\|Unresolved symbol'` and then fell back to the ratchet counter as its oracle. Later in the same session it used `./bin/mage kondo <files>` correctly (L1506, L1687).

## Symptom
```
L296 [RESULT] WARNING: file hooks/toucan2/tools/with_temp not found while loading hook (x many)
 test/metabase/search/models_test.clj:66:41: error: Unresolved symbol: c2
 test/metabase/search/models_test.clj:81:9: error: Error while loading hook for metabase.test/with-temp: Could not find namespace: hooks.toucan2.tools.with-temp.
L343 linting took 196ms, errors: 30, warnings: 0
```

## Root cause
The repo's kondo setup depends on `mage kondo` preparing configs/hooks; the `clj-kondo` binary on PATH does not. The trap is invisible from `.clj-kondo/config.edn`.

## Why agents fall for it
`clj-kondo --lint file` is the documented upstream usage; CLAUDE.md mentions `./bin/mage kondo-ratchets` but never says "lint with `./bin/mage kondo <files>`, not bare clj-kondo".

## Current state
CLAUDE.md (repo) has no line about `./bin/mage kondo` for linting individual files (grep for "mage kondo " only finds ratchet lines at CLAUDE.md:104/108). The agent found the right command itself later.

## Suggested fix
One line in CLAUDE.md "Clojure" section: "Lint files with `./bin/mage kondo <paths>` (or `kondo-updated <base>`); bare `clj-kondo` misses repo hooks and reports false errors."

## Detection signal
`clj-kondo --lint` in a Bash command in this repo; output containing `not found while loading hook`.

## Raw excerpts
```
L295 cp test/metabase/search/models_test.clj /tmp/mt.bak && perl -0pi -e 's/#_\{:clj-kondo\/ignore \[:metabase\/validate-deftest\]\}\n//' ... && (clj-kondo --lint test/metabase/search/models_test.clj 2>&1 | head -20); cp /tmp/mt.bak ...
L342 clj-kondo --lint test/metabase/search/models_test.clj 2>&1 | grep -v 'with_temp not found\|with-temp\|Unresolved symbol' | head -10
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/72ee4b52-4213-4328-b91b-df0671210015.jsonl
  lines: 187-217
  date: ~2026-09-17
  jev: {self_inflicted_bug: 0.80, tool_misuse: 0.80, misleading_signal: 0.62, user_correction: 0.75, codebase_trap: 0.39, flailing: 0.43, env_friction: 0.95}

This hit a *freshly created worktree* (`git worktree add ../metabase.sql-errors-comment-cleanup`) after a comments-only edit.
Bare `clj-kondo --lint` over 5 files reported `errors: 203`. The agent spent three more tool calls counting and grouping
errors, then linted with the main checkout's config (`--config-dir /Users/christruter/workspace/metabase/metabase/.clj-kondo`).
In a new worktree the gitignored copied configs (`.gitignore:158 **/.clj-kondo/*` with allowlist negations) do not exist until
`./bin/mage kondo` runs `copy-configs-if-needed!` (`mage/src/mage/kondo.clj:35-40`), so the bare linter cannot work at all there.
```
L193 [RESULT] === kondo
linting took 319ms, errors: 203, warnings: 0
L204 [RESULT]   73 test/metabase/search/api_test.clj error Error while loading hook for metabase.test/with-te
  73 WARNING: file hooks/toucan2/tools/with_temp not found while loading hook
   5 WARNING: file hooks/methodical/macros not found while loading hook
   4 test/metabase/test/util.clj error Could not find namespace: hooks.methodical.macros.
=== master
linting took 317ms, errors: 0, warnings: 0
L210 [ASSISTANT] The kondo errors are hook files missing in the fresh worktree's `.clj-kondo`, not my edits. I'll confirm by linting the worktree files with the main checkout's kondo config.
```
The same bare-`clj-kondo --lint` habit shows up in sessions 1dece064 (L631-674) and 31b066ea (`clojure -M:kondo --lint`, L865).
It worked in those older worktrees only because their copied configs already existed.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl (deleted; reconstructed from redacted chunks)
  lines: 292-297
  date: 2026-08-21
  jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}

`clj-kondo --lint <5 files>` (system binary) before committing on PR #80468 printed
`permissions_test.clj:43:49: error: Unresolved symbol: group-a`, `...:44:49: error: Unresolved symbol: group-b`, and
`permissions_test.clj:82:10: error: Error while loading hook for metabase.test/with-temp: Could not find namespace: hooks.toucan2.tools.with-temp.`
The agent: "Those are kondo hook-loading noise from linting outside the project config (the tests ran green). Committing." (L296).
It could not tell real errors from hook noise because the bare run can't load hooks. `./bin/mage kondo <files>` would have answered it.
