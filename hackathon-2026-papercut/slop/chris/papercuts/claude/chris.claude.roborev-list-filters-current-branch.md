---
title: `roborev list` silently filters to the current branch, so reviews enqueued for other branches look missing
slug: roborev-list-filters-current-branch
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: roborev CLI (host daemon)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 2781-2917
    date: 2026-09-08
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.93, misleading_signal: 0.79, user_correction: 0.61, codebase_trap: 0.89, flailing: 0.41, env_friction: 0.83}
---
## Summary
`roborev list` defaults to `--branch <current branch>` without saying so in its output. The agent ran
it from a worktree on a different branch, saw only other jobs, and concluded its commits had never been
enqueued. It invented a cause (`--no-verify` skipping post-commit -- false; git's `--no-verify` does
not skip post-commit), ran `bun install`, and manually enqueued branch reviews. Later a job it was
waiting on (5534) "disappeared" again for the same reason; `roborev status` showed it running.
Jobs 5531/5532 for the agent's own `--no-verify` commits (48a7594, fc3e18e) were in fact visible in
`roborev status` (L2908), disproving the earlier theory.

## Symptom
```
L2782 [RESULT] ID    SHA      Repo      Agent  Status    Time
4638  f4c980b  metabase  codex  done      4m26s
...  (no job for this session's commits)
L2785 [ASSISTANT] These are other people's/other branches' -- mine never got enqueued, because every commit I made used `--no-verify` to dodge the husky failure, which skips the post-commit hook too.
L2905 [RESULT] Error: no review found for job 5534
L2907 roborev list --all -> Error: unknown flag: --all
      --branch string   filter by branch (default: current branch)
L2917 [ASSISTANT] 5534 is still running (21m) -- `roborev list` filters by current branch, which is why it looked missing.
```

## Root cause
Implicit default filter with no header ("showing jobs for branch X"). Combined with worktrees, the
"current branch" is whatever the Bash cwd happens to be on.

## Why agents fall for it
`list` reads as "all jobs"; there is no `--all`. The absence looks like a real signal and invites
a causal story.

## Current state
Open (roborev v0.67.0 in transcript). Not in memory (`reference_roborev_fix_list_lag.md` covers a
different lag in `fix --list`).

## Suggested fix
roborev: print "Jobs for branch <b> (use --branch '' for all)" as the first line, or add `--all`.
Memory/CLAUDE note: use `roborev status` or `roborev list --branch <b>` explicitly.

## Detection signal
Agent runs `roborev list`, then asserts reviews are missing/not enqueued; `roborev list --all` unknown flag.

## Raw excerpts
See Symptom.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-cycle-clusters/aa87adef-8b0f-46f8-bdb7-486d04e80b58.jsonl
  lines: 925-1012, 1144-1207, 1323-1348
  date: 2026-09-11/12
  jev: {self_inflicted_bug: 0.94, tool_misuse: 0.87, misleading_signal: 0.86, user_correction: 0.11, codebase_trap: 0.77, flailing: 0.64, env_friction: 0.94}

A related case: the filter also depends on **cwd**. From a directory that is not a git repo, `roborev list` finds no repo or branch and prints `No jobs found.` with exit 0.
- L925 the agent's background watcher polls `roborev list | awk '$2 ~ /^c4d96d8/'`, but the Bash cwd had moved to the session scratchpad. After 30 min it reports `no completed roborev review for c4d96d8 after 30m / No jobs found.` (L993).
- L1012 conclusion: "roborev never queued a review for the amended commit (and `roborev list` now reports no jobs at all — the daemon looks to have been cleared)".
- L1175 / L1179 the same thing again with job 5739: "`roborev list` now reports no jobs at all — the same disappearance that swallowed job 5716. That points at the host daemon losing its queue".
- L1189 `roborev daemon status` shows the daemon running with 5508 completed jobs. L1200: "roborev is fine; my probes were wrong ... `roborev list` returned 'No jobs found' because my shell cwd moved to the scratchpad earlier, so it had no repo context."
- L1203 from inside the repo the list shows 5739 running, and 5738 done for the same sha. `roborev show 5739` → `Error: no review found for job 5739`. That message does not say "the job is still running", so the agent took 5739 to be the missing review. The review was actually in 5738.

Second roborev quirk in this region: after `git commit --amend`, the post-commit hook plus a manual `roborev review` queued two codex jobs for the same sha (5743, 5744). Both stalled for about 1h55m against a normal 13 min, and held 2 of the 4 workers. `roborev daemon status` showed `Health: DEGRADED`. The agent had to cancel both and queue a single fresh job (L1328-1341). The watcher loops could not tell "stalled" from "running".

Suggested addition: when `roborev list` / `show` runs outside a repo, fail loudly ("not in a git repository; pass --repo"). Have `show` on a running job say "job N is still running". Memory note: run roborev commands with `cd <repo> &&` or `git -C`-style flags. Background watchers do not inherit a later `cd`.
