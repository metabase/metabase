---
title: Bun's SQL client JSON-encodes a string bound to a jsonb parameter, so the node-postgres habit `${JSON.stringify(obj)}::jsonb` silently stores a JSON string instead of an object
slug: bun-sql-jsonb-param-double-encodes-strings
kind: tool-quirk
impact: introduced-bug
severity: low
status: open # Bun behaviour, not Metabase code
area: Bun 1.3.14 `SQL` tagged template against Postgres jsonb columns; agent-written Bun scripts
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7ee5589e-88e5-463a-a3d6-e429eb321d74/subagents/agent-a16477f6b264e54dd.jsonl
    lines: 43-73
    date: 2026-09-23
    jev: {any_papercut: 0.90, env_toolchain: 0.89, stale_state: 0.40, verify_mismatch: 0.24, misleading_code: 0.42, hidden_coupling: 0.67, stale_docs: 0.33, tool_footgun: 0.80, flaky: 0.56, agent_bug: 0.95, wasted_effort: 0.58, user_correction: 0.06}
---
## Summary
Two agents in one session independently wrote `${JSON.stringify(x)}::jsonb` with Bun's SQL in scripts writing to a local Postgres. Bun serializes a JS string sent to a json/jsonb parameter as a JSON string literal, so every row had `jsonb_typeof = string` and every `->>` lookup returned null. The first agent noticed after 16 rows, fixed the insert and repaired the rows with `(col #>> '{}')::jsonb`; the second hit it about 20 minutes later when its end-to-end check found nothing, and confirmed the cause with a temp-table repro.

## Symptom
- First subagent L59-L60: `jsonb_typeof` is `string` for both JSON columns in all 16 rows.
- Second subagent L239-L248: its synthetic end-to-end check produced nothing; the JSON values it had stored were jsonb strings.
- Second subagent L252-L253: repro shows an object parameter stores an object while `JSON.stringify(v)` stores a string.

## Timeline
- L43: the first script inserts `${JSON.stringify(data)}::jsonb, ${text}::jsonb`.
- L55-L60: row inspection shows every JSON column is a string.
- L62-L65: pass the objects instead; a synthetic row is stored as an object.
- L68-L73: repair of the 16 existing rows (after one zsh word-splitting retry).
- Second subagent L155: its script is written with the same `${JSON.stringify(v)}::jsonb` pattern.
- Second subagent L239-L262: failed synthetic check, diagnosis, temp-table repro, fix of both writes (after one `sed -i ''` retry).
- Cost: about 12 tool calls across two agents; wrong-typed rows in a shared table for about a minute and wrong-typed values in a second table until reset.

## Root cause
Bun's SQL, like postgres.js, serializes parameters whose server-side type is json/jsonb with JSON.stringify, so a JS string becomes a JSON string literal rather than being parsed by the `::jsonb` cast. Whether Bun documents this was not checked.

## Why agents fall for it
`JSON.stringify(x)::jsonb` is the idiomatic node-postgres pattern; the insert succeeds; `select col` prints something that looks like JSON either way; only `jsonb_typeof` or a null `->>` reveals it.

## Current state
Not Metabase code; Bun docs not checked. Reproduced in the session with Bun 1.3.14 (second subagent L252-L253).

## Suggested fix
- In agent-written Bun + Postgres scripts, pass objects directly (`${obj}`) for json/jsonb parameters and never pre-stringified JSON.
- Any smoke test that writes JSON asserts `jsonb_typeof(col) = 'object'`.

## Detection signal
`JSON.stringify(` followed by `::jsonb` inside a Bun `sql` template; queries checking `jsonb_typeof(...) = 'string'`; repairs using `#>> '{}'`.

## Raw excerpts
```
L43 [CALL] Write <script>.ts: 'import { SQL } from "bun"; ... values (..., ${JSON.stringify(data)}::jsonb, ${text}::jsonb) ...'
L59 [CALL] Bash: psql -c "select jsonb_typeof(event_data) ed, jsonb_typeof(raw) r, count(*) from <table> group by 1,2"
L60 [RESULT] ed | r | count | --------+--------+------- | string | string | 16 | (1 row)
L62 [CALL] Edit <script>.ts: old='${JSON.stringify(data)}::jsonb, ${text}::jsonb)' new='${data}, ${body})'
L72 [CALL] Bash: psql -c "update <table> set event_data = (event_data #>> '{}')::jsonb, raw = (raw #>> '{}')::jsonb where jsonb_typeof(event_data) = 'string'" ...
L73 [RESULT] UPDATE 16 | ... | jsonb_typeof | jsonb_typeof | count | object | object | 16
L253 [RESULT] (second subagent) [ { type: "object", ... }, { type: "object", ... }, { type: "string", j: "\"{\\\"a\\\":1,\\\"b\\\":[\\\"x\\\"]}\"", } ]
```
