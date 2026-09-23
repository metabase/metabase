---
title: After squash merges, "is this backup tag or branch superseded?" can't be answered by ancestry or merge-tree; the agent first recommended deleting 62 backup tags it had not verified
slug: superseded-check-after-squash-merge
kind: misleading-signal
impact: both
severity: medium
status: open
area: git (squash-merge repos: metabase/evals, metabase/metabase), backup tags / local branches cleanup
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/21d274f9-f9ed-4e3b-bc30-0e93b1f76768.jsonl
    lines: 384-900
    date: 2026-09-14
    jev: {self_inflicted_bug: 0.88, tool_misuse: 0.95, misleading_signal: 0.84, user_correction: 0.86, codebase_trap: 0.51, flailing: 0.72, env_friction: 0.96}
---
## Summary
While rebasing and landing a stack of goldens PRs as squash merges, the agent kept old tips as local
`backup/...` tags (62 in total). In its wrap-up (L794) it listed "Backup tags ... Delete them with
`git tag -l 'backup/*' | xargs git tag -d`" as a loose end. The user asked "do you know that the backups
have been superseded for sure?" The agent admitted it did not. It then ran three checks, and two of them
gave false signals:
1. A tree/ancestry loop (L801). It broke on zsh word splitting and printed `TREE-DIFF NOT-IN-MAIN` for every merged PR.
2. An in-memory `merge-tree` of each tag into main (L817). It reported `54 CONFLICT, 1 EXTRA, 7 SUPERSEDED`. That is expected after squash merges and later PRs that rewrote the same lines, so it proved nothing (L830).
3. The check that worked (L831-848): fetch all 119 merged PR heads as `refs/prhead/*`, compute `git patch-id --stable` for every commit on main and on those heads, and match each tag's commits by patch-id, then by subject. Result: 41 LANDED, 18 LANDED~ (same subject, small diff), 3 UNIQUE. One of the UNIQUE tags (`backup/pr-113-clickhouse-tooling`, 12 commits) held ClickHouse work that is on no branch and in no PR. The blanket delete would have lost it.

## Symptom
```
L794 [ASSISTANT] **Backup tags:** the `backup/strand-fix*/` and `backup/land/` tags are still in your local repo. Delete them with `git tag -l 'backup/*' | xargs git tag -d`.
L796 [USER] do you know that the backups have been superseded for sure?
L800 [ASSISTANT] Not with certainty yet. I checked the rebases as I went, but never compared each backup against what actually landed on main.
L819 [RESULT]   54 CONFLICT / 1 EXTRA / 7 SUPERSEDED
L836 [RESULT]   41 LANDED / 18 LANDED~ / 3 UNIQUE
L900 ... **1 has real** [work not on main] ... `backup/pr-113-clickhouse-tooling` ... keep it. Its 12 ClickHouse fixture commits aren't on main.
```

## Timeline
- L384 landing summary: "Old tips are tagged locally under `backup/`."
- L794 suggests deleting all backups.
- L796 user challenge.
- L801-811 first check fails silently (zsh; see `zsh-and-bsd-shell-quirks`).
- L817-830 merge-tree check: 54 false CONFLICTs.
- L831-900 patch-id against all merged PR heads: the correct method. It found 3 tags with unique work.
- L903-1025 the same method applied to local branches and worktrees. Only branches with every commit accounted for were deleted.

## Root cause
With squash merges, a branch's commits never reach main by identity. `merge-base --is-ancestor`, `git
branch --merged` and `git cherry` against main all say "not merged". A merge-tree against main
conflicts wherever later PRs touched the same lines. The squash commit's patch is the *sum* of the PR,
so per-commit patch-ids match only the final PR-head commits (`refs/pull/N/head`), not main.

## Why agents fall for it
- "I rebased them carefully, and the PRs merged" feels like proof.
- The cheap checks exist and return a confident-looking answer (all "not merged" or all "conflict"). The agent either ignores them or over-trusts them.
- Fetching `refs/pull/*/head` for every merged PR is non-obvious.

## Current state
Not documented in any CLAUDE.md, skill or memory. The global CLAUDE.md covers git replay and git-spice,
not squash-merge provenance.

## Suggested fix
- A `~/bin` helper (e.g. `landed-check <ref>...`) that fetches merged PR heads and classifies each commit of each ref as LANDED / LANDED~ / UNIQUE by patch-id, then subject. The transcript's `classify.sh` is a working prototype.
- Memory or CLAUDE note: "In squash-merge repos, never delete a backup/branch on ancestry or merge-tree evidence; use patch-id against `refs/pull/*/head`."
- Agent habit: when you create backup tags, do not recommend deleting them in the same breath. Recommend it only after the landed-check.

## Detection signal
- An agent suggests `git tag -d` / `git branch -D` on many refs, with no patch-id or PR-head comparison in the preceding calls.
- `git merge-tree` / `--is-ancestor` used as the supersession test in a repo whose PRs are squash-merged (`gh pr view --json mergeCommit` has one parent).

## Raw excerpts
```
L817 [TOOL Bash] ... cat > $S/superseded.sh <<'EOF'
# usage: superseded.sh <ref>... ; prints: SUPERSEDED | EXTRA(<files>) | CONFLICT(<files>)
L819 [RESULT]   54 CONFLICT
   1 EXTRA
   7 SUPERSEDED
CONFLICT backup/arr-prerequisite-20260910/bot-2129-library-curation: docs/definitions.md docs/golden-nlq-semantics.md stats/build.py ...
L830 [THINKING] The backup conflicts are expected since later PRs rewrote the same content, so this test doesn't prove anything about lost work. Instead, I'll compare commits directly between each backup/local branch and the merged PRs.
L831 [TOOL Bash] ... gh pr list --state merged --limit 300 --json number --jq '.[].number' > $S/merged-nums.txt; ... git fetch -q origin $(sed 's#.*#+refs/pull/&/head:refs/prhead/&#' $S/merged-nums.txt)
L835 [TOOL Bash] ... git log -p --format='commit %H' origin/main $(git for-each-ref --format='%(refname)' refs/prhead) | git patch-id --stable | cut -d' ' -f1 | sort -u > $S/landed-pids.txt ...
L836 [RESULT]  41 LANDED / 18 LANDED~ / 3 UNIQUE
```
