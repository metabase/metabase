---
title: `python-transform-logging-test` asserts that a deliberately slow Python transform produced more than one partial log message before finishing, a timing-dependent check that failed a CI job on an unrelated backend PR (`expected (< 1 (count observed-messages))`, got 1).
slug: python-transform-logging-test-timing-flake
kind: test-harness
impact: wasted-time
severity: low
status: open
area: enterprise/backend/test/metabase_enterprise/transforms_python/transforms_api_test.clj
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/79096893-1a0d-4e0e-abc8-cb0026bb1248.jsonl
    lines: 149-324
    date: 2026-09-07
    jev: {any_papercut: 0.70, env_toolchain: 0.88, stale_state: 0.19, verify_mismatch: 0.47, misleading_code: 0.16, hidden_coupling: 0.41, stale_docs: 0.26, tool_footgun: 0.78, flaky: 0.84, agent_bug: 0.24, wasted_effort: 0.60, user_correction: 0.20}
---
## Summary
One red job on the PR was `Postgres 14.x Transforms Python Tests`, with one failing assertion: the test expects to observe several partial log messages while a slow transform runs and saw only one. The agent checked the quarantine list and master's history, classed it as a timing flake unrelated to the PR, and suggested a rerun.

## Symptom
- L160: `FAIL in metabase-enterprise.transforms-python.transforms-api-test/python-transform-logging-test (transforms_api_test.clj:316)`, testing "scenario takes time, we should see partial messages for immediate feedback".
- `expected: (< 1 (count observed-messages))`, `actual: (not (< 1 1))`.

## Timeline
- L149-160: extracts the failing assertion from the job log.
- L205-206: checks the test against the quarantine list and recent issues.
- L324: classed as a timing flake unrelated to the PR's change (`copy.clj`); rerun command.
- Cost: 3 to 4 calls to rule it out.

## Root cause
Whether the test sees more than one partial message depends on how fast the runner executes the transform relative to the polling that collects messages; on a fast or loaded runner only one poll may land.

## Why agents fall for it
A backend test failure on a backend PR looks attributable until the agent reads the assertion.

## Current state
Checked origin/master: the assertion `(is (< 1 (count observed-messages)))` under "scenario takes time, we should see partial messages for immediate feedback" is unchanged; the file was last touched 2026-08-12.

## Suggested fix
- Make the scenario deterministic (a transform that blocks on a latch the test releases after the first poll), or assert on the final log content only.

## Detection signal
`FAIL in ...python-transform-logging-test` with `(not (< 1 1))`.

## Raw excerpts
```
L160 [RESULT] [...] FAIL in metabase-enterprise.transforms-python.transforms-api-test/python-transform-logging-test (transforms_api_test.clj:316)
[...] takes time, early feedback possible scenario takes time, we should see partial messages for immediate feedback
expected: (< 1 (count observed-messages))
  actual: (not (< 1 1))
```
