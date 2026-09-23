---
title: Before opening a stacked PR, the agent checked its local base branch against `origin/<base>` without fetching it, compared a stale ref with itself, and opened a PR that showed 19 unrelated commits
slug: base-check-against-unfetched-remote-ref
kind: agent-behaviour
impact: both
severity: medium
status: open
area: git remote-tracking refs, stacked PR base branches, `git rev-parse <base> origin/<base>`, `git push --force-with-lease`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fe770c34-018c-4571-bd0b-44d398fcfbc8.jsonl
    lines: 624-819
    date: 2026-09-01
    jev: {any_papercut: 0.91, env_toolchain: 0.52, stale_state: 0.96, verify_mismatch: 0.60, misleading_code: 0.18, hidden_coupling: 0.84, stale_docs: 0.32, tool_footgun: 0.77, flaky: 0.35, agent_bug: 0.93, wasted_effort: 0.68, user_correction: 0.12}
---
## Summary
The agent created a worktree for a new stacked PR from the local copy of the stack's top branch. Its guard was `git rev-parse <base> origin/<base> | uniq -c`, which printed `2 3568a47` (identical) because the remote-tracking ref had not been fetched since the base moved: earlier that morning the user had merged two stack PRs and the base branch had been rebased onto master on GitHub (070dd55). The new PR opened against the moved base and showed 19 commits and 18 files instead of 1 commit and 2 files. Fixing it took a reset, a cherry-pick with two conflicts, a re-test and a force-push of the already-pushed branch.

## Symptom
L686 `2 3568a47...` then a successful push; L704 the PR shows `+489 -34 in 18` files; L722-L723 the remote base tip is `070dd55`, not 3568a47; the user asks why the stacked PR has 19 commits; L758 the agent confirms it compared the local branch with an unfetched `origin/<base>`, so both sides of the check were the same stale ref.

## Timeline
- 09:21:08 L624-L625 first check against a remote named `metabase`, which does not exist; worktree created from the local branch.
- 09:27:09 L668-L674 push to `metabase` fails; the remotes are `fork` and `origin`.
- 09:28:11 L679-L686 `git rev-parse <base> origin/<base> | uniq -c` prints `2 3568a47`; push; L699 draft PR opened.
- L703-L723 PR shows 18 files; remote base is 070dd55.
- 09:30:02 the user asks why the new stacked PR has 19 commits.
- 09:30-09:32 L758-L819 reset to the fetched base, cherry-pick, resolve two conflicts, re-run kondo and tests, `git push --force-with-lease`.
- Cost: a visibly broken PR for several minutes, about 25 tool calls, and a force-push of a pushed branch.

## Root cause
Remote-tracking refs move only on fetch, so comparing a local branch with its remote-tracking ref only proves they matched at the last fetch.

## Why agents fall for it
`origin/<branch>` reads as 'what GitHub has now', and the check prints a reassuring count of 2.

## Current state
Not checked.

## Suggested fix
- Compare against `git ls-remote origin <base>` or fetch the base branch explicitly before branching.
- Before `gh pr create`, compare `git rev-list --count origin/<base>..HEAD` (after a fetch) with the commit count the PR shows, and stop on a mismatch.

## Detection signal
`git rev-parse X origin/X` without a preceding `git fetch ... X` in the session; a PR whose commit count is far above the local `rev-list` count right after creation.

## Raw excerpts
```
L624 [CALL] cd ~/src/mb/metabase && git rev-parse <base> metabase/<base> 2>/dev/null | uniq -c; git worktree add ~/src/mb/wt/<new-branch> -b <new-branch> <base> 2>&1 | tail -3
L625 [RESULT]    1 3568a47e59599fa69da37e460dcce9043543bb68    1 metabase/<base> Preparing worktree (new branch '<new-branch>') ...
L679 [CALL] cd ~/src/mb/wt/<new-branch> && git rev-parse <base> origin/<base> | uniq -c; git push -u origin <new-branch> 2>&1 | tail -6
L686 [RESULT]    2 3568a47e59599fa69da37e460dcce9043543bb68 remote: Create a pull request for '<new-branch>' on GitHub ...
L704 [RESULT] {"base":"<base>","diff":"+489 -34 in 18","draft":true,"head":"<new-branch>",...}
L723 [RESULT] {"base_ref":"<base>","base_sha":"070dd55cb431d9cdd980e36875c60ab8691af06e","files":18,"head_sha":"4e6ffb6...","mergeable_state":"dirty"} === remote base tip === 070dd55cb431d9cdd980e36875c60ab8691af06e	refs/heads/<base>
L759 [CALL] cd ~/src/mb/wt/<new-branch> && git merge --abort && git log --oneline -1 && git reset --hard origin/<base> 2>&1 | tail -2 && git cherry-pick 4e6ffb6ea26 2>&1 | tail -5
L818 [CALL] ... git push --force-with-lease=<new-branch>:4e6ffb6... origin <new-branch> ...
L819 [RESULT] + 4e6ffb6ea26...69711d6ab0d <new-branch> -> <new-branch> (forced update) {"base":"<base>","commits":1,"diff":"+42 -33","files":2,...}
```
