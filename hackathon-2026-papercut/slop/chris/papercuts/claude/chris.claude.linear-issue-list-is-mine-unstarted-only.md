---
title: `linear issue list` is an alias of `issue mine` filtered to state "unstarted", so "No issues found" hides open In Progress issues; there is no `issue search`
slug: linear-issue-list-is-mine-unstarted-only
kind: tool-quirk
impact: both
severity: medium
status: open
area: linear CLI 2.5.0 (~/.claude/skills/linear-cli)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-data-stack/71a7be8c-d0b2-498f-be23-d4ed3c031ddf.jsonl
    lines: 993-1044
    date: 2026-09-03
    jev: {self_inflicted_bug: 0.76, tool_misuse: 0.95, misleading_signal: 0.68, user_correction: 0.98, codebase_trap: 0.58, flailing: 0.69, env_friction: 0.88}
---
## Summary
Asked "are the relevant linear issues marked as done", the agent confirmed BOT-2096 and BOT-2089, then tried to find other open issues in the Evals project. `linear issue list --project "Evals"` failed (needs `--team`), `linear issue list --team BOT --project "Evals"` printed "No issues found." even though BOT-2100 ("Evals fail to ingest via Data Stack", P1, In Progress, assigned to Chris) was open in that project. `linear issue search` doesn't exist, and `linear issue query --query` is the wrong flag. Only `linear issue query --all-teams --search "evals"` surfaced BOT-2100. The agent had already told the user the work was "Done — and this time it's actually done" and closed BOT-2096.

## Symptom
`linear issue list --team BOT --project "Evals"` -> `No issues found.` (L1018), a false negative.

## Timeline
- L952: agent: "**Done — and this time it's actually done.**" (after closing BOT-2096 at L949).
- L993 [USER] "are the relevant linear issues marked as done"
- L1011: `linear issue list --project "Evals" --json | python3 ...` -> JSONDecodeError (CLI printed an error, not JSON).
- L1015: `✗ Failed to list issues: No default team configured and no team scope provided`.
- L1018: `linear issue list --team BOT --project "Evals"` -> `No issues found.`
- L1021: `linear issue search ...` -> usage screen (no such subcommand; subcommands are `mine, list, l`, `query, q`, ...).
- L1024: `linear issue query --team BOT --query "evals"` -> usage screen (flag is `--search`).
- L1035: `linear issue query --all-teams --search "evals" --limit 25` -> table including BOT-2100.
- L1044: "Important — there's a third issue, and it's **not** done: **BOT-2100** ... (P1, In Progress, assigned to you)."
- L1059-1070: the agent also finds its earlier Linear comment made a false causal claim (deploy timing), posts corrections; the user notes it had only read truncated comments.

## Root cause
`linear issue --help` lists `mine, list, l - List your issues`: `list` is literally `issue mine`. `linear issue list --help` shows `-s, --state ... (Default: [ "unstarted" ])` and a separate `--all-states`. So `list` means "my unstarted issues", and anything In Progress, In Review, Triage or Backlog is invisible. Output says "No issues found." with no hint of the filters applied. The user-level `linear-cli` skill (11 lines) says only "consult --help".

## Why agents fall for it
`list` reads like "list issues matching these filters". The empty result looks like a real answer, so it's easy to conclude "nothing else open" and report done.

## Current state
Still true in linear CLI 2.5.0 (checked `linear issue list --help`: `Usage: linear issue mine`, `--state` default `["unstarted"]`, `--all-states`). Not documented in `~/.claude/skills/linear-cli/SKILL.md` or memory (memory has other linear CLI notes: reference_linear_cli_assignee_lookup.md, reference_linear_doc_api_strips_comment_anchors.md).

## Suggested fix
Add to the linear-cli skill:
- "`issue list` = `issue mine`, defaults to `--state unstarted`. For 'what's open in project X' use `linear issue query --team KEY --project X` (or `--all-teams --search TEXT`), or pass `--all-states`."
- "There is no `issue search`; use `issue query --search`."
- "Needs `--team KEY` (no default team configured)."

## Detection signal
- `linear issue list` / `issue mine` without `--all-states` followed by an assertion that nothing is open.
- `linear issue search` / `--query` usage-screen output (wasted call).

## Raw excerpts
```
L1015 [RESULT] ✗ Failed to list issues: No default team configured and no team scope provided
  Use --team <key> to specify a team.
L1017 [TOOL Bash] linear issue list --team BOT --project "Evals" 2>&1 | head -40
L1018 [RESULT] No issues found.
L1021 [TOOL Bash] linear issue search "evals ClickHouse ingest" --team BOT 2>&1 | head -25
L1022 [RESULT] Usage:   linear issue ... Commands: id ... mine, list, l - List your issues ; query, q - Query issues with structured filters ...
L1035 [TOOL Bash] linear issue query --all-teams --search "evals" --limit 25 2>&1 | head -35
L1044 [ASSISTANT] Important — there's a third issue, and it's **not** done: **BOT-2100 "Evals fail to ingest via Data Stack"** (P1, In Progress, assigned to you).
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
  lines: 280-293
  date: 2026-08-31
  jev: {self_inflicted_bug: 0.59, tool_misuse: 0.97, misleading_signal: 0.84, user_correction: 0.96, codebase_trap: 0.73, flailing: 0.62, env_friction: 0.78}

Deciding where to file a repo-wide ruleset issue, the agent checked SEC and GIT team queues:
`linear issue list --team SEC --limit 8` / `--team GIT` -> `No issues found.` (L281). Retrying with `--state all`
printed the `linear issue mine` usage screen for each team (L290), which is how it learned `list` is an alias of
`mine`. L293: "`linear issue list --team X` appears to filter to your own issues, so the empty results prove
nothing." Here the agent caught the false negative; no bad decision followed.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
  lines: 4250-4326
  date: 2026-08-30
  jev: {self_inflicted_bug: 0.78, tool_misuse: 0.94, misleading_signal: 0.67, user_correction: 0.07, codebase_trap: 0.87, flailing: 0.66, env_friction: 0.92}
- Searching the "Generate OSI metadata for Library" project for an existing observability issue took ~10 calls:
  - L4256-4257 `linear issue list --project ... --json | jq` → `jq: parse error: Invalid numeric literal` (the CLI printed an error, not JSON).
  - L4259-4260, L4272-4273, L4310-4311 `linear <cmd> --help | grep -E "^\s+--"` → empty. The help output is ANSI-coloured even when piped (`[94m--workspace[39m`), so line-anchored greps fail. The agent had to `sed -n` whole help pages.
  - L4288-4289 `linear issue query --project ... --all-states` → `No default team configured and no team scope provided`.
  - L4291-4298 `--json` returns `{"nodes": [...], "pageInfo": ...}`, not an array (`jq: Cannot index array with string "title"`; `.[]` yields nothing).
  - L4300 `linear issue query --team BOT --project ... --all-states --no-pager --json | jq '.nodes[]'` finally works.
- Suggested addition to the linear-cli skill: "Use `linear issue query --team BOT --all-states --no-pager --json | jq '.nodes[]'`; help output is coloured, so read it with `NO_COLOR=1` or don't grep it."
