---
title: dlt mutates column-hint dicts in place, so a hint dict shared between resources leaks one table's columns (and NOT NULL flags) into another
slug: dlt-mutates-shared-column-hints
kind: codebase-trap
impact: introduced-bug
severity: medium
status: fixed
area: metabase/data-stack — pipeline/src/ingest_runtime/runtime.py (column_hints), sources/*/extension.py, dlt resource `columns=`
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-data-stack/80fed4ae-938d-467a-bdb8-9082728a54de.jsonl
    lines: 1015-1068
    date: 2026-08-29
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.95, misleading_signal: 0.65, user_correction: 0.09, codebase_trap: 0.87, flailing: 0.44, env_friction: 0.89}
---
## Summary
While writing the evals connector (six tables from one shared batch), the agent built each resource's
`columns=` as `{**column_hints(resource), **HINTS[table]}`. That copies the outer map, but the per-column
hint dicts inside `HINTS` are shared. dlt writes the column name and key flags (`nullable: False`,
`primary_key`) *into* the hint dict it is given. A `version` column, meant only for `archive_load` (primary key
`source_archive, version`), leaked into `case_result`'s schema as a non-null column. The contract
suite then failed at load time.

## Symptom
```
L1019 [RESULT] E  <class 'dlt.load.exceptions.LoadClientJobFailed'>
E  Job with `job_id=case_result.4598be11d0.insert_values.gz` ... failed terminally with message: Constraint Error: NOT NULL constraint failed: case_result.version. The package is aborted and cannot be retried.
2 passed, 50 deselected, 6 warnings, 8 errors
```
The resource hints printed *before* the load looked right (`case_result ... version in cols: False`, L1047).
The leak shows up only after dlt has processed a resource.

## Timeline
- L1015 `pytest pipeline/tests/test_connector_contract.py -k evals` → 8 errors (NOT NULL on `case_result.version`).
- L1045 THINKING: "a `version` column meant only for `archive_load` is leaking into `case_result`'s schema".
- L1046-1047 hints before the load are clean, which rules out a static config error.
- L1052-1053 debug run into a scratch duckdb shows the stored schema carrying the flag.
- L1065 THINKING: "the shared column-hint dicts get mutated in place by dlt, so a rename in one resource leaks into another that reuses the same dict. Fixing this by copying hints per resource."
- L1066-1068 patch copies each hint dict; the contract suite passes (7 passed, 3 skipped).

## Root cause
dlt's `columns=` argument is treated as owned and mutable (dlt fills in `name` and key/nullability
flags). A module-level hint table shared between resources, or between columns (`dict(_TIMESTAMP)` vs
`_TIMESTAMP`), aliases that state.

## Why agents fall for it
Hint maps look like constant configuration, and `{**a, **b}` looks like a copy. The failure is far from
the cause: a NOT NULL error on another table, at load time.

## Current state
Fixed and documented in code:
- `pipeline/src/ingest_runtime/runtime.py:222-232` `column_hints` builds fresh dicts, with the comment "Fresh dicts: dlt mutates each with the column's name and key flags, so sharing one would leak metadata across columns."
- `sources/evals/extension.py:109-111` "column_hints emits them, each a fresh dict dlt may mutate."
Other sources (`inkeep`, `unify`, `luma`, `pylon`, `genai_prices`) call `column_hints(resource)` directly, so they are safe. The trap comes back for any extension that keeps its own module-level hint dicts.

## Suggested fix
Done. Possible hardening: have `column_hints` return a deep copy, and add a contract-suite assertion that no two resources' `columns=` share dict identity.

## Detection signal
A NOT NULL / unknown-column error on table A naming a column that only table B declares; a module-level
`HINTS = {...}` dict passed into multiple `@dlt.resource(columns=...)`.

## Raw excerpts
```
L1047 [RESULT] run | pk: run_session_id | merge: source_archive | wd: merge | version in cols: False | ncols 25
case_result | pk: ['run_session_id', 'golden', 'attempt'] | merge: source_archive | wd: merge | version in cols: False | ncols 37
archive_load | pk: ['source_archive', 'version'] | merge: None | wd: append | version in cols: True | ncols 7
L1066 old = '''    hints = {**column_hints(resource), **HINTS[table]}
'''
new = '''    # Copied per column: dlt mutates a column hint in place (it writes the column's name and
    # key flags into it), ...
L1068 [RESULT] patched ... 7 passed, 3 skipped, 50 deselected, 14 warnings in 5.35s
```
