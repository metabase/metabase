---
title: Restacking the kondo-ratchet stack conflicts on the generated .clj-kondo/ratchets.edn at almost every commit; hand-rolled regen and rebase loops dropped keys, resurrected deleted files, falsely reported "done" in a worktree, and amended the wrong commit
slug: ratchets-edn-restack-regen-conflicts
kind: tool-quirk
impact: both
severity: medium
status: fixed
area: .clj-kondo/ratchets.edn (generated budgets); dev/src/dev/kondo_ratchet.clj; gh stack / git-spice restack; bin/merge-kondo-ratchets
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets/47881e30-929e-4ee2-b1dd-2ec7145a8d1e.jsonl
    lines: 6-428
    date: 2026-08 (BEGUILD-30 stack restack, before 2026-08-27)
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.88, misleading_signal: 0.72, user_correction: 0.09, codebase_trap: 0.77, flailing: 0.67, env_friction: 0.83}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets/399c72ad-11ba-4e3c-b69a-f89e28e338fd.jsonl
    lines: 411-859
    date: 2026-08-27
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.47, misleading_signal: 0.66, user_correction: 0.09, codebase_trap: 0.62, flailing: 0.75, env_friction: 0.91}
---
## Summary
The four-branch BEGUILD-30 stack had about 67 commits (#79531 -> #77820 -> #78217 -> #78168). Nearly every commit edits `.clj-kondo/ratchets.edn`, a generated, column-aligned EDN file of per-linter budgets. Rebasing onto a master 347 commits ahead produced a conflict in that file on almost every commit. The agent had no merge tool for it (`bin/merge-kondo-ratchets` didn't exist yet) and improvised. Each improvisation hit a separate trap:

1. **Regen script drops keys.** The first `regen-ratchets.clj` rendered only `{:ignore-counts ...}`. The file had since gained `:comment-exempt` and later `:config-counts`, so regeneration silently emptied them. Result: `:comment-exempt #{}` (test FAIL at k3 L481) and "`:config-counts` is empty again — same known gap" (k3 L821).
2. **Worktree `.git` is a file.** The auto-continue loop tested `[ ! -d .git/rebase-merge ]`. In a linked worktree `.git` is a file, so the test was always true: the loop printed `REBASE_DONE` while the rebase was mid-conflict (k2 L228-233). Fix: `git rev-parse --git-path rebase-merge`.
3. **modify/delete (DU) auto-resolution resurrected a file master deleted.** `test/metabase/query_processor/generative_test.clj` reappeared on the top branch (k2 L305-317) and had to be removed from two historical commits via an interactive rebase.
4. **Misplaced comment.** A justification comment was auto-merged onto the wrong require line (bigquery driver, k2 L320-346).
5. **`--ours` empties the regen commit.** During a git-spice restack, `git checkout --ours .clj-kondo/ratchets.edn` means the *upstream* side in a rebase. That emptied each "Regenerate kondo ignore budgets" commit, and git dropped it silently. The agent's next `git commit --amend` then amended the previous commit, "Use the mdb.env alias in app-db-as-data-warehouse", folding the budgets into an unrelated commit (k3 L653-707). Recovered via reflog + `git reset --hard 5c2996c1e31`.
6. **Silent exemption widening.** Master had added unjustified ignores for two linters the PR had fully justified. Regeneration widened `:comment-exempt` to cover them (k2 L381-391).
7. **`gh stack rebase --continue` exits 129.** It failed with `exit status 129` once conflicts were resolved (k2 L155-156). It worked only after `GIT_EDITOR=true git rebase --continue`. Running `gh stack` from the scratchpad cwd gave `✗ not a git repository` (k2 L248-249).

## Symptom
- k2 L79: `⚠ Rebasing kondo-ignore-map-syntax onto master — conflict ... C .clj-kondo/ratchets.edn ... C test/metabase/query_processor/generative_test.clj`
- k2 L96: five conflict hunks in a 95-line file.
- k2 L156: `rebase continue failed — resolve remaining conflicts and try again: exit status 129`
- k2 L229/L233: `REBASE_DONE` then `## HEAD (no branch) / UU .clj-kondo/ratchets.edn` and `.git/worktrees/metabase.kondo-ratchets/rebase-merge`
- k2 L307: `test/metabase/query_processor/generative_test.clj | 73 +++++` present on the stack tip but not on master.
- k3 L481: `FAIL in metabase.core.kondo-ratchet-test/ignores-are-justified-test` after regen emptied `:comment-exempt`.
- k3 L688: `[kondo-ignore-map-syntax 9f0fb3088dc] Use the mdb.env alias in app-db-as-data-warehouse ... 2 files changed`. The amend landed on the wrong commit.
- k3 L731 ASSISTANT: "Committing as a fresh commit this time (not amend, to avoid the empty-commit trap on later rebases)."

## Timeline
- k2 L68: backup branches `backup/prerestack-*` (good practice).
- k2 L78: `gh stack rebase --preserve-dates`.
- k2 L143-152: regen via `bb` script.
- k2 L224-245: auto-resolving `rebase-loop.sh`; worktree path bug found and fixed.
- k2 L297-302: `resolve_deleted.py` for "master deleted what the branch commented on".
- k2 L305-355: verify, fix resurrected file and misplaced comment via `rebase -i` with a scripted sequence editor.
- k2 L359-391: tip drift check, then exemption widening found.
- k3 L471-514: per-branch test run finds `:comment-exempt #{}`, fixed by hand, amended.
- k3 L523-546: git-spice restack conflict, resolved by hand.
- k3 L590-653: user asks to land PRs. Fetch master (L627: `refusing to fetch into branch 'refs/heads/master' checked out at ...`), pull in the main checkout, restack.
- k3 L657-674: `checkout --ours` x4, and each regen commit silently dropped.
- k3 L677-707: `fix-kondo-ratchets` + a `--seed` loop over 15 linters, then `commit --amend` hits the feature commit. Reflog shows it.
- k3 L721-733: reset, redo, fresh commit.
- k3 L821: `:config-counts` lost again, restored by hand.

## Root cause
- A single generated file that every commit in a long stack touches is a conflict magnet. Git has no merge driver for it (`.gitattributes` has only the migrations yaml driver).
- The regen tooling in `dev.kondo-ratchet` had no "merge base/ours/theirs" mode, so agents wrote partial regenerators that knew only the keys they had seen.
- Rebase `--ours`/`--theirs` inversion plus git's silent drop of now-empty commits turns a routine resolution into a lost commit, and a later amend corrupts its neighbour.
- Scripts written for a plain clone assume `.git/` is a directory.

## Why agents fall for it
- "It's generated, just regenerate it" is right in principle, but the file's schema changed between stack layers.
- In a rebase, `--ours` reads as "my branch".
- `git commit --amend` right after a restack assumes HEAD is the commit you just made.

## Current state
- Fixed at the tool level: `bin/merge-kondo-ratchets` now exists (`/Users/christruter/workspace/metabase/metabase/bin/merge-kondo-ratchets`). It reads index stages and lets mage merge the maps, and it refuses modify/delete ("was deleted on one side and changed on the other; resolve it by hand"). Project CLAUDE.md "Ratchets" section: "If either ratchet file conflicts, run `./bin/merge-kondo-ratchets`." Post-merge shrink automation now owns reductions, so feature branches no longer commit budget regenerations.
- Memory documents a git-spice silent drop (`reference_spice_stale_base_hash_silent_drop.md`) and the worktree git-replay trap, but not "--ours in rebase empties the commit, then amend hits the previous one". There is also a separate papercut `chris.claude.agent-amends-pushed-commits.md`.

## Suggested fix
- Register `bin/merge-kondo-ratchets` as a git merge driver in `.gitattributes` (`.clj-kondo/ratchets.edn merge=kondo-ratchets`) so rebases never stop on it.
- Memory note: "During rebase/restack, `--ours` = the branch being rebased onto. After a restack, never `--amend` without checking `git log -1` is the commit you expect. Prefer a fresh commit."
- In scripts, use `git rev-parse --git-path rebase-merge` rather than `.git/rebase-merge`.

## Detection signal
- Many consecutive `CONFLICT (content): Merge conflict in .clj-kondo/ratchets.edn` lines in one rebase.
- `git checkout --ours <file>` during `rebase`/`gs ... continue`, followed within a few calls by `commit --amend`.
- A shell loop testing `-d .git/rebase-merge` inside a `metabase.*` worktree path.
- An amend whose output subject differs from the regen message the agent intended.

## Raw excerpts
```
k2 L229 [RESULT] REBASE_DONE
k2 L233 [RESULT] ## HEAD (no branch)
UU .clj-kondo/ratchets.edn
/Users/christruter/workspace/metabase/metabase/.git/worktrees/metabase.kondo-ratchets/rebase-merge
```
```
k3 L703 9f0fb3088dc kondo-ignore-map-syntax@{0}: commit (amend): Use the mdb.env alias in app-db-as-data-warehouse
5c2996c1e31 kondo-ignore-map-syntax@{1}: rebase (finish): refs/heads/kondo-ignore-map-syntax onto c433278e066...
15ef162bcd4 kondo-ignore-map-syntax@{2}: commit: Regenerate kondo ignore budgets after restacking onto master
```
```
k2 L391 [ASSISTANT] The restack silently widened the exemption set — master added unjustified ignores for two linters this PR had fully justified.
```
