---
title: /code-review with no target, run from a clean master worktree, silently reviewed the last merged commit instead of the branch
slug: code-review-no-target-reviews-head-commit
kind: tool-quirk
impact: wasted-time
severity: medium
status: unknown
area: Claude Code /code-review skill, multi-worktree workflow
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 932-954
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.60, misleading_signal: 0.60, user_correction: 0.97, codebase_trap: 0.75, flailing: 0.32, env_friction: 0.72}
---
## Summary
The agent had moved its work to a new worktree/branch (`beguild-30-explicit-shrink`) and restored the primary worktree to clean `master`. The user then typed `/code-review` in the session whose cwd was still the primary worktree. The review subagent found `git diff @{upstream}...HEAD` and `git diff HEAD` empty and fell back to reviewing `HEAD` (the already-merged #81341) without saying loudly that it was not reviewing the work in question. ~7.5 minutes and 117k subagent tokens went on the wrong code, and its findings then sent the parent agent down another wrong path (see `merge-driver-bin-dir-looks-wrong`).

## Symptom
```
L936 <result> ## Scope
`git diff @{upstream}...HEAD` and `git diff HEAD` were both empty (branch is clean and level with `origin/master`), so I reviewed `HEAD` — `7f73a7464cc Add merge tool for ratchet conflicts (#81341)` ...
<usage><subagent_tokens>117261</subagent_tokens><tool_uses>29</tool_uses><duration_ms>448161</duration_ms></usage>
```
L938 agent: "The review ran in the primary worktree, which is on clean `master` ... it fell back to reviewing `HEAD`, i.e. #81341, the already-merged commit, not my branch."
L954 user re-runs `/code-review beguild-30-explicit-shrink`.

## Root cause
Two things: (1) the session cwd stays in the primary worktree after the agent creates a new worktree with plain `git worktree add` (it did not use EnterWorktree / `wt switch`), so session-level commands target the wrong checkout; (2) `/code-review` treats "nothing to diff" as "review HEAD" instead of stopping and asking.

## Why agents fall for it
The fallback is plausible and the review output looks authoritative. The parent agent only noticed because the scope line named a commit it did not recognise.

## Current state
Unknown for the skill itself (built-in). The workflow trap remains: agent-created worktrees do not move the session cwd.

## Suggested fix
- `/code-review` with empty working diff on the default branch should refuse or ask, not fall back to HEAD.
- When an agent moves work to a new worktree, it should switch the session (EnterWorktree / `wt switch`) or tell the user that slash commands still target the old checkout.

## Detection signal
Review output whose scope line says "diff was empty, so I reviewed HEAD"; session cwd on `master`/default branch while the recent commits are on another worktree's branch.

## Raw excerpts
```
L949 [ASSISTANT] That review didn't cover my work. It ran in the primary worktree, which I'd restored to clean `master`, so it reviewed `7f73a7464cc` — the already-merged #81341. To review the branch:
/code-review beguild-30-explicit-shrink
```
