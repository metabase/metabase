---
title: Worktree-isolation guard refused git-free `python - <<PY > file` and `psql ... < file` commands as "too complex to verify that it stays inside the worktree"
slug: worktree-isolation-guard-refuses-heredoc-redirects
kind: tool-quirk
impact: wasted-time
severity: low
status: fixed
area: Claude Code worktree-isolated sessions (Bash guard)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2001-audit-appdb-and-dwh-dumps-for-stats-lane-evals/7ad9c402-a811-43c6-b9fe-5e4803b3d6a2.jsonl
    lines: 1494-1506
    date: 2026-08-26
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.84, misleading_signal: 0.61, user_correction: 0.76, codebase_trap: 0.78, flailing: 0.34, env_friction: 0.82}
---
## Summary
In a worktree-isolated session (`evals.mbql-ids-verified-at-build`), the agent generated seed SQL with
`uv run python - <<'PY' > /tmp/mbql-rows.sql ... PY` and piped it into a Docker Postgres. Neither command touches
git, but the guard refused both: "this command is too complex to verify that it stays inside the worktree ... a
worktree-isolated session's git operations must target its own worktree. Split it into plain, separate commands".
Splitting did not help (second attempt refused too). The agent worked around it by writing a standalone script to the
scratchpad with the Write tool and running that.

## Symptom
```
L1495 [RESULT ERROR] This session is isolated in the worktree /Users/christruter/workspace/metabase/evals.mbql-ids-verified-at-build,
but this command is too complex to verify that it stays inside the worktree. Refusing to run it -- a worktree-isolated
session's git operations must target its own worktree. Split it into plain, separate commands and run them from ...
L1498 [RESULT ERROR] (same, after removing the psql part)
L1501 [ASSISTANT] The guard dislikes heredoc-plus-redirect. Writing a single script instead:
```

## Root cause
The guard's static analysis could not prove heredocs/redirects/`$(...)` were git-free and failed closed. Its message
talks about git operations, which the command did not have, so "split it" is not actionable.

## Why agents fall for it
Heredoc-to-interpreter is the default idiom for one-off scripts; the refusal text suggests splitting, which does not
address the actual trigger.

## Current state
Harness changelog (`~/.claude/cache/changelog.md:1158`): "Fixed worktree-isolated sessions refusing Bash loops,
`$VAR` reads, `"$(...)"` and heredocs that never touch git as 'too complex to verify that it stays inside the
worktree'" (and earlier :1088 for loops/xargs). Memory `reference_edit_hook_reindents_style_indent_macros.md` still
carries the workaround note ("the worktree guard rejects Bash commands it cannot prove avoid git -- build the
replacement text in a scratchpad file").

## Suggested fix
Fixed upstream; the memory note could be pruned once confirmed.

## Detection signal
Result text "too complex to verify that it stays inside the worktree".

## Raw excerpts
See Symptom.
