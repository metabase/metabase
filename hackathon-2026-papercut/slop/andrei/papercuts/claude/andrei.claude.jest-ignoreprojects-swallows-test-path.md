---
title: `jest --ignoreProjects ci-scripts <spec path>` treats the path as a second project to ignore because the option is variadic, so jest silently runs all ~2,200 frontend suites instead of one
slug: jest-ignoreprojects-swallows-test-path
kind: tool-quirk
impact: wasted-time
severity: medium
status: open
area: package.json test-unit / test-unit-keep-cljs scripts; jest-cli --ignoreProjects (yargs type: 'array'); jest.config.js projects
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-af57a8eefaff9d874.jsonl
    lines: 649-680
    date: 2026-09-17
    jev: {any_papercut: 0.74, env_toolchain: 0.57, stale_state: 0.34, verify_mismatch: 0.93, misleading_code: 0.20, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.45, flaky: 0.85, agent_bug: 0.20, wasted_effort: 0.71, user_correction: 0.15}
---
## Summary
The package.json scripts spell the invocation `jest --ignoreProjects ci-scripts --maxWorkers=4`, so an appended path lands after a non-variadic flag. An agent that copied the first part and added a spec path, `bunx jest --ignoreProjects ci-scripts <path>`, ran the whole frontend unit suite on a laptop shared with other agents' JVM test runs: 75 s wall at 821% CPU and 'Test Suites: 1792 failed, 391 passed, 2183 total' (the failures themselves are the missing CLJS build, a separate papercut). jest-cli 30.2.0 declares `ignoreProjects` as `{type: 'array', requiresArg: true, string: true}`, so yargs consumes the path as another project name.

## Symptom
L665: `bunx jest --ignoreProjects ci-scripts ...MetabotSystemPromptsPage.unit.spec.tsx` took 1:14.97 wall and 351 s user, ending with 'Ran all test suites in 3 projects.' and 1792 failed suites.

## Timeline
- L649-L650: agent reads the `test-unit-keep-cljs` script and builds its own jest command from it.
- L664-L665: the whole suite runs instead of one file.
- L668-L676: agent traces the failures to the missing CLJS build and builds it.
- L679-L680: `bunx jest --runTestsByPath <path>` without `--ignoreProjects` runs only the file, 4.5 s, 10 tests.
- Cost: about 3 minutes plus a full-suite CPU spike on a machine the prompt had reserved for targeted runs.

## Root cause
yargs array options consume the positional arguments that follow them. `--ignoreProjects ci-scripts <path>` parses as `ignoreProjects = ['ci-scripts', '<path>']` with no test path pattern, so every project's suites run (confirmed in the worktree's jest-cli 30.2.0 args definition).

## Why agents fall for it
The flag reads as taking one value, the documented script hides the problem by putting `--maxWorkers=4` between the flag and any appended path, and jest prints no warning that a path was taken as a project name.

## Current state
Checked origin/master package.json: `test-unit-keep-cljs` is still `jest --ignoreProjects ci-scripts --maxWorkers=4`; `.claude/skills/_shared/typescript-commands.md` documents the safe `bun run test-unit-keep-cljs path/to/file.unit.spec.js`.

## Suggested fix
- Use the `=` form in the scripts (`--ignoreProjects=ci-scripts`) so copied commands stay safe when a path is appended.
- Or exclude `ci-scripts` in jest.config.js by default and opt in from its CI job.
- State in the agent docs that single files run through `bun run test-unit-keep-cljs <path>` or `jest --runTestsByPath <path>`.

## Detection signal
A command matching `jest --ignoreProjects \S+ \S+\.spec`; jest summary 'Ran all test suites in N projects.' after a command that named one spec; `Test Suites:` totals over 1,000 for a single-file run.

## Raw excerpts
```
L664 [CALL] Bash: cd ~/src/mb/wt/<worktree> && time bunx jest --ignoreProjects ci-scripts enterprise/frontend/src/metabase-enterprise/ai-controls/pages/MetabotSystemPromptsPage/MetabotSystemPromptsPage.unit.spec.tsx > <scratchpad>
L665 [RESULT] bunx jest --ignoreProjects ci-scripts  >  2>&1  351.31s user 264.62s system 821% cpu 1:14.97 total
    exit=1
    Test Suites: 1792 failed, 391 passed, 2183 total
    Tests:       26 failed, 4042 passed, 4068 total
    Ran all test suites in 3 projects.
L679 [CALL] Bash: cd ~/src/mb/wt/<worktree> && time bunx jest --runTestsByPath enterprise/frontend/src/metabase-enterprise/ai-controls/pages/MetabotSystemPromptsPage/MetabotSystemPromptsPage.unit.spec.tsx > <scratchpad>/fe-unit-pa
L680 [RESULT] bunx jest --runTestsByPath  >  2>&1  4.54s user 2.66s system 159% cpu 4.524 total
    exit=0
    PASS core enterprise/frontend/src/metabase-enterprise/ai-controls/pages/MetabotSystemPromptsPage/MetabotSystemPromptsPage.unit.spec.tsx
```
