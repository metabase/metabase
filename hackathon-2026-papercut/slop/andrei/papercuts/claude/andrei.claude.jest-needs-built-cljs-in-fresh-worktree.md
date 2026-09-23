---
title: In a fresh metabase worktree, `bun run jest <spec>` and the documented `bun run test-unit-keep-cljs` fail with a moduleNameMapper 'Could not locate module cljs/...' error because `target/cljs_dev` does not exist; the agent copied another checkout's compiled CLJS to get tests running
slug: jest-needs-built-cljs-in-fresh-worktree
kind: env-friction
impact: wasted-time
severity: medium
status: open
area: `package.json` (`test-unit` vs `test-unit-keep-cljs`), jest `moduleNameMapper` for `cljs/*` → `target/cljs_dev`, `.claude/skills/_shared/typescript-commands.md`, git worktrees
merged_from: jest-unit-tests-need-cljs-build-in-fresh-worktree
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/31e1a415-680c-4ede-a3d2-fbb1d6e6a89c/subagents/agent-a30dfe6e4a2afcd26.jsonl
    lines: 99-119
    date: 2026-08-26
    jev: {any_papercut: 0.84, env_toolchain: 0.91, stale_state: 0.33, verify_mismatch: 0.46, misleading_code: 0.20, hidden_coupling: 0.57, stale_docs: 0.55, tool_footgun: 0.61, flaky: 0.42, agent_bug: 0.62, wasted_effort: 0.39, user_correction: 0.07}
---
## Summary
Verifying a frontend fix in an existing worktree, the subagent found no `node_modules`, installed them, then hit a jest configuration error for `cljs/metabase.util.currency`. Jest maps `cljs/*` imports to `target/cljs_dev`, which only `bun run build:cljs` creates. Instead of building it, the agent copied 729 compiled files from the main checkout, which was on a different branch, and ran and judged the specs against that.

## Symptom
- L99-L100: `missing-node-modules`.
- L105-L106: `bun install --frozen-lockfile`, 6228 packages.
- L107-L108: `Test suite failed to run | Configuration error: Could not locate module cljs/metabase.util.currency mapped as: ~/src/mb/wt/<branch>/target/cljs_dev/$1`.
- L110-L112: `package.json`: `"test-unit": "bun run build:cljs && jest --maxWorkers=4"`, `"test-unit-keep-cljs": "jest --maxWorkers=4"`.
- L113-L116: copies `~/src/mb/metabase/target/cljs_dev` into the worktree (the first `cp` fails, the second works).

## Timeline
- L99-L106: install node dependencies.
- L107-L108: jest configuration error.
- L110-L112: finds that only `test-unit` builds CLJS.
- L113-L116: copies the main checkout's compiled CLJS.
- L118-L119: spec passes.
- L140-L157: a `MetabotSettingsPanel` failure is judged pre-existing, tested only against the copied CLJS.
- Cost: about 6 calls, and test verdicts produced against another branch's compiled CLJS.

## Root cause
Frontend unit tests import compiled ClojureScript from `target/cljs_dev`. Only `test-unit` builds it; `test-unit-keep-cljs`, the command the shared skill tells agents to use, assumes it exists. Fresh worktrees have neither `node_modules` nor `target/`. The error comes from jest's moduleNameMapper and does not say 'build CLJS first'.

## Why agents fall for it
The documented fast command works in the long-lived main checkout, so neither docs nor habit surface the prerequisite. Copying the neighbour's `target/cljs_dev` makes the error vanish at once, and nothing flags that it was compiled from different sources.

## Current state
Checked origin/master: `.claude/skills/_shared/typescript-commands.md` says 'Test a specific file: `bun run test-unit-keep-cljs path/to/file.unit.spec.js`' with no build step. The fe-modularization skill notes that a stale `target/cljs_dev` breaks `type-check-pure` and says to rebuild CLJS in the worktree.

## Suggested fix
- A jest globalSetup (or pre-script) that checks for `target/cljs_dev` and fails with 'run `bun run build:cljs` first'.
- One line in `typescript-commands.md`: in a new worktree, run `bun install` and `bun run build:cljs` once before `test-unit-keep-cljs`.
- Say explicitly that `target/cljs_dev` must not be copied between checkouts.

## Detection signal
`Could not locate module cljs/` in jest output; `cp -R .*target/cljs_dev` from one checkout into another.

## Raw excerpts
```
L99 [CALL] cd ~/src/mb/wt/<branch> && ls node_modules/.bin/jest >/dev/null 2>&1 && echo has-node-modules || echo missing-node-modules
L100 [RESULT] missing-node-modules
L105 [CALL] cd ~/src/mb/wt/<branch> && bun install --frozen-lockfile 2>&1 | tail -5
L106 [RESULT] ... 6228 packages installed [4.90s]
L107 [CALL] cd ~/src/mb/wt/<branch> && bun run jest frontend/src/metabase/admin/settings/components/widgets/AdminSettingInput.unit.spec.tsx 2>&1 | tail -40
L108 [RESULT] ● Test suite failed to run |     Configuration error: |     Could not locate module cljs/metabase.util.currency mapped as: |     ~/src/mb/wt/<branch>/target/cljs_dev/$1. |     Please check your configuration for these entries: ...
L112 [RESULT] better_cond.core.js | ... | 543:    "test-unit": "bun run build:cljs && jest --maxWorkers=4", | 544:    "test-unit-keep-cljs": "jest --maxWorkers=4",
L113 [CALL] mkdir -p ~/src/mb/wt/<branch>/target && cp -R ~/src/mb/metabase/target/cljs_dev ~/src/mb/wt/<branch>/target/cljs_dev && du -sh ...
L114 [RESULT (ERROR)] Exit code 1
L115 [CALL] mkdir -p ~/src/mb/wt/<branch>/target && cp -R ~/src/mb/metabase/target/cljs_dev ~/src/mb/wt/<branch>/target/ 2>&1 | head -5; ls ~/src/mb/wt/<branch>/target/cljs_dev 2>/dev/null | wc -l
L116 [RESULT] 729
L118 [CALL] cd ~/src/mb/wt/<branch> && bun run test-unit-keep-cljs frontend/src/metabase/admin/settings/components/widgets/AdminSettingInput.unit.spec.tsx 2>&1 | tail -45
L119 [RESULT] $ jest --maxWorkers=4 frontend/src/metabase/admin/settings/components/widgets/AdminSettingInput.unit.spec.tsx | ... PASS ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-af57a8eefaff9d874.jsonl
  lines: 653-680
  date: 2026-09-17
  jev: {any_papercut: 0.74, env_toolchain: 0.57, stale_state: 0.34, verify_mismatch: 0.93, misleading_code: 0.20, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.45, flaky: 0.85, agent_bug: 0.20, wasted_effort: 0.71, user_correction: 0.15}

L665-L669: the page's spec fails at import (`MetabotSystemPromptsPage.unit.spec.tsx:8:22`) with a moduleNameMapper message pointing at `<worktree>/target/cljs_dev/$1`, and 1792 suites fail the same way.

- L653-L654: `bun install --frozen-lockfile` in the new worktree.
- L664-L669: the jest run fails on missing CLJS output.
- L672-L676: agent checks for an edition variable, then runs `bun run build-pure:cljs` (17 s).
- L679-L680: the spec passes, 10 tests.
- Cost: about 2 minutes here; the error text points at jest configuration rather than at a missing build step.

```
L665 [RESULT] bunx jest --ignoreProjects ci-scripts  >  2>&1  351.31s user 264.62s system 821% cpu 1:14.97 total
    exit=1
        + ~/src/mb/wt/<worktree>/target/cljs_dev/$1.
        +   \"moduleNameMapper\": {
L669 [RESULT] 18195:FAIL core enterprise/frontend/src/metabase-enterprise/ai-controls/pages/MetabotSystemPromptsPage/MetabotSystemPromptsPage.unit.spec.tsx
    18226:      at Object.<anonymous> (enterprise/frontend/src/metabase-enterprise/ai-controls/pages/MetabotSystemPromptsPage/MetabotSystemPromptsPage.unit.spec.tsx:8:22)
L675 [CALL] Bash: cd ~/src/mb/wt/<worktree> && (time bun run build-pure:cljs) > <scratchpad>/cljs-build.log 2>&1; echo "exit=$?"; tail -8 <scratchpad>/cljs-build.log
L676 [RESULT] exit=0
    [:app] Build completed. (492 files, 492 compiled, 0 warnings, 9.46s)
L680 [RESULT] bunx jest --runTestsByPath  >  2>&1  4.54s user 2.66s system 159% cpu 4.524 total
    exit=0
    PASS core enterprise/frontend/src/metabase-enterprise/ai-controls/pages/MetabotSystemPromptsPage/MetabotSystemPromptsPage.unit.spec.tsx
```
