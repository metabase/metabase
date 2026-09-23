---
title: In the evals repo, `uv run pyright scripts/configure-local-metabase` reports type errors that the project-wide `uv run pyright` (what CI runs) does not
slug: pyright-single-file-run-reports-false-errors
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: metabase/evals -- pyright (mise.toml ci task), extension-less scripts under scripts/
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2001-audit-appdb-and-dwh-dumps-for-stats-lane-evals/7ad9c402-a811-43c6-b9fe-5e4803b3d6a2.jsonl
    lines: 1600-1727
    date: 2026-08-26
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.84, misleading_signal: 0.61, user_correction: 0.76, codebase_trap: 0.78, flailing: 0.34, env_friction: 0.82}
---
## Summary
After editing `scripts/configure-local-metabase` (a Python script with no `.py` extension), the agent type-checked
just that file: `uv run pyright scripts/configure-local-metabase` -> `3 errors`, e.g. `Argument of type "str" cannot
be assigned to parameter "query" of type "Template" in function "execute"`. It then ran `uv run pyright` with no
arguments, as CI does (`mise.toml:118`), and got `0 errors`. L1727: "Project-wide pyright is clean -- the
single-file run just missed the config." Cheap to resolve here, but an agent that trusts the single-file run would
"fix" non-errors (e.g. wrapping SQL strings to satisfy a `Template` overload).

## Symptom
```
L1710 .../scripts/configure-local-metabase:1991:17 - error: Argument of type "str" cannot be assigned to parameter "query" of type "Template" in function "execute"
3 errors, 0 warnings, 0 informations
L1724 (uv run pyright) 0 errors, 0 warnings, 0 informations
```

## Root cause
Not established. No `[tool.pyright]` section or pyrightconfig.json exists in the evals repo, so the difference is in
how pyright treats an explicitly named, extension-less file versus project discovery (inferred settings / which
overload of psycopg's `execute` resolves).

## Why agents fall for it
Checking only the changed file is the fast, natural verification step.

## Current state
`/Users/christruter/workspace/metabase/evals/mise.toml:118` runs `uv run pyright` project-wide; no doc says to avoid
single-file runs.

## Suggested fix
Note in evals CLAUDE.md: "type-check with `uv run pyright` (no args) or `mise run ci`; single-file runs of the
extension-less scripts report spurious errors." Optionally add an explicit pyright config.

## Detection signal
`pyright <file>` with errors followed by project-wide `pyright` with none.

## Raw excerpts
See Symptom.
