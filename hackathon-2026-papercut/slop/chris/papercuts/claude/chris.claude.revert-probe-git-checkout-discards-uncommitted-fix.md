---
title: The "revert the fix and confirm the test fails" probe, done with `git checkout -- <file>`, wipes the other uncommitted fixes in the same file
slug: revert-probe-git-checkout-discards-uncommitted-fix
kind: agent-behaviour
impact: wasted-time
severity: low
status: open
area: agent verification workflow (mutation/revert probes); evals core/capture.py; also metabase worktrees
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-andreis-fix-result-metadata-contracts/ac10dbfc-43e6-404f-9d15-bc71dbd4bc09.jsonl
    lines: 436-455
    date: 2026-09-07 (approx)
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.50, misleading_signal: 0.49, user_correction: 0.89, codebase_trap: 0.83, flailing: 0.40, env_friction: 0.50}
---
## Summary
The agent was implementing four fixes (#2, #3, #5, #6) in `core/capture.py` without committing. To prove the new
exec-bit test was load-bearing, it mutated one line with a Python replace, ran the test, and "restored" with
`git checkout` of the file. That also reverted every other uncommitted change in `capture.py`: the finalization
marker, the atomic manifest write and the fsync handling. It then had to re-apply all of them in one large
Python patch (L451, about 6 KB of `sub(old, new)` calls).

In the same batch, the metabase OSI session (93bd1b32) did the probe safely every time:
`cp file $SP/x-fixed.clj; <mutate>; <test>; cp $SP/x-fixed.clj file` (e.g. L1155, L1704, L3071, L3249). So a safe
recipe exists and is applied unevenly.

## Symptom
```
L447 [ASSISTANT] The `git checkout` in that probe reverted my `capture.py` edits. Re-applying them:
L449 193:    def close(self) -> None:      (the new signature close(complete=...) is gone)
```

## Timeline
- L272-361: four fixes edited into `core/capture.py` (uncommitted).
- L436: mutate → run → `git checkout` restore.
- L448-449: grep shows the fixes are gone.
- L451-455: re-apply them all; 1549 passed.

## Root cause
Agent behaviour: `git checkout -- file` restores the file to HEAD, not to "before my probe". Nothing in the
workflow snapshots the working state before a mutation probe.

## Why agents fall for it
`git checkout -- file` is the reflexive "undo my experiment" command, and it's right only when the file had no
other uncommitted edits.

## Current state
Pattern, no code fix. The user's memory "No test theatre" encourages revert probes but doesn't prescribe how to
restore safely.

## Suggested fix
Add to memory or the clojure-write skill: "For revert probes, `cp` the file to scratch (or `git stash push -- file`)
and restore from that copy. Never `git checkout --` a file with other uncommitted work." A PreToolUse hook could warn on
`git checkout -- <path>` when `git diff --stat <path>` is non-empty beyond the probe.

## Detection signal
`git checkout -- <file>` (or `git restore <file>`) right after a mutate-and-test step, followed by "re-applying".

## Raw excerpts
See Symptom.
