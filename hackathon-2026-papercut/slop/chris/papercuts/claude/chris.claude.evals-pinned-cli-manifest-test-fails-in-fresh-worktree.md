---
title: evals `test_cli_cases_cover_every_command_in_the_pinned_manifest` fails in any fresh worktree (it needs the installed pinned `mb` CLI) with no skip guard, so every full local run has one "known" red test
slug: evals-pinned-cli-manifest-test-fails-in-fresh-worktree
kind: test-harness
impact: wasted-time
severity: low
status: open
area: metabase/evals tests/test_surface_scenarios.py:71; CliSurface().command_names()
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-andreis-fix-result-metadata-contracts/ac10dbfc-43e6-404f-9d15-bc71dbd4bc09.jsonl
    lines: 819-829
    date: 2026-09-07 (approx)
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.50, misleading_signal: 0.49, user_correction: 0.89, codebase_trap: 0.83, flailing: 0.40, env_friction: 0.50}
---
## Summary
To check that #125 and #126 merge cleanly, the agent built the merge in a scratch worktree, symlinked `.venv`, and
ran the suite: `1 failed, 1580 passed` (L823). The failure was
`test_surface_scenarios.py::test_cli_cases_cover_every_command_in_the_pinned_manifest`, which the agent recognised
as "the known fixture test that needs the installed pinned CLI and fails in any fresh worktree. Same one #121's
description called out." Here it was dismissed correctly. But a red test that everyone learns to ignore will
eventually hide a real failure with the same name.

## Current state
`/Users/christruter/workspace/metabase/evals/tests/test_surface_scenarios.py:71-72`:
`assert _declared_capabilities("cli") == set(CliSurface().command_names())`, with no `skipif` for a missing CLI.

## Suggested fix
`pytest.mark.skipif(not CliSurface.available(), reason="pinned mb CLI not installed")`, or have
`CliSurface().command_names()` read a committed manifest fixture instead of the installed binary.

## Detection signal
The same single test name failing in scratch/merge-check worktrees; "known failure" wording in PR descriptions.
