---
title: jest.config.js splits tests into `projects` that each spread the base config, so a wrapper config overriding `moduleNameMapper` or `rootDir` at the top level never reaches the tests and a mutation run passes against the real component
slug: jest-config-projects-ignore-top-level-overrides
kind: test-harness
impact: wasted-time
severity: low
status: open # origin/master jest.config.js still defines sdk, core, lint-rules and ci-scripts projects
area: jest.config.js, jest.base.conf.js; ad-hoc `--config` wrappers used for mutation or isolation runs
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-a058f782845ea42c2.jsonl
    lines: 83-100
    date: 2026-09-03
    jev: {any_papercut: 0.84, env_toolchain: 0.90, stale_state: 0.29, verify_mismatch: 0.45, misleading_code: 0.27, hidden_coupling: 0.49, stale_docs: 0.29, tool_footgun: 0.85, flaky: 0.19, agent_bug: 0.63, wasted_effort: 0.62, user_correction: 0.05}
---
## Summary
To prove a new regression test discriminates without touching the worktree, a review subagent required the repo's jest.config.js from a scratch config and added a `moduleNameMapper` entry pointing `./MonitorLayout` at a mutated copy. Run one resolved `<rootDir>` to the scratch directory. Run two, with `--rootDir`, passed both target tests: the mutant never loaded because every project carries its own `moduleNameMapper`. Only after patching each project entry did the new test fail as intended.

## Symptom
L84: `Module @swc/jest in the transform option was not found. <rootDir> is: $SCRATCH`. L93: `PASS core … ✓ marks Conversations as the current page for /monitor/ai-auditing/conversations/convo-0` against the supposedly mutated component. L96: the agent works out that the mapper never took effect because each project's own `moduleNameMapper` overrides the top-level one.

## Timeline
- L83-L84: wrapper config spreads the repo config and overrides `rootDir` and `moduleNameMapper` at the top level; run one fails on rootDir.
- L91-L93: `--rootDir` added; both Conversations cases PASS on the mutant.
- L96: agent realizes project-level config shadows the override.
- L97-L99: patches every project, confirms with `--showConfig`, gets the expected failure at line 271.
- Cost: two extra jest runs; taken at face value, run two would have produced a false "test does not catch the regression" finding.

## Root cause
Project-scoped jest options (`moduleNameMapper`, `rootDir`, `transform`, setup files) are read from each entry in `projects`; the top-level value only applies when there are no projects, and a project's `rootDir` defaults to the directory of the config file. Jest does not warn when a top-level project-scoped option is shadowed.

## Why agents fall for it
Wrapping the repo config and adding one mapper is the obvious way to redirect an import without editing files, and nothing reports that the override was ignored: the run is green, which is the result a weak test would also give.

## Current state
origin/master jest.config.js: `projects: [{...baseConfig, displayName: "sdk"}, {...baseConfig, displayName: "core"}, {...nodeProject, displayName: "lint-rules"}, {...nodeProject, displayName: "ci-scripts"}]`.

## Suggested fix
- A short note next to jest.config.js or in the frontend testing docs: overrides must map over `config.projects`; confirm with `jest --showConfig`.
- Optionally a supported hook, for example an env var whose extra `moduleNameMapper` entries are merged into every project.
- Review protocol: a mutation run only counts once the mutant is shown to be loaded.

## Detection signal
A jest run with `--config` outside the repo, `<rootDir> is:` pointing at a scratch directory, or an all-green run labelled as a mutant.

## Raw excerpts
```
L83 [CALL Bash] … cat > "$S/jest.mut.config.js" <<EOF ⏎ const loaded = require(ROOT + "/jest.config.js"); ⏎ module.exports = async () => { ⏎   const base = typeof loaded === "function" ? await loaded() : await loaded; ⏎   return { ...base, rootDir: ROOT, …, moduleNameMapper: { "^\\./MonitorLayout$": SCRATCH + "/MonitorLayout.mut.tsx", ...(base.moduleNameMapper || {}) } }; ⏎ }; ⏎ EOF
L84 [RESULT] … ● Validation Error: ⏎   Module @swc/jest in the transform option was not found. ⏎          <rootDir> is: $SCRATCH
L93 [RESULT] =====MUTATION DIFF (must show 2 hunks)===== ⏎ 26c26 … 56c56 ⏎ <       P.string.startsWith(Urls.monitorAiAuditingConversations()), ⏎ --- ⏎ >       Urls.monitorAiAuditingConversations(), ⏎ =====MUTATION RUN===== ⏎ … ⏎ PASS core frontend/src/metabase/monitor/components/MonitorLayout/MonitorLayout.unit.spec.tsx ⏎     ✓ marks Conversations as the current page for /monitor/ai-auditing/conversations (97 ms) ⏎     ✓ marks Conversations as the current page for /monitor/ai-auditing/conversations/convo-0 (43 ms)
L99 [RESULT] … =====MUTATION RUN===== ⏎ FAIL core …MonitorLayout.unit.spec.tsx ⏎     ✓ marks Conversations as the current page for /monitor/ai-auditing/conversations (94 ms) ⏎     ✕ marks Conversations as the current page for /monitor/ai-auditing/conversations/convo-0 (43 ms) ⏎ … Expected the element to have attribute: aria-current="page" Received: null
```
