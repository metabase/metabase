---
title: `gh pr view --json body --jq .body | diff - body.md` after `gh pr edit --body-file body.md` always reports one extra trailing line, so the agent's post-edit check failed and was ignored
slug: gh-pr-body-roundtrip-extra-trailing-newline
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: gh pr edit --body-file; gh pr view --json body --jq .body
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a632b29c43867bb36.jsonl
    lines: 305-313
    date: 2026-09-17
    jev: {any_papercut: 0.76, env_toolchain: 0.36, stale_state: 0.33, verify_mismatch: 0.89, misleading_code: 0.27, hidden_coupling: 0.68, stale_docs: 0.27, tool_footgun: 0.64, flaky: 0.94, agent_bug: 0.48, wasted_effort: 0.51, user_correction: 0.54}
---
## Summary
The agent edited the PR description from the live body and verified with `gh pr view 80083 --json body --jq .body | diff - body-new.md && echo body-ok`. The diff printed `24d23 <` (an extra empty line from jq's output) and the command exited 1; the agent went on to CI without resolving it, so the check it wrote to catch concurrent edits verified nothing. Another subagent in the same session stripped trailing newlines before editing to avoid the same mismatch (agent-a6fd L482).

## Symptom
L310: `Exit code 1` ... `24d23` / `<`, and no `body-ok`.

## Timeline
- L305-L306: body fetched and edited locally.
- L309-L310: edit applied; the verify diff fails on a trailing newline.
- L313: agent moves on to CI polling.
- Cost: a verification step that could never pass; a real concurrent edit would have looked the same.

## Root cause
`--jq .body` prints the string plus a newline, while the file handed to `--body-file` already ended with one, so the round trip differs by one line.

## Why agents fall for it
The diff output is a single cryptic line and the edit itself succeeded.

## Current state
not checked (gh behaviour).

## Suggested fix
- Compare with trailing whitespace stripped on both sides, or use `--jq '.body' | head -c -1`.

## Detection signal
`diff - <body file>` after `gh pr view --json body --jq .body` printing only `NNdNN` and `<`.

## Raw excerpts
```
L309 [CALL] Bash: SP=<scratchpad> && cd ~/src/mb/wt/<worktree> && gh pr edit 80083 --body-file $SP/body-new.md && ... && gh pr vi
L310 [RESULT (ERROR)] Exit code 1
    https://github.com/metabase/metabase/pull/80083
    ...
    24d23
    <
L313 [CALL] Bash: cd ~/src/mb/wt/<worktree> && sleep 60; gh pr checks 80083 2>&1 | awk -F'\t' '{print $2}' | sort | uniq -c; gh pr view 80083 --json mergeable,m
```
