---
title: restack-branches --onto-trunk uses the local trunk ref, so a stale local master reports "Already restacked" / restacks onto an old base
slug: restack-branches-stale-local-trunk
kind: tool-quirk
impact: wasted-time
severity: medium
status: open
area: ~/bin/restack-branches (dotfiles), git-spice trunk
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-transform-native-perms/608c9180-d7db-4302-b960-7c77624e1415.jsonl
    lines: 125-145, 210
    date: 2026-09-01
    jev: {self_inflicted_bug: 0.92, tool_misuse: 0.91, misleading_signal: 0.91, user_correction: 0.16, codebase_trap: 0.71, flailing: 0.38, env_friction: 0.94}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 29-55
    date: 2026-09-07
    jev: {not flagged; context only}
---
## Summary
After the bottom PR of a stack merged, the agent asked `restack-branches --branch ... --onto-trunk
--dry-run` what to do. It answered "Already restacked -- every branch sits on its base." The user
had asked to fetch; `git fetch origin master` updates `origin/master`/`FETCH_HEAD` but not the local
`master` branch that git-spice treats as trunk (40+ commits stale at 1e78c18 vs 39ad1d5). Only after a
manual ancestry check did the agent `git merge --ff-only origin/master` in the main checkout and get a
real plan. In the other session the agent pre-empted this by ff-merging master first (L46-51), which
shows the step is required knowledge.

## Symptom
```
L126 [TOOL Bash] ~/bin/restack-branches --branch beguild-30-config-tests --onto-trunk --dry-run
L127 [RESULT] Already restacked -- every branch sits on its base.
L131 [RESULT] === beguild-30-config-tests
  master ancestor? NO
  merge-base w/ master: 1e78c186c0c
--- origin/master: 39ad1d51675
--- local master: 1e78c186c0c
L134 [ASSISTANT] Local trunk `master` is stale (1e78c186c0c vs origin 39ad1d51675) -- that's why it reported "already restacked". Updating trunk first.
```

## Timeline
- L98: `git fetch origin master -q` (updates origin/master only).
- L126-127: dry run says nothing to do.
- L130-131: agent checks ancestry vs origin/master -> NO for all three.
- L135: `git merge --ff-only origin/master` in the main checkout (master is checked out there).
- L144-145: dry run now plans 3 restacks.

## Root cause
git-spice's trunk is the local `master` branch. In a multi-worktree layout, local `master` is checked
out in the main checkout and only moves when someone ff-merges it there; `git fetch` never moves it.
restack-branches reads the same local ref and does not compare it with `origin/master` or warn.

## Why agents fall for it
"Fetch first" is satisfied by `git fetch`, and the tool gives a confident, success-shaped answer.

## Current state
Open: `grep -n "fetch\|stale\|origin/" ~/bin/restack-branches` finds no staleness check (only
`--onto-trunk` handling at lines ~150-234). Memory `reference_restack_branches_tool.md` notes
"A moved trunk is not a restack (git-spice agrees); `--onto-trunk` opts in" but not the stale-local-trunk
trap. Global CLAUDE.md git-spice section doesn't mention it.

## Suggested fix
restack-branches: when `--onto-trunk`, compare `trunk` with `origin/<trunk>` (or `@{upstream}`); if
behind, print "local master is N behind origin/master; run `git -C <main-wt> merge --ff-only origin/master`"
and exit nonzero (or do the ff itself when the main worktree is clean). Alternatively `git-spice repo sync`.

## Detection signal
"Already restacked" / "does not need to be restacked" output while `git rev-list --count master..origin/master` > 0.

## Raw excerpts
See Symptom.

## Additional occurrence (plain `git-spice branch restack`, not restack-branches)
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-boost-metabot-library-selection/1dece064-f6c3-42cc-b09d-dc78ef3603ff.jsonl
  lines: 821-862
  date: ~2026-09-16
  jev: {self_inflicted_bug: 0.95, tool_misuse: 0.87, misleading_signal: 0.75, user_correction: 0.86, codebase_trap: 0.76, flailing: 0.44, env_friction: 0.90}

The agent ran `git fetch -q origin master` and then `git-spice branch restack`. Its own pre-check printed that local and origin master differed, but it restacked anyway.
The rebase conflicted, and only then did the agent notice that git-spice had restacked onto *local* `master`, which was 21 commits behind and checked out in the main worktree.
```
L829 [RESULT] master local vs origin: ba327647bc9 9b59d17d105
before: 5 commits, base-relative 5
FTL Could not apply 3e0484a2a84... # Surface measures and segments in Metabot search
after: 3 commits
L836 [ASSISTANT] Rebase stopped with conflicts on the first folded commit ... Also, git-spice restacked onto the local master, which is behind origin.
L850 ---MASTER
/Users/christruter/workspace/metabase/metabase   ba327647bc9 [master]
      21
```
Local `master` cannot be fast-forwarded with `git fetch origin master:master` while another worktree has it checked out, so "fetch then restack" in a linked worktree leaves the trunk stale. `gs repo sync` handles this when run from the worktree that holds master.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
  lines: 848-873
  date: 2026-08-29
  jev: {context for chunk 4 (1286-1610): self_inflicted_bug 0.97, tool_misuse 0.93, misleading_signal 0.60, codebase_trap 0.82, env_friction 0.70}
- **A different cause from the one above: local trunk was current.** L849: `behind: 0` (local master == origin/master 1e78c186c0c). L853 `~/bin/restack-branches --dry-run` (no `--onto-trunk`) → `Already restacked -- every branch sits on its base.` L863-864: `foundation is NOT on current master ... master ahead by: 370`, and `git-spice log short` on the same screen shows `pr/01-foundation ... (needs restack)`. The two tools disagree on the same stack. L867 ASSISTANT: "`restack-branches --dry-run` says 'already restacked' while foundation sits 370 commits behind master — it only checks branch-on-base within the stack, not trunk drift. I'll drive this by hand rather than trust it."
- By design (`restack-branches` line ~153: bottom-vs-trunk is checked only with `--onto-trunk`), but the message "every branch sits on its base" is literally false for the bottom branch whose base is trunk. Suggested wording when `--onto-trunk` is absent and the bottom branch is behind trunk: "Stack is internally restacked; bottom branch pr/01-foundation is 370 commits behind master (pass --onto-trunk to move it)."
- Later in the same session (L1766-1767) `git-spice upstack restack` skipped both worktree-held upstack branches with `WRN ... checked out in another worktree ... skipping` and exited 0. The agent caught it from the WRN lines, as the global CLAUDE.md warns.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl (deleted; reconstructed from redacted chunks)
  lines: 120-135
  date: 2026-08-21
  jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-aee7cc11cc58331de.jsonl (deleted; reconstructed from redacted chunks)
  lines: 5-9
  date: 2026-08-21
  jev: {subagent; scores not in batch}

The same stale-local-`master` root cause, hit with plain git and no restack tool. Both the /code-review orchestrator (L5
`git log --oneline master..HEAD && git diff master...HEAD --stat`, 125.8KB of output) and the main agent (L120 `git log --oneline master..HEAD && git diff master --stat`,
133KB; "1865 files changed, 726498 insertions(+)") diffed against local `master`, which was far behind. The main agent then tried
`git diff origin/master --stat`, which listed 18 files including master's own newer changes (the two-dot form includes them), and finally
`git merge-base HEAD origin/master` -> `72b3d9c2712` (L134). The orchestrator also fell back to the explicit merge-base (L8). The next
session's agent made the same `master..HEAD` call again (f6535e97 L24, L91: 115KB), then used the merge-base (L101).
