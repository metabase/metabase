---
title: The MetabotSettingsPanel "should toggle embedded metabot enabled state" spec clicks a switch that is disabled while settings load, so it fails locally about 3 runs in 5 on clean master while CI stays green
slug: metabot-settings-panel-toggle-spec-flaky
kind: test-harness
impact: wasted-time
severity: low
status: open # on master the Switch still has `disabled={isLoading}` and the spec still clicks right after `findByTestId`
area: frontend/src/metabase/admin/ai/MetabotSettingsPanel.unit.spec.tsx (enabledToggle, waitForRequest); frontend/src/metabase/admin/ai/MetabotSettingsPanel.tsx
merged_from: metabot-settings-panel-toggle-test-flaky
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501.jsonl
    lines: 270-668
    date: 2026-08-27
    jev: {any_papercut: 0.81, env_toolchain: 0.16, stale_state: 0.30, verify_mismatch: 0.40, misleading_code: 0.48, hidden_coupling: 0.84, stale_docs: 0.53, tool_footgun: 0.29, flaky: 0.83, agent_bug: 0.94, wasted_effort: 0.39, user_correction: 0.41}
---
## Summary
An agent running the admin/ai specs for an unrelated change saw `MetabotSettingsPanel › should toggle embedded metabot enabled state` fail and had to stash its change and re-run on clean master to prove the failure pre-existing. A later verification agent measured it: 3 of 5 local runs fail with "Request not found" after about a second. The toggle is `disabled={isLoading}` while `useAdminSetting` loads, and the test only waits for the switch to exist before clicking, so an early click is a no-op and `waitForRequest` times out. CI happens to be green, so the flake lands on whoever runs the directory locally.

## Symptom
L270: the implementing subagent reports `MetabotSettingsPanel › should toggle embedded metabot enabled state` as the one failure in the wider directory, pre-existing on clean master with its change stashed. Verification report (L623): fails intermittently on clean master, 3 of 5 runs, "Request not found" after about 1s; CI green.

## Timeline
- Earlier subagent run (reported at L253-L270): failure seen, change stashed, same failure on clean master.
- L565: coordinator lists it as a possible ticket.
- L578-L623: verification agent reproduces 3/5 locally, reads the component, finds the disabled-while-loading race and the same latent race in the sibling default-metabot toggle test.
- L650-L657: flaky-test ticket filed.
- Cost: a stash-and-rerun cycle in the implementing agent, part of a 14-minute verification run, and a ticket; any agent running this spec locally will hit it again.

## Root cause
`MetabotSettingsPanel.tsx` renders `<Switch data-testid="metabot-enabled-toggle" disabled={isLoading} ...>`; the spec's `enabledToggle` is `screen.findByTestId("metabot-enabled-toggle")` and the test clicks immediately, so whether the PUT fires depends on whether settings finished loading first.

## Why agents fall for it
A failure in a spec next to the files an agent touched looks like its own regression, and proving otherwise needs a clean-master run. Green CI suggests the test is stable.

## Current state
Checked origin/master: the Switch still has `disabled={isLoading}`; the spec still does `await userEvent.click(await enabledToggle())` followed by `waitForRequest`.

## Suggested fix
- In the spec, wait for the switch to be enabled before clicking (`await waitFor(() => expect(toggle).toBeEnabled())`), in both toggle tests.
- Consider rendering a skeleton instead of a disabled control during load, which also removes the race for real users.

## Detection signal
Local jest failure "Request not found" in MetabotSettingsPanel.unit.spec.tsx; agents stashing changes to re-run a spec on master; a test id found by `findByTestId` and clicked with no enabled check.

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/21ad940c-c551-4b95-84ed-c73a3ac86c8a.jsonl
  lines: 1348-1489
  date: 2026-08-24
  jev: {any_papercut: 0.85, env_toolchain: 0.38, stale_state: 0.24, verify_mismatch: 0.56, misleading_code: 0.27, hidden_coupling: 0.79, stale_docs: 0.31, tool_footgun: 0.53, flaky: 0.91, agent_bug: 0.67, wasted_effort: 0.35, user_correction: 0.06}

- L1414-1419: `Test Suites: 1 failed, 14 passed`, `Tests: 1 failed, 140 passed, 141 total`.
- L1434 and L1441: `admin/ai` alone 100/100, the provider form alone 41/41.
- L1463: `● MetabotSettingsPanel › should toggle embedded metabot enabled state  Request not found`.
- L1470 and L1477: two more combined runs and a stashed A/B run fail the same way.

- L1348 (13:54): combined backend, jest, typecheck and eslint verification.
- L1418-1446: pulls the failure out of the log; each directory passes alone.
- L1457-1463: identifies the failing spec and message.
- L1469-1477: two reruns and a `git stash` A/B; still failing.
- L1489 (13:57): the agent calls it a pre-existing batch-order flake; commits.
- Cost: 7 jest invocations and about 2.5 minutes.

```
L1419 [RESULT] === JEST === Test Suites: 1 failed, 14 passed, 15 total Tests:       1 failed, 140 passed, 141 total
L1434 [RESULT] ● Console [...] Tests:       100 passed, 100 total
L1441 [RESULT] Tests:       41 passed, 41 total
L1458 [RESULT] FAIL   core  frontend/src/metabase/admin/ai/MetabotSettingsPanel.unit.spec.tsx
L1463 [RESULT] ● MetabotSettingsPanel › should toggle embedded metabot enabled state    Request not found
L1477 [RESULT] FAIL   core  frontend/src/metabase/admin/ai/MetabotSettingsPanel.unit.spec.tsx Tests:       1 failed, 139 passed, 140 total
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/b9969651-5371-431a-b6c4-6d9916153234.jsonl
  lines: 2602-2632
  date: 2026-08-25
  jev: {any_papercut: 0.88, env_toolchain: 0.80, stale_state: 0.59, verify_mismatch: 0.63, misleading_code: 0.32, hidden_coupling: 0.77, stale_docs: 0.23, tool_footgun: 0.71, flaky: 0.94, agent_bug: 0.89, wasted_effort: 0.62, user_correction: 0.08}

- L2609: `● MetabotSettingsPanel › should toggle embedded metabot enabled state`.
- L2615: run alone: `Tests: 1 failed, 10 passed, 11 total`.
- L2620: identical with the changes stashed.

- L2598-2603 (01:05): combined run still 1 failed after the agent's own fixture fix.
- L2608-2615: isolates the failing spec; fails alone.
- L2619-2620: stash A/B, still fails.
- L2632: confirmed pre-existing; continues.
- Cost: 4 jest runs, about 1.5 minutes.

```
L2598 [RESULT] Test Suites: 1 failed, 14 passed, 15 total Tests:       1 failed, 141 passed, 142 total
L2609 [RESULT] ● MetabotSettingsPanel › should toggle embedded metabot enabled state
L2614 [CALL] Bash: timeout 600 mise exec -- bun run jest --silent frontend/src/metabase/admin/ai/MetabotSettingsPanel.unit.spec.tsx 2>&1 | tail -5
L2615 [RESULT] Test Suites: 1 failed, 1 total Tests:       1 failed, 10 passed, 11 total
L2619 [CALL] Bash: git stash -q && timeout 600 mise exec -- bun run jest --silent frontend/src/metabase/admin/ai/MetabotSettingsPanel.unit.spec.tsx 2>&1 | tail -4; git stash pop -q; git status --short | head -8
L2620 [RESULT] Tests:       1 failed, 10 passed, 11 total
```
