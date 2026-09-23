---
title: Rebasing a branch that merged master in silently drops edits that lived only in the merge commit's conflict resolution
slug: git-rebase-drops-merge-commit-resolutions
kind: tool-quirk
impact: introduced-bug
severity: medium
status: open
area: git rebase (default drops merges), rebasing other people's PR branches
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/40cd8c33-43d3-4e2e-8088-d99acee7a38f.jsonl
    lines: 244-381
    date: 2026-09-08
    jev: {self_inflicted_bug: 0.67, tool_misuse: 0.91, misleading_signal: 0.73, user_correction: 0.93, codebase_trap: 0.69, flailing: 0.38, env_friction: 0.82}
---
## Summary
The agent rebased four of Ben Grabow's "explicit hierarchy" PR branches onto master. Two branches "went from 2 commits to 1" because `git rebase` drops merge commits (correct for those). On `bgrabow/explicit-auth-identity-provider-hierarchy`, Ben had made a real edit (a comment tweak `(derive ...)` -> `(derive! ...)` in `enterprise/backend/src/metabase_enterprise/mfa/init.clj`) inside a merge commit's conflict resolution ("evil merge"). The rebase replayed only the non-merge commits, so the edit vanished with no conflict or warning. The agent caught it only because it compared the rebased tree's file list against the original PR diff and noticed "One file dropped out".

## Symptom
`git diff --stat origin/master HEAD` on the rebased branch showed 21 files; the original PR touched 22. `mfa/init.clj` was missing.

## Timeline
- L253: "Domain-entity and user-key-value rebased, but each went from 2 commits to 1 — let me verify no content was lost" -> L258 "the second 'commit' was a merge commit, correctly dropped."
- L260: auth-identity branch history: `17b0b6d96fd Merge master`, `cac28f9f71d Merge branch 'master' into ...`, plus three real commits.
- L331: rebased branch net diff: `21 files changed`.
- L334: "One file dropped out vs the original diff — let me check `mfa/init.clj`."
- L336: master and rebased show `(derive :provider/totp ...)`; the original branch tip shows `(derive! ...)`.
- L344: "Rebase dropped that because it lived in a merge-commit resolution, not in a real commit."
- L359-365: a first completeness check "silently failed" (zsh `$H:e` modifier, see `zsh-and-bsd-shell-quirks`); redone with `comm -12` over file lists: three differing files, two were master drift, one real loss.
- L380-381: restored via `--fixup` + `rebase --autosquash`.

## Root cause
`git rebase` (without `--rebase-merges`) linearizes by replaying each non-merge commit's patch. Changes introduced by the merge commit itself (beyond combining parents) have no patch to replay. Nothing warns.

## Why agents fall for it
A rebase that completes without conflicts looks lossless. "Merge commit correctly dropped" is true for most merges, which trains the assumption. The loss is typically small (a comment, a require) and inside a file the branch already touches, so a diffstat eyeball misses it.

## Current state
Git behaviour; nothing in CLAUDE.md, the stack-topology-rework skill, or memory covers it. The pr-rereview skill and the global CLAUDE.md discuss rebases but not evil merges.

## Suggested fix
- Checklist item in the stack-topology-rework / rebase guidance: before rebasing a branch containing merges, compute `git diff <merge>^1 <merge>` minus the second parent's contribution, or simply compare `git diff <old-tip> <new-tip> -- $(git diff --name-only <old-merge-base> <old-tip>)` after rebasing and explain every hunk.
- A small `~/bin` script: `verify-rebase <old-tip> <new-tip>` that lists PR files whose content differs between the two tips beyond master drift (the agent hand-built this at L364).

## Detection signal
- `git log --merges <base>..<branch>` non-empty before a `git rebase` without `--rebase-merges`.
- Post-rebase: `git diff --stat` file count differs from the original PR's `gh pr view --json files` count.

## Raw excerpts
```
L336 === master version ===
   ;; verification carries the (derive :provider/totp ...) that AuthIdentity validation needs;
   === original branch version ===
   ;; verification carries the (derive! :provider/totp ...) that AuthIdentity validation needs;
L344 [ASSISTANT] Rebase dropped that because it lived in a merge-commit resolution, not in a real commit. Let me check whether the merges carried anything else.
L365 --- intersection (PR files that differ between old tip and rebased) ---
   .clj-kondo/config/modules/config.edn
   enterprise/backend/src/metabase_enterprise/mfa/init.clj
   enterprise/backend/test/metabase_enterprise/sso/integrations/oidc_test.clj
L379 [ASSISTANT] Both of those are master drift, correctly absorbed. Only `mfa/init.clj` was a real loss.
```
