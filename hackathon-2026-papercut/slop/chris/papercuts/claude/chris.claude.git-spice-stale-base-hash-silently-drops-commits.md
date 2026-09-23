---
title: git-spice restack replays zero commits (exit 0) when a branch's recorded base hash is stale, collapsing it onto its base
slug: git-spice-stale-base-hash-silently-drops-commits
kind: tool-quirk
impact: both
severity: high
status: documented-still-hit
area: git-spice (branch base.hash in refs/spice/data), ~/bin/restack-branches
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-transform-native-perms/608c9180-d7db-4302-b960-7c77624e1415.jsonl
    lines: 148-212
    date: 2026-09-01
    jev: {self_inflicted_bug: 0.92, tool_misuse: 0.91, misleading_signal: 0.91, user_correction: 0.16, codebase_trap: 0.71, flailing: 0.38, env_friction: 0.94}
---
## Summary
Restacking the three-branch BEGUILD-30 stack after the bottom PR merged, `restack-branches` (which
calls `gs branch restack` in each branch's worktree) reported all three "restacked", with no conflicts.
The top branch `kondo-ratchets-merge-script` had lost all 17 of its commits. It now pointed at the same
SHA as `beguild-30-ratchet-policy`. The cause was earlier: a stray `git merge
origin/kondo-ratchets-merge-script` in the ratchet-policy worktree fast-forwarded that branch to the
upstack tip, and it was later reset. git-spice had recorded `904a527` (the upstack branch's own tip) as
that branch's base hash. `rebase --onto <new base> <recorded base hash>` then had an empty range. It
replayed nothing, moved the branch onto its base, and exited 0. The agent caught this only because it
had captured per-branch commit counts before the restack.

## Symptom
```
L158 [RESULT] beguild-30-ratchet-policy        d4c4bca96cd on-master
kondo-ratchets-merge-script      d4c4bca96cd on-master
--- commit counts (expect 29 / 43 / 17) ---
config-tests:   29
ratchet-policy: 42
merge-script:   0
L167 [ASSISTANT] Something's wrong — the top two branches are at the same SHA and `kondo-ratchets-merge-script` lost its 17 commits. Not pushing.
L169 [RESULT] === reflog: kondo-ratchets-merge-script ===
d4c4bca96cd kondo-ratchets-merge-script@{0}: rebase (finish): refs/heads/kondo-ratchets-merge-script onto d4c4bca96cd...
904a52793ff kondo-ratchets-merge-script@{1}: rebase (finish): ... onto 500e92444a5...
```

## Timeline
- L148-149: agent records pre-restack tips and commit lists (29/43/17) into its scratchpad.
- L153-154: `restack-branches --branch beguild-30-config-tests --onto-trunk` reports all 3 restacked, "Push when ready".
- L157-158: count check gives 29/42/0, and two branches share a SHA.
- L168-177: the reflog shows the earlier bad fast-forward and the stale base hash. The 43 vs 42 was a miscount.
- L178-185: `reset --hard 904a52793ff` in the branch's worktree, then `rebase --onto d4c4bca96cd 500e92444a5`. 17/17 commits replayed.
- L188-199: ancestry and content verified, then pushed with explicit `--force-with-lease=<branch>:<sha>`.
- L211-212: memory written (`reference_spice_stale_base_hash_silent_drop.md`).

## Root cause
git-spice rebases from its stored `base.hash`, not from the merge-base with the base branch. It does not
check that hash for sanity, such as "base hash equals my own tip" or "base hash is not an ancestor of
my commits' first parent". An empty rebase counts as success.

## Why agents fall for it
The tool says "restacked" and suggests the push commands. Without pre-captured counts, the next step is
`git push --force-with-lease`, and that would have destroyed 17 commits on the open PR (#81341).

## Current state
Documented after this hit in auto-memory `reference_spice_stale_base_hash_silent_drop.md` and indexed in
MEMORY.md ("Spice stale base hash drops commits — count commits before pushing"). The global CLAUDE.md
git-spice section does not mention it. `~/bin/restack-branches` has no post-restack count or empty-range
guard. The memory `reference_restack_branches_tool.md` says "git-spice decides 'needs restack' from
ancestry, not its recorded `base.hash`". That holds for the *decision* but not for the rebase range, so it
reads as reassurance.

## Suggested fix
- In restack-branches, record `rev-list --count base..branch` before each branch and refuse to report
  success, or roll back to the reflog, if a nonzero count became 0. Also refuse if two stack branches end on the same SHA.
- In restack-branches, before restacking, check that the recorded base hash (`refs/spice/data`) is an
  ancestor of the branch and not equal to its tip. If it fails, pass the real old base tip to a manual `rebase --onto`.
- Report upstream to git-spice: warn when the recorded base hash equals the branch head.

## Detection signal
After a restack or rebase, two adjacent stack branches resolve to the same SHA, or a branch's
`rev-list --count base..branch` drops to 0. Also a reflog line `rebase (finish): ... onto X` where X equals the previous tip of the base.

## Raw excerpts
```
L210 [ASSISTANT] ... the automated restack silently dropped all 17 commits from `kondo-ratchets-merge-script`, leaving it pointing at the same SHA as `beguild-30-ratchet-policy`. Cause was pre-existing, not the rebase: git-spice ... `fast-forward` into `beguild-30-ratchet-policy` that's still visible in the reflog. Rebasing with upstream == your own tip replays nothing, and it exits 0.
```

## Additional occurrence (the origin of the stale base hash)
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
  lines: 965-1043
  date: 2026-08-31
  jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.75, user_correction: 0.70, codebase_trap: 0.71, flailing: 0.34, env_friction: 0.79}

This is the session that created the stray fast-forward described above. L965:
`cd .../metabase.beguild-30-ratchet-policy && git merge --ff-only origin/beguild-30-ratchet-policy ...; git merge --ff-only origin/kondo-ratchets-merge-script`
ran the second merge in the ratchet-policy worktree (the `cd` applied to the whole compound command; see
`bash-cwd-persists-in-scratchpad-but-resets-in-worktrees`). `git-spice log short` then showed
`beguild-30-ratchet-policy (#81319) (needs push)`. L981: `git reset --hard origin/beguild-30-ratchet-policy` restored the
branch, and `restack-branches` said "Already restacked -- every branch sits on its base" (L985), but
`git-spice log short` kept printing `kondo-ratchets-merge-script (#81341) (needs restack)`. The agent verified ancestry
(`git merge-base --is-ancestor 500e92444a5 904a52793ff` -> contains, L989) and told the user twice that "needs restack"
was "stale bookkeeping from your pushes, not real divergence ... Don't let it talk you into a rebase" (L1005, L1017,
L1043). It misattributed the cause to the user's external pushes; the real cause was its own ff-merge poisoning the
recorded base hash, which is what later made `restack-branches` silently drop 17 commits (the 2026-09-01 occurrence
above). A "needs restack" flag that persists when `merge-base --is-ancestor` says the branch already contains its base
is the early detection signal for this trap: check `git-spice`'s recorded base hash (refs/spice/data) at that point
instead of dismissing it.
