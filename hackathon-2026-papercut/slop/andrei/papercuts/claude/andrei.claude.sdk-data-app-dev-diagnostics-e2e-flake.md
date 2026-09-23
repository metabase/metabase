---
title: The SDK host-app e2e 'serves the report to shell agents, with cursor filtering' in `data-app-dev-diagnostics.cy.spec.ts` intermittently fails with 'expected [ Array(3) ] to be empty' on the production-bundle job
slug: sdk-data-app-dev-diagnostics-e2e-flake
kind: test-harness
impact: wasted-time
severity: low
status: open # test still present on master
area: e2e/test-host-app/data-apps/data-app-dev-diagnostics.cy.spec.ts; sdk-tests e2e-host-app-vite-6-data-app-host-app-e2e-tests-production-bundle
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a6fd99bcc709d6e88.jsonl
    lines: 578-630
    date: 2026-09-17
    jev: {any_papercut: 0.71, env_toolchain: 0.20, stale_state: 0.23, verify_mismatch: 0.82, misleading_code: 0.28, hidden_coupling: 0.59, stale_docs: 0.30, tool_footgun: 0.36, flaky: 0.92, agent_bug: 0.34, wasted_effort: 0.58, user_correction: 0.23}
---
## Summary
A backend Metabot PR's SDK e2e production-bundle job failed one test with 'Timed out retrying after 4000ms: expected [ Array(3) ] to be empty' at spec line 127, while the development-bundle job passed. The agent checked the same job on several other PRs' runs (all green), read the spec and reran; the rerun passed.

## Symptom
L579-L582: '10 passing, 1 failing ... serves the report to shell agents, with cursor filtering: AssertionError: Timed out retrying after 4000ms: expected [ Array(3) ] to be empty'.

## Timeline
- L578-L582: job log downloaded and the failing test found.
- L585-L586: the same job passed on other runs.
- L613-L614: spec read.
- L621-L630: rerun passes.
- Cost: several calls of investigation plus a CI rerun.

## Root cause
Unknown; the assertion waits for the diagnostics report to empty after cursor filtering and timed out with three entries left.

## Why agents fall for it
SDK host-app jobs run on backend PRs, so any red there needs manual triage.

## Current state
Checked origin/master: the test exists at line 113 of the spec; the file last changed 2026-08-07.

## Suggested fix
- Quarantine or stabilise it (wait on the report's cursor rather than a fixed 4 s retry).

## Detection signal
Cypress failure 'expected [ Array(3) ] to be empty' in data-app-dev-diagnostics.cy.spec.ts.

## Raw excerpts
```
L579 [RESULT] 3599 sdk-job.log
    2669:2026-09-17T09:44:06.0028508Z   1 passing (13s)
    2700:2026-09-17T09:44:24.5358355Z   1 passing (12s)
    2876:2026-09-17T09:45:33.7786517Z   10 passing (39s)
L582 [RESULT] ... 1) Embedding SDK: data-app dev diagnostics > dev diagnostics > serves the report to shell agents, with cursor filtering: AssertionError: Timed out retrying after 4000ms: expected [ Array(3) ] to be empty (data-app-dev-diagnostics.cy.spec.ts:127:11)
L586 [RESULT] 35202258417 105152675101 success e2e-host-app-vite-6-data-app-host-app-e2e-tests-production-bundle
```
