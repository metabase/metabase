---
title: Agent amends and force-pushes commits already on an open PR, despite a feedback memory that says to add fixup commits
slug: agent-amends-pushed-commits
kind: agent-behaviour
impact: wasted-time
severity: medium
status: documented-still-hit
area: git workflow on review branches; memory feedback_fixup_commits.md
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-cycle-clusters/aa87adef-8b0f-46f8-bdb7-486d04e80b58.jsonl
    lines: 916-918, 1130-1133, 1265-1267
    date: 2026-09-11/12
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.69, misleading_signal: 0.84, user_correction: 0.32, codebase_trap: 0.64, flailing: 0.41, env_friction: 0.92}
---
## Summary
PR #82386 was open and under review, with roborev reviewing each sha. After each round of review fixes
the agent ran `git commit --amend` and `git push --force-with-lease` instead of adding a new commit. It
did this three times in one region: two roborev fixes (L917), a redesign the user asked for (L1131), and a
merge-classification fix (L1266). Each amend:
- rewrote the only commit, so reviewers (and roborev) could not diff just the new change;
- queued a fresh full-branch roborev review. The hook job and a manual job for the same sha ran together, and both stalled (see `roborev-list-filters-current-branch`, additional occurrence).

## Symptom
```
L916 [ASSISTANT] Needs: amend the commit with the two roborev fixes and force-push to update PR #82386 ...
L917 git -C "$REPO" commit -q --amend --no-edit ... git -C "$REPO" push -q --force-with-lease origin module-cycle-clusters
L1130 [ASSISTANT] Now amend the commit for the ratchet design and push it to the PR ...
L1266 git -C "$REPO" commit -q --amend --no-edit ...; git -C "$REPO" push -q --force-with-lease origin module-cycle-clusters && echo pushed
```

## Timeline
See summary. The user did not correct it in this region (user_correction score 0.32). The cost was
hidden in review churn and in roborev re-reviewing the whole branch every time.

Contrast: in the nested-modules session (89a35c24 L7696) the agent wrote "Committing as a follow-up,
since the previous commit is already pushed". So the rule is known and applied unevenly.

## Root cause
Agent behaviour. The rule lives in memory (`feedback_fixup_commits.md`; MEMORY.md index line "Use new
fixup commits, don't amend — once pushed, no `--amend`"). The agent framed the work as "update the PR
commit" and used a habit it knows (amend, then force-with-lease) without checking the memory.

## Why agents fall for it
- A single-commit PR feels "clean", and `--force-with-lease` feels safe.
- The memory index line is terse, and nothing checks it at the moment of the `git commit --amend`.

## Current state
Documented in `~/.claude/projects/-Users-christruter-workspace-metabase-metabase/memory/feedback_fixup_commits.md`
and in the MEMORY.md index. Still hit.

## Suggested fix
A PreToolUse hook on Bash: if the command contains `commit --amend` (or `commit -q --amend`) and
`git rev-parse @{u}` exists and HEAD is already on the upstream, warn: "HEAD is pushed; add a fixup
commit instead (feedback_fixup_commits)".

## Detection signal
`git commit --amend` followed by `push --force(-with-lease)` on a branch with an open PR, where the
amended commit was pushed before (`git branch -r --contains HEAD@{1}` is not empty).

## Raw excerpts
```
L917 [TOOL Bash] REPO=/Users/christruter/workspace/metabase/metabase.module-cycle-clusters
git -C "$REPO" add -A -- dev/src/dev/module_cycle_ratchet.clj ... .github/scripts/file-paths.unit.spec.ts
git -C "$REPO" commit -q --amend --no-edit 2>&1 ...
git -C "$REPO" push -q --force-with-lease origin module-cycle-clusters 2>&1 | tail -2; echo "pushed"
L918 [RESULT] c4d96d895a9 Name and track the cyclic clusters of the module graph
pushed
L1131 git -C "$REPO" commit -q --amend -F - <<'EOF'
Ratchet the named cyclic clusters of the module ...
L1267 [RESULT] c3276907aaa Ratchet the named cyclic clusters of the module graph
pushed
Enqueued job 5744 for c327690 (agent: codex)
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/40cd8c33-43d3-4e2e-8088-d99acee7a38f.jsonl
  lines: 1060-1063
  date: 2026-09-08
  jev: {self_inflicted_bug: 0.61, tool_misuse: 0.60, misleading_signal: 0.81, user_correction: 0.89, codebase_trap: 0.52, flailing: 0.45, env_friction: 0.92}

Worse variant: the branch was **someone else's** (Ben Grabow's `bgrabow/explicit-actions-arg-hierarchy`, PR #79464,
already approved and previously auto-merge-armed). After a docstring wording round with the user, the agent ran
`git -C $wt -c core.hooksPath=/dev/null commit -q --no-verify --amend --no-edit` and
`git push --force-with-lease=bgrabow/explicit-actions-arg-hierarchy:4e9758f93b3 origin HEAD:refs/heads/bgrabow/...`
(L1062-1063, `+ 4e9758f93b3...61a3edc9dbf (forced update)`). The pinned lease was careful, but the amend folded the
agent's wording into Ben's commit under his authorship/message and restarted CI from scratch. Earlier in the same
session (L1043) the user had rejected a commit/push tool call mid-discussion. Contrast: a0ba828b L366/L420 amended
only an unpushed commit and said so ("Amending was safe — the commit was never pushed").

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
  lines: 2182, 2667, 3075, 3283, 3328, 3566, 4069 (each followed by restack + `git-spice stack submit`)
  date: 2026-08-30
  jev (chunk 10): {self_inflicted_bug: 0.94, tool_misuse: 0.52, misleading_signal: 0.56, user_correction: 0.54, codebase_trap: 0.91, flailing: 0.36, env_friction: 0.24}
- After the OSI stack (#79978-#79981) was pushed at L2510, nearly every later review fix was `git commit --amend --no-verify --no-edit` into the branch's single commit, then force-pushed with `git-spice stack submit` (e.g. L3075 benchmarks amend + submit; L3283 foundation amend + restack + submit; L3566 "Fixed on pr/03-llm-config (amended into the branch's single commit)"). Only some fixes became new commits (L3263 "Nudge the index after the update commits", L4119 "Hint the TriggerKey"). The user didn't object in-session. The effect was that roborev re-reviewed each whole branch after every amend (the session queued and read ~40 review jobs and closed 19 superseded ones at L3444-3467), and reviewers couldn't diff just the fix.
- The first restack of this session (L1171, L1474, L1586) amended during a rebase that rewrote everything anyway. That part is defensible. The later amends on pushed, in-review PRs are not.
