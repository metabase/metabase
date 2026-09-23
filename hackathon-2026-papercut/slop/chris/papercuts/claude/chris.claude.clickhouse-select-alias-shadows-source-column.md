---
title: ClickHouse resolves a same-SELECT alias before the source column, so `sum(cost_usd) AS cost_usd` followed by `countIf(cost_usd IS NULL)` becomes a nested aggregate (ILLEGAL_AGGREGATION) -- agent-written DDL shipped with it three times
slug: clickhouse-select-alias-shadows-source-column
kind: tool-quirk
impact: introduced-bug
severity: medium
status: fixed
area: ClickHouse SQL authoring (evals data stack schema design, ~/planning/evals/clickhouse-schema.md)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/55e589b9-fa19-477f-abc9-90a776975bfc.jsonl
    lines: 394-454
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.91, misleading_signal: 0.35, user_correction: 0.82, codebase_trap: 0.81, flailing: 0.28, env_friction: 0.63}
---
## Summary
Designing a ClickHouse schema for the evals data app, the agent wrote a `run_rollup` view with
`countIf(gate_passed) AS gate_passed` and then `countIf(gate_passed) / count()` for a rate, and
`sum(cost_usd) AS cost_usd` followed by `countIf(cost_usd IS NOT NULL)`, `IS NULL`, `= 0`. In standard SQL
(Postgres) the later references mean the source column. ClickHouse prefers the in-SELECT alias (both analyzers), so
each later reference is `sum(cost_usd)` / `countIf(gate_passed)` -- a nested aggregate. The view fails to create
or every read errors. It was not caught by the first (Codex) review; a second review agent caught it as HIGH.

## Symptom
Review finding (L394): "HIGH -- `run_rollup` as written fails with ILLEGAL_AGGREGATION: two aliases shadow the
columns they aggregate."

## Timeline
- L149-183 doc + artifact published with the DDL.
- L329 Codex review: seven findings, not this one.
- L394 Fable review: HIGH alias-shadowing.
- L415-424 fix applied (rename aliases `gate_passed_cases`, `total_cost_usd`), first Python patch script failed an assertion (L424) and was redone.

## Root cause
ClickHouse alias scoping differs from Postgres/ANSI: aliases are visible (and preferred) anywhere in the same SELECT.
Naming an aggregate after its input column is idiomatic elsewhere.

## Why agents fall for it
Agents default to Postgres semantics; `sum(x) AS x` is a common rollup idiom; nothing executes the DDL in a design doc.

## Current state
Fixed in the doc. No ClickHouse guidance in the evals repo CLAUDE.md or memory (memory has
`project_bot2089_evals_clickhouse_ingest.md`, which is about buckets, not SQL).

## Suggested fix
Rule for ClickHouse DDL/queries: never alias an aggregate with the name of a column referenced elsewhere in the same
SELECT; run DDL against `clickhouse-local` before publishing a design.

## Detection signal
Regex over SQL: `AS (\w+)` where the same identifier appears inside another aggregate in the same SELECT, in a
ClickHouse context.

## Raw excerpts
```
L394 **HIGH -- `run_rollup` as written fails with ILLEGAL_AGGREGATION: two aliases shadow the columns they aggregate.**
`countIf(gate_passed) AS gate_passed` makes `gate_passed` an in-select alias; the next line's `countIf(gate_passed)`
(inside `gate_pass_rate`) resolves to that alias, producing a nested aggregate. Same bug twice more: `sum(cost_usd) AS
cost_usd` followed by `countIf(cost_usd IS NOT NULL)` / `IS NULL` / `= 0` ... ClickHouse prefers same-select aliases
over source columns (both analyzers), so the view either fails to create or every read errors.
```
