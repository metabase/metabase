---
title: kata in a worktree with no bound project -- `create` succeeds but `label/edit/show` fail, and the error's suggested fix (`kata#abc4`) uses a literal project name "kata" that does not exist
slug: kata-unbound-workspace-qualified-ref-hint-misleads
kind: tool-quirk
impact: wasted-time
severity: low
status: unknown
area: kata CLI (workspace/project binding, ref resolution); ~/.claude/skills/kata
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc.jsonl
    lines: 753-793
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.55, misleading_signal: 0.80, user_correction: 0.33, codebase_trap: 0.89, flailing: 0.76, env_friction: 0.57}
---
## Summary
From the worktree `metabase.fix-app-db-rollback-only`, `kata create` worked (issue `xy73`), and `kata list` showed it.
But `kata label add xy73 ...`, `kata edit xy73 ...` and `kata show xy73` all failed with
`no project bound to this workspace; use a qualified ref (e.g. kata#abc4)`. Following the hint literally
(`kata show kata#xy73`) failed with `project kata is not registered`. `kata project list` does not exist. The agent
spent ~6 tool calls (including `kata list --json | jq` to find `project_id`) before guessing `--project metabase`.

## Symptom
```
L767 ERR add validation: no project bound to this workspace; use a qualified ref (e.g. kata#abc4)
L770 ERR show not_found: project kata is not registered
L773 ... ERR kata usage: unknown command "project" for "kata"
L790 kata edit --project metabase xy73 --priority 1 -> Changes: priority
```

## Timeline
- L756 `kata create ... --agent` -> `OK create xy73`.
- L766 `kata label add xy73 regression` -> ERR no project bound.
- L769 `kata show kata#xy73` -> `project kata is not registered`.
- L772 `kata project list` -> unknown command.
- L786-789 digs `project_id=2` out of JSON; project name not in output (`.project_name // .project // "?"` -> `?`).
- L789-793 `--project metabase` works for edit, label, show.

## Root cause
Asymmetric project resolution: create/list infer a project (or a default) for an unbound worktree, while per-issue
commands require a binding or qualified ref. The error's example uses the tool's own name as the project, which reads
as a literal prefix. JSON output exposes `project_id` but not the project name, and there is no command to list
projects.

## Why agents fall for it
Error-message examples are copied literally. The skill says "Cross-project: `kata#abc4`", reinforcing the reading
that `kata#` is a fixed prefix.

## Current state
Unknown -- not re-run (kata is a host daemon; per global CLAUDE.md, probes need escalation). The kata skill
(`~/.claude/skills/kata`) mentions `--project <name>` under Preconditions and `kata#abc4` for cross-project refs, but
not that per-worktree binding may be missing in secondary worktrees.

## Suggested fix
- kata: make the hint name the real registered projects (`use --project metabase or metabase#xy73`), include
  `project_name` in JSON, add `kata projects`.
- Skill: note "in a worktree other than the main checkout, pass `--project metabase`".

## Detection signal
Any `no project bound to this workspace` error in a transcript; `kata show kata#...`.

## Raw excerpts
```
L776 [TOOL Bash] kata edit xy73 --priority 1 --agent 2>&1 | tail -3; kata show xy73 --agent 2>&1 | head -12
L777 [RESULT] ERR edit validation: no project bound to this workspace; use a qualified ref (e.g. kata#abc4)
ERR show validation: no project bound to this workspace; use a qualified ref (e.g. kata#abc4)
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
  lines: 380-400, 594-608
  date: 2026-08-31
  jev: {self_inflicted_bug: 0.59, tool_misuse: 0.97, misleading_signal: 0.84, user_correction: 0.96, codebase_trap: 0.73, flailing: 0.62, env_friction: 0.78}

Same trap from worktree `metabase.beguild-30-ratchet-policy`: `kata create ... --related 725d` had worked (L332, issue
`4fvg`), but `kata comment 4fvg` -> `kata: no project bound to this workspace; use a qualified ref (e.g. kata#abc4)`
(L381). Following the hint, `kata comment kata#4fvg` -> `kata: project kata is not registered` (L385). `kata projects`
printed usage (L388); `kata projects list` showed `2 metabase` (L391); `metabase#4fvg` worked (L394). Then
`kata close` needed `--reason` (L397: "one of: done, wontfix, duplicate, superseded, audit-no-change"), and
`--reason done` needed `--evidence commit:<sha>|pr:<url>|test:<cmd>|reviewed-paths:<path>` (L595). Five round trips
to comment on and close one issue. Note `kata new` doesn't exist either (L300, it's `kata create`).

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
  lines: 3386-3411, 3492-3503, 4165-4166
  date: 2026-08-30
  jev (chunk 11): {self_inflicted_bug: 0.87, tool_misuse: 0.96, misleading_signal: 0.92, user_correction: 0.35, codebase_trap: 0.80, flailing: 0.47, env_friction: 0.85}
- L3386-3387: `kata search "OSI generation" --agent` works from the worktree `metabase.pr-03-llm-config` and returns refs like `s3a5`.
- L3391-3392: `kata show s3a5` → `ERR show validation: no project bound to this workspace; use a qualified ref (e.g. kata#abc4)`.
- L3394-3395: following the hint, `kata show kata#s3a5` → `ERR show not_found: project kata is not registered`.
- L3397-3401: `kata projects` (plural) exists and lists `2 metabase ...`, which `search --json | jq .issue.project_id` confirms. L3410 `kata show metabase#s3a5` works.
- **New facet, misleading JSON:** L3492-3496: after `kata label add ...` (outputs discarded with `>/dev/null 2>&1`), `kata show metabase#3ydm --json | jq '.issue.labels'` → `null` for all three issues, which suggests the labels didn't stick. `kata show --agent` shows `Labels: backend,handoff,in-progress,metabot`. The agent concluded "the `--json` shape hides them" (L3503). The JSON view silently omits a field the text view has.
- L4165-4166: `kata show metabase#3udm` (user typo) → `"metabase#3udm" is not a valid issue ref: shortid: invalid ref`. Fine, but note that a wrong short id is "invalid ref" and not "not found".

- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/42c11300-351a-4e89-a17d-1aaa63c2bfde.jsonl
  lines: 20-26
  date: 2026-08-30
  jev: {context only; region 861-1761 flagged}
- `kata show cbhw` → `kata: no project bound to this workspace; use a qualified ref (e.g. kata#abc4)`. The agent went straight to `kata show metabase#cbhw`, so the right form is learnable, but it still costs one call every session in an unbound worktree.
