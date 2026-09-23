---
title: A stale `origin/<branch>` ref (no fetch prune) made a merged, auto-deleted PR branch look in sync, so pushing a master merge to it recreated the branch on the public repo
slug: stale-remote-tracking-ref-resurrects-merged-pr-branch
kind: misleading-signal
impact: wasted-time
severity: low
status: open # workflow gap; nothing prunes remote-tracking refs before the push loop
area: git fetch without --prune, per-PR worktrees under ~/src/mb/wt, GitHub delete-branch-on-merge
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/cc241e7a-e140-4ab6-94cb-4cd826d04ab6.jsonl
    lines: 188-404
    date: 2026-09-10
    jev: {any_papercut: 0.72, env_toolchain: 0.87, stale_state: 0.28, verify_mismatch: 0.59, misleading_code: 0.18, hidden_coupling: 0.53, stale_docs: 0.28, tool_footgun: 0.68, flaky: 0.63, agent_bug: 0.49, wasted_effort: 0.41, user_correction: 0.10}
---
## Summary
The user asked for fixes plus a master merge pushed to each of five open PRs from an earlier review list. One of them had been merged that afternoon and GitHub deleted its branch. The agent's sync check compared local branches with `origin/<branch>`, which still existed locally because fetches never prune, so it reported 0/0. The push printed `* [new branch]`, recreating the branch; deleting it was then blocked by the permission classifier and left to the user.

## Symptom
- L193: the merged PR's branch shows `unpushed-remote-ahead:0 local-ahead:0`.
- L330: `* [new branch]  HEAD -> <merged-pr-branch>`.
- L337: the PR is `MERGED` at 13:01 UTC the same day.

## Timeline
- L188-L193: sync check against stale remote-tracking refs looks clean.
- L325-L330: loop pushes all five worktrees; one push creates a new branch.
- L336-L346: agent notices the PR was merged and its branch deleted.
- L347-L352: two deletion attempts blocked; L404 hands the delete command to the user.
- Cost: a stray branch on the public repo and a manual cleanup.

## Root cause
`git fetch origin master` updates only master; remote-tracking refs for deleted branches stay until `git fetch --prune`. The PR list came from an external review done hours earlier, and PR state was checked only after the push.

## Why agents fall for it
`origin/<branch>` existing and matching the local branch reads as "the branch is live and I am up to date".

## Current state
Not checked; process issue.

## Suggested fix
- Before pushing to PR branches, check `gh pr view --json state` for each and skip merged or closed ones.
- Fetch with `--prune` in agent recipes, or set `fetch.prune=true` in the checkout.

## Detection signal
`* [new branch]` in the output of a push to a branch that has a merged PR.

## Raw excerpts
```
L188 [CALL] Bash: ... git fetch origin master --quiet && echo fetched; for b in ...; do echo "=== $b"; git rev-list --left-right --count origin/$b...$b 2>/dev/null | awk '{print "  unpushed-remote-ahead:"$1" local-ahead:"$2}'; ...
L193 [RESULT] fetched | === <branch-1> |   unpushed-remote-ahead:0 local-ahead:0 |   behind master:124 | === <merged-pr-branch> |   unpushed-remote-ahead:0 local-ahead:0 |   behind master:6
L325 [CALL] Bash: for wt in <merged-pr-branch> ...; do cd ~/src/mb/wt/$wt; echo "=== $wt"; git push origin HEAD 2>&1 | tail -2; done
L330 [RESULT] === <merged-pr-branch> | To github.com:metabase/metabase.git |  * [new branch]              HEAD -> <merged-pr-branch> | ...
L337 [RESULT] {"headRefName":"<merged-pr-branch>","mergedAt":"2026-09-10T13:01:56Z","state":"MERGED",...}
```
