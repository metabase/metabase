---
title: Single-test / test-pair "branch vs master" controls give confident false verdicts -- fresh-JVM effects (never-logged-in users, FieldValues not synced) fail on both sides
slug: standalone-test-controls-mislead-about-branch-regressions
kind: misleading-signal
impact: wasted-time
severity: medium
status: documented-still-hit
area: backend test methodology -- ./bin/test-agent :only runs, CI order-dependent failures
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc.jsonl
    lines: 737-1057, 2410-2479
    date: 2026-08-21..24
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.55, misleading_signal: 0.80, user_correction: 0.33, codebase_trap: 0.89, flailing: 0.76, env_friction: 0.57}
---
## Summary
To decide "did my branch break this CI failure?" the agent ran the failing test(s) standalone on the branch and on a
master worktree. When both failed identically it declared the failure pre-existing. Three such verdicts were wrong
or unsupported: the standalone runs failed for fresh-JVM reasons unrelated to CI. The namespace-level control
reversed the verdict for the pulse cluster ("it reverses what I told you an hour ago").

## Symptom
- `persist-refresh-test/publish-refresh-error-event-sends-admin-email-test`: 4/4 fail on branch and master standalone (L851) -> "not ours" (L881). Later shown to share the session-token mechanism.
- `chain-filter-should-use-cached-field-values-test` + `pulse-test/create-csv-xls-test` pair: identical failures on both (L969) -> "both fail identically on master" (L1008).
- Full `pulse.api.pulse-test` namespace: master 210/0, branch 210/1 (L1034).

## Timeline
- L1008 agent already hedges: "Running two tests in isolation isn't CI's context".
- L1057 "The full-namespace control landed and it reverses what I told you an hour ago ... the isolated-pair control that produced it was worthless".
- L1109 subagent explains: `create-csv-xls-test` builds expected `last_login` before the first request; in a fresh JVM rasta has never logged in, so it fails on any branch when run early. chain-filter fails standalone because initial test-data sync has not created FieldValues since commit `78077ba2e06` (Feb 2025).
- L2410-2479 same pattern again for `related-test`: partial-log read, then "pre-existing", then master control shows branch-caused.

## Root cause
Many tests depend on state established by earlier tests in the same JVM (a logged-in user, synced FieldValues).
A cold single-test run exercises a different failure than CI. Both sides failing tells you nothing about the branch.

## Why agents fall for it
"Same command, same H2, same failure on master" feels like a clean control, and `test-agent :only` makes single-test
runs the path of least resistance.

## Current state
Documented after this session in memory `reference_rollback_only_cache_pattern.md` (description: "isolated runs
prove nothing; control against master") and `reference_granular_rerun_cold_isolation.md` ("Dispatching the job with
only the suspect test on master is NOT a valid 'is master broken?' oracle"). No CLAUDE.md guidance on control design.

## Suggested fix
Add to CLAUDE.md "Running Backend Tests": a master control is only valid at namespace (or CI-partition) scope; a
standalone failure on both sides means "pre-existing dependence on suite state", not "pre-existing failure".
Longer term: make the order-dependent tests self-sufficient (log the user in during setup; create FieldValues
explicitly).

## Detection signal
Transcript: `test-agent :only '[ns/single-test]'` run in two worktrees followed by a "not caused by this branch"
claim; later a namespace-level run contradicting it.

## Raw excerpts
```
L1057 **`metabase.pulse.api.pulse-test`, whole namespace:** master 210 assertions / 0 failures; branch 210 assertions / **1 failure**.
So the branch does break something here. My "not caused by this branch" call on the pulse cluster was wrong, and the
isolated-pair control that produced it was worthless -- `create-csv-xls-test` actually *passes* at namespace scope on
the branch, and the failure is in a different test entirely, `list-test`.
```
