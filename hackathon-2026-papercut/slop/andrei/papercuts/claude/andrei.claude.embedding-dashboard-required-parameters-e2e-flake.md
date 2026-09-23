---
title: The e2e test 'should handle required parameters' in `embedding/embedding-dashboard.cy.spec.js` intermittently times out finding the 'Update filter' button, turning e2e-group-43-ee red on unrelated PRs
slug: embedding-dashboard-required-parameters-e2e-flake
kind: test-harness
impact: wasted-time
severity: low
status: open # test still present on master
area: e2e/test/scenarios/embedding/embedding-dashboard.cy.spec.js ('should handle required parameters'); e2e-group-43-ee
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-af57a8eefaff9d874.jsonl
    lines: 733-781
    date: 2026-09-17
    jev: {any_papercut: 0.74, env_toolchain: 0.57, stale_state: 0.34, verify_mismatch: 0.93, misleading_code: 0.20, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.45, flaky: 0.85, agent_bug: 0.20, wasted_effort: 0.71, user_correction: 0.15}
---
## Summary
The test edits a dashboard filter, marks it required and sets a default value. Twice in this session it failed with 'Timed out retrying after 4000ms: Unable to find an accessible element with the role "button" and name "Update filter"': on a backend Metabot PR's earlier run (the reason a subagent was asked to judge a flake, agent-a632 L324-L336) and on a copy-change PR (agent-af57). Each time the agent downloaded logs, compared with the previous head and reran.

## Symptom
agent-af57 L741-L742: the 'dashboard parameters' block ends with the 'Update filter' timeout; agent-a632 L327-L328 shows the same error from the 2026-09-14 run.

## Timeline
- agent-a632 L324-L336: previous run's e2e-group-43-ee failure investigated and judged unrelated.
- agent-af57 L733-L760: new failure on another PR; the previous head ran the same spec green (L759-L760).
- agent-af57 L763-L781: rerun refused until the run completed, then the rerun passed.
- Cost: roughly 10 minutes of investigation plus a full CI wait each time.

## Root cause
Unknown; the default 4 s Cypress timeout while the filter sidebar re-renders is a plausible cause, not verified.

## Why agents fall for it
Classifying an e2e failure on a backend-only PR takes log downloads and history checks, and ci-conductor reports it as 'NOT quarantined'.

## Current state
Checked origin/master: the test is still at line 229 of the spec; last change to the file 2026-09-15.

## Suggested fix
- Quarantine it in ci-conductor while it is investigated.
- Wait for the filter sidebar state before clicking, or give the button lookup a longer timeout.

## Detection signal
e2e log 'Unable to find an accessible element with the role "button" and name "Update filter"' from embedding-dashboard.cy.spec.

## Raw excerpts
```
L733 [RESULT] fail=1 pass=101 pending=49 skipping=42
    [exited with code 0]
    fail=1 pass=104 pending=46 skipping=42
L742 [RESULT] scenarios > embedding > static embedding dashboard
L760 [RESULT] 47
    105149185359 e2e-tests / e2e-group-43-ee / e2e-tests-e2e-group-43-ee success
L764 [RESULT] job 105292693534 cannot be rerun
-- subagent agent-a632b29c43867bb36 --
L328 [RESULT] 3765:2026-09-14T19:10:01.8441837Z   1 failing
      1 failing
             should handle required parameters:
         AssertionError: Timed out retrying after 4000ms: Unable to find an accessible element with the role "button" and name "Update filter"
```
