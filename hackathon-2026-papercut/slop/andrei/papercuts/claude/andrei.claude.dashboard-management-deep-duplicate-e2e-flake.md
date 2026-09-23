---
title: The e2e test 'should deep duplicate a dashboard and its cards to a collection created on the go' in `dashboard/dashboard-management.cy.spec.js` intermittently times out waiting for `[data-testid="create-collection-on-the-go"]`
slug: dashboard-management-deep-duplicate-e2e-flake
kind: test-harness
impact: wasted-time
severity: low
status: open # test still present on master
area: e2e/test/scenarios/dashboard/dashboard-management.cy.spec.js; e2e-group-27-ee
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a632b29c43867bb36.jsonl
    lines: 419-458
    date: 2026-09-17
    jev: {any_papercut: 0.76, env_toolchain: 0.36, stale_state: 0.33, verify_mismatch: 0.89, misleading_code: 0.27, hidden_coupling: 0.68, stale_docs: 0.27, tool_footgun: 0.64, flaky: 0.94, agent_bug: 0.48, wasted_effort: 0.51, user_correction: 0.54}
---
## Summary
On a backend Metabot PR, e2e-group-27-ee failed on the deep-duplicate test with 'Timed out retrying after 4000ms: Unable to find an element by: [data-testid="create-collection-on-the-go"]'. The agent searched the frontend for the test id, checked a same-day frontend merge that had passed the group, waited for the run and reran. The same test failed on another backend PR three days earlier (session 6bc1800e L726-L734).

## Symptom
L421-L422: e2e-group-27-ee log with one failing test, 'should deep duplicate a dashboard and its cards to a collection created on the go', timing out on `create-collection-on-the-go`.

## Timeline
- L421-L422: group-27 log downloaded, failure found.
- L425-L438: agent greps the frontend and the spec for the test id and recent changes.
- L441-L445: checks a same-day frontend PR that passed the group.
- L448-L458: waits for the run to finish and reruns failed jobs; green.
- Cost: about 15 minutes of investigation and CI waiting.

## Root cause
Unknown; the element appears after a dialog transition and the default 4 s timeout is a plausible cause, not verified.

## Why agents fall for it
The failure is in UI code the backend PR cannot reach, but proving that takes log and history digging each time.

## Current state
Checked origin/master: the test is at line 180 of the spec.

## Suggested fix
- Quarantine or stabilise it (wait for the new-collection dialog before querying the test id).

## Detection signal
e2e log 'Unable to find an element by: [data-testid="create-collection-on-the-go"]' in dashboard-management.cy.spec.

## Raw excerpts
```
L421 [CALL] Bash: SP=<scratchpad> && curl -sL -H "Authorization: token $(gh auth token)" https://api.github.com/repos/metabase/metabase/actions/jobs/10515235567
L422 [RESULT] ... 1) should deep duplicate a dashboard and its cards to a collection created on the go ... AssertionError: Timed out retrying after 4000ms: Unable to find an element by: [data-testid="create-collection-on-the-go"]
L433 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git grep -ln 'create-collection-on-the-go' -- frontend enterprise/frontend e2e | head; echo ---; git log --since=
L453 [CALL] Bash: cd ~/src/mb/wt/<worktree> && gh run rerun 35204819378 --failed 2>&1 | tail -3; sleep 20; gh run view 35204819378 --json status,attempt --jq .
L454 [RESULT] {"attempt":2,"status":"in_progress"}
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/6bc1800e-c3b5-4388-9868-f321f7266cce.jsonl
  lines: 719-734
  date: 2026-09-14
  jev: {any_papercut: 0.79, env_toolchain: 0.25, stale_state: 0.40, verify_mismatch: 0.77, misleading_code: 0.17, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.77, flaky: 0.95, agent_bug: 0.26, wasted_effort: 0.32, user_correction: 0.08}

L731: `1) should deep duplicate a dashboard and its cards to a collection created on the go`, `AssertionError: Timed out retrying after 4000ms: Unable to find an element by: [data-testid="create-collection-on-the-go"]`.

- L719-L722: background watcher reports the run failed with group-27 and H2 (OSS) red.
- L726-L731: group-27 log pulled; failing test identified.
- L734: rerun of failed jobs started; auto-merge waits.
- Cost: a CI rerun and about 5 minutes of triage.

```
L722 [RESULT] 1	conclusion=failure failed=driver-tests / H2 (OSS), e2e-tests / e2e-group-27-ee / e2e-tests-e2e-group-27-ee, e2e-tests / e2e-tests-result, driver-tests / drivers-tests-result
    2	
L731 [RESULT] 1) should deep duplicate a dashboard and its cards to a collection created on the go
      1) managing dashboard from the dashboard's edit menu
         AssertionError: Timed out retrying after 4000ms: Unable to find an element by: [data-testid="create-collection-on-the-go"]
      │ ✖  dashboard/dashboard-management.cy.s      01:07       21       20        1        -        - │
        ✖  1 of 10 failed (10%)                     06:38       87       86        1        -        -
```
