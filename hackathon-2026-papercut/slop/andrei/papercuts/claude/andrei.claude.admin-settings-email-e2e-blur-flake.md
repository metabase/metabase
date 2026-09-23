---
title: The e2e test 'Pro-cloud instance should be able to save and clear email settings' in `admin-2/settings.cy.spec.js` still flakes with '`cy.blur()` can only be called when there is a currently focused element' despite an earlier flake fix
slug: admin-settings-email-e2e-blur-flake
kind: test-harness
impact: wasted-time
severity: low
status: open # the spec still chains .blur() after type in both email-settings tests on master
area: e2e/test/scenarios/admin-2/settings.cy.spec.js (email settings, Pro-cloud instance); e2e-group-16-ee
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/43c18504-de2f-4b9e-999c-99fbc7a01bbc.jsonl
    lines: 233-336
    date: 2026-09-04
    jev: {any_papercut: 0.78, env_toolchain: 0.86, stale_state: 0.29, verify_mismatch: 0.62, misleading_code: 0.20, hidden_coupling: 0.39, stale_docs: 0.38, tool_footgun: 0.66, flaky: 0.90, agent_bug: 0.70, wasted_effort: 0.33, user_correction: 0.08}
---
## Summary
A backend search PR's CI had one red job, e2e-group-16-ee, on the Pro-cloud email settings test failing with 'CypressError: `cy.blur()` can only be called when there is a currently focused element.' The agent found an earlier PR titled 'Fix flaky Pro-cloud email settings e2e test' for the same test, confirmed master's recent runs of the group were green, waited for the run to finish and reran; the rerun passed.

## Symptom
L241: `1 failing` / `CypressError: \`cy.blur()\` can only be called when there is a currently focused element.`; L246: `1) scenarios > admin > settings > email settings / Pro-cloud instance / should be able to save and clear email ...`.

## Timeline
- L233-L246: failing job and test found.
- L256-L270: issue search, master history, spec git log showing a prior flake fix.
- L286-L317: waits for the run, reruns failed jobs.
- L331-L336: rerun green.
- Cost: about 23 minutes (21:29 to 21:52), mostly CI waiting.

## Root cause
Unknown; `.type(...).blur()` depends on focus staying on the input, which a re-render or toast can steal.

## Why agents fall for it
A test already 'fixed for flakiness' looks settled, and e2e failures on backend PRs need manual triage.

## Current state
Checked origin/master: two tests named 'should be able to save and clear email settings' remain (lines 338 and 518 of the spec).

## Suggested fix
- Replace `.blur()` chains with an explicit focus change (click the next field) or assert on saved state instead of blur side effects.
- Quarantine until stable.

## Detection signal
Cypress error '`cy.blur()` can only be called when there is a currently focused element' in admin-2/settings.cy.spec.js.

## Raw excerpts
```
L241 [RESULT] 50
    ---FAILS---
    e2e-tests / e2e-group-16-ee / e2e-tests-e2e-group-16-ee	fail	10m0s	https://github.com/metabase/metabase/actions/runs/33919750259/job/101177566174	
    ---LOG16---
L246 [RESULT] 2026-09-04T21:26:25.0850460Z 
    2026-09-04T21:26:25.0852136Z   1 failing
    2026-09-04T21:26:25.0855925Z   1) scenarios > admin > settings > email settings
    2026-09-04T21:26:25.0857383Z          should be able to save and clear email  [...1331 chars...] 97Z   │ ✖  admin-2/settings.cy.spec.js              01:05       30       29        1        -        - │
L317 [CALL] Bash: gh run rerun 33919750259 --failed 2>&1 && sleep 5 && gh run view 33919750259 --json status --jq .status
L336 [RESULT] 0
    UNKNOWN APPROVED
```
