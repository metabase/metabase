---
title: `MetabotAgentDataSourcePills.unit.spec.tsx` "sends a feedback request when changing an already selected source" fails about one run in three, and a single passing master control convinced an agent its unrelated change broke it
slug: metabot-datasource-pills-feedback-test-click-race
kind: test-harness
impact: wasted-time
severity: medium
status: open # test body unchanged on origin/master
area: frontend/src/metabase/metabot/components/MetabotChat/MetabotAgentDataSourcePills.unit.spec.tsx
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-a5d89ecb4342317b2.jsonl
    lines: 142-196
    date: 2026-09-03
    jev: {any_papercut: 0.84, env_toolchain: 0.56, stale_state: 0.18, verify_mismatch: 0.76, misleading_code: 0.27, hidden_coupling: 0.66, stale_docs: 0.22, tool_footgun: 0.58, flaky: 0.92, agent_bug: 0.50, wasted_effort: 0.71, user_correction: 0.07}
---
## Summary
Running the wider metabot suites after a chain-of-thought change, the agent hit one failure in the data-source pills spec. It failed twice in isolation and passed once with master's versions of the changed files, so the agent concluded its change caused it and spent about ten calls bisecting import order and writing an import-graph script, which found no path from the spec to the changed file. Three runs per side then showed the test fails intermittently on both. The agent's reading: the first wait resolves as soon as the request is recorded, so the second click can land while the buttons are still disabled.

## Symptom
L148: two isolated runs `✕ sends a feedback request when changing an already selected source`; L153: with master's files `12 passed`; L156: the agent concludes its change caused the DataSourcePills failure; L188: `my utils.tsx x3` fail/pass/fail, `master utils.tsx x3` pass/fail/pass, and even a `throw` at the top of the changed module fails the same way.

## Timeline
- L142-L144: one failure out of 480 in the wider run.
- L146-L148: isolated reruns fail twice; no reference from the spec to the changed code.
- L151-L153: master versions pass once; L156 wrong causal conclusion.
- L163-L177: import-only bisect, eslint no-cycle attempt, a Python import-graph script ("no path").
- L186-L188: three runs per side, flaky on both; L191 flake confirmed; L196 spawns a task to fix the spec.
- Cost: about 12 tool calls and one wrong intermediate verdict; the PR was pushed while this was unresolved.

## Root cause
Per the agent's analysis (not verified here): the spec waits for the first feedback request to be recorded, then clicks the second option while the component's mutation is still loading and the buttons are disabled, so the second request sometimes never fires.

## Why agents fall for it
A red test right after a change reads as causal, and one green control on master looks decisive; a one-in-three flake needs several runs per side to show.

## Current state
origin/master spec lines 164-185: click "Source is correct", `waitFor` one call to the feedback endpoint, click "Source is wrong", `waitFor` two calls; no wait for the buttons to re-enable. Last change to the file predates this session.

## Suggested fix
- Wait for the "Source is wrong" button to be enabled (or for the first mutation to settle) before the second click.
- Agent habit: before blaming a change for a single red test, run the test three or more times on each side.

## Detection signal
`MetabotAgentDataSourcePills › sends a feedback request when changing an already selected source` failing with `toHaveLength(2)` on unrelated diffs.

## Raw excerpts
```
L144 [RESULT] 37:FAIL core frontend/src/metabase/metabot/components/MetabotChat/MetabotAgentDataSourcePills.unit.spec.tsx ⏎ 38:  ● MetabotAgentDataSourcePills › sends a feedback request when changing an already selected source
L148 [RESULT] === does the failing spec/component touch the chain-of-thought code? === ⏎ (grep exit 1; 1 = no references) ⏎ === rerun in isolation, twice === ⏎     ✕ sends a feedback request when changing an already selected source (1061 ms) ⏎ Tests:       1 failed, 11 passed, 12 total ⏎     ✕ … ⏎ Tests:       1 failed, 11 passed, 12 total
L153 [RESULT] … === DataSourcePills spec with master's versions of my two files === ⏎ Tests:       12 passed, 12 total
L164 [RESULT] === bisect: master utils + ONLY the import (no redaction) === ⏎     ✕ sends a feedback request when changing an already selected source (1060 ms)
L177 [RESULT] === path: DataSourcePills spec -> chain-of-thought utils === ⏎ no path
L188 [RESULT] === my utils.tsx x3 === ⏎ Tests:       1 failed, 11 passed, 12 total ⏎ Tests:       12 passed, 12 total ⏎ Tests:       1 failed, 11 passed, 12 total ⏎ === master utils.tsx x3 === ⏎ Tests:       12 passed, 12 total ⏎ Tests:       1 failed, 11 passed, 12 total ⏎ Tests:       12 passed, 12 total ⏎ === module-load probe: throw at top of utils.tsx === ⏎ Tests:       1 failed, 11 passed, 12 total
```
