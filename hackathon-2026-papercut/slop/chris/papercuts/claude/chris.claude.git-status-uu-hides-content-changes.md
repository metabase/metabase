---
title: A test that asserts "left the conflict untouched" by comparing `git status --porcelain` before and after proves nothing, because a conflicted path stays `UU` however its contents change
slug: git-status-uu-hides-content-changes
kind: misleading-signal
impact: introduced-bug
severity: low
status: fixed
area: mage/test/mage/merge_kondo_ratchets_test.clj (refused helper); any test or script using git status to check a conflicted file is unchanged
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
    lines: 1178-1211
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.80, misleading_signal: 0.82, user_correction: 0.91, codebase_trap: 0.83, flailing: 0.20, env_friction: 0.65}
---
## Summary
`bin/merge-kondo-ratchets` must refuse bad input and leave the conflicted `.clj-kondo/ratchets.edn` alone.
The test helper `refused` checked that by comparing `(status dir)` (git porcelain status) before and after the run.
roborev job 5310 flagged that git status alone can't show the file was left alone. The agent confirmed it in a scratch repo: `UU f.txt` before, and `UU f.txt` after overwriting the file with `CLOBBERED`.
The weakness predated the agent's changes (the original helper did the same). The fix snapshots `[status, file contents]`.

## Symptom
A green test suite whose "unchanged" assertion could never fail on content changes. Nobody observed a wrong result; roborev found it by reading the code.

## Timeline
- L1180: roborev 5310: "...compare the ratchets file's existence/content and unmerged index entries in addition to its status."
- L1184-1185: scratch repo. `status while conflicted: UU f.txt` / `status after clobbering file: UU f.txt`.
- L1188: "Confirmed — `UU` survives clobbering the file completely. The status comparison proves nothing about content, and that weakness predates my consolidation."
- L1189-1200: the snapshot becomes `[(status dir) (when (fs/exists? f) (slurp (str f)))]`. 95 tests / 764 assertions.

## Root cause
While a path is unmerged, porcelain status reports the index state (the `UU`/`AA`/`DU` stages), not whether the worktree file differs from any stage. Rewriting the file doesn't change the status code until `git add`.

## Why agents fall for it
- In normal (non-conflict) work, `git status` is the usual "did anything change?" probe, and there it does report worktree edits (` M`).
- A status comparison is short and passes on the good path.

## Current state
Fixed in the helper (commit "Compare the conflicted file, not just its status", 6386168 on #81341). The general pitfall isn't documented anywhere.

## Suggested fix
For conflict-state assertions, compare file bytes plus `git ls-files -u` (stage entries), not porcelain status. Worth a line in any merge-driver/test guidance.

## Detection signal
A test or script that captures `git status --porcelain` as the only evidence that a conflicted file is unchanged.

## Raw excerpts
```
L1184 [TOOL Bash] d=$(mktemp -d) && cd "$d" && ... git init -q -b main && echo base > f.txt && ... git merge ...; echo "status while conflicted:      $(git status --porcelain)"; echo "CLOBBERED" > f.txt; echo "status after clobbering file: $(git status --porcelain)"
L1185 [RESULT] Auto-merging f.txt
CONFLICT (content): Merge conflict in f.txt
Automatic merge failed; fix conflicts and then commit the result.
status while conflicted:      UU f.txt
status after clobbering file: UU f.txt
```
