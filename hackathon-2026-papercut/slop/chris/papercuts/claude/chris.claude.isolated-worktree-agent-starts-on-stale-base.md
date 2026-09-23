---
title: Worktree-isolated forked subagent got a worktree on an old master commit, not the parent's branch; plus "too complex to verify" refusals for ordinary git loops
slug: isolated-worktree-agent-starts-on-stale-base
kind: tool-quirk
impact: wasted-time
severity: medium
status: unknown
area: Claude Code Agent tool (fork, isolation: worktree)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-search-reindex-should-use-a-dedicated-lease-not-the-cluster/e3372045-21d0-4423-a7d8-a42d1960d9f7/subagents/agent-a866d6468d3e9ce14.jsonl
    lines: 2-97
    date: 2026-09
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.89, misleading_signal: 0.61, user_correction: 0.25, codebase_trap: 0.75, flailing: 0.44, env_friction: 0.85}
---
## Summary
A forked subagent told "You inherit the full conversation context about the search reindex lease (branch uxw-4796-..., PR #80283). You are working in your own isolated git worktree" started in `metabase.agent-a866d6468d3e9ce14` at `1e78c186c0c Improve log output in DWH GC job (#81447)` (an old master commit), not at the parent branch tip. The file it was asked to analyse (`src/metabase/search/lease.clj`) did not exist there. It had to `git reset --hard 6345e0335c5` (the branch tip, found via `git rev-parse <branch>`). A `for c in $(git log ...)` loop was then refused: "this command is too complex to verify that it stays inside the worktree".

## Symptom
```
L6-7 git log --oneline -3 -> 1e78c186c0c Improve log output in DWH GC job (#81447) ...
     ugrep: warning: src/metabase/search/lease.clj: No such file or directory
L9-10 git reset --hard 6345e0335c5 -> HEAD is now at 6345e0335c5 Wait for the restore-gate worker with a latch instead of cancelling
L15 [RESULT ERROR] This agent is isolated in the worktree ..., but this command is too complex to verify that it stays inside the worktree. Refusing to run it — ... Split it into plain, separate commands
```

## Root cause
Worktree isolation creates the worktree from some base other than the parent's checked-out HEAD (possibly the primary repo's HEAD/default branch), while the fork prompt says "same repository, same relative file structure" and inherits context that refers to branch files.

## Why agents fall for it
The fork prompt implies the worktree mirrors the parent. An agent that doesn't check `git log` would analyse or edit the wrong code, or conclude the feature doesn't exist. Here the agent noticed only because a grep failed.

## Current state
Unknown (harness behaviour). The subagent then ran its analysis fine after the reset.

## Suggested fix
- Harness: create isolated worktrees at the parent's HEAD (detached) and state the commit in the fork preamble.
- Parent prompts: include "first `git reset --hard <sha>`" with the explicit sha when forking into a worktree.

## Detection signal
First commands in an isolated subagent: file-not-found for files the parent just edited; `git reset --hard <sha>` early in a subagent; the "too complex to verify" refusal string.

## Raw excerpts
```
L4 [USER] You've inherited the conversation context above from a parent agent working in /Users/christruter/workspace/metabase/metabase.uxw-4796-... You are operating in an isolated git worktree at /Users/christruter/workspace/metabase/metabase.agent-a866d6468d3e9ce14 — same repository, same relative file structure, separate working copy.
```
