---
title: Bash tool cwd resets after `cd` into a repo worktree but persists after `cd` into the scratchpad, so the next relative git command runs in the wrong place
slug: bash-cwd-persists-in-scratchpad-but-resets-in-worktrees
kind: env-friction
impact: both
severity: medium
status: open
area: Claude Code Bash tool cwd handling (allowed working dirs vs. others)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
    lines: 555-572
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.96, misleading_signal: 0.51, user_correction: 0.79, codebase_trap: 0.69, flailing: 0.46, env_friction: 0.76}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
    lines: 612-628
    date: 2026-09-10
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.93, misleading_signal: 0.58, user_correction: 0.95, codebase_trap: 0.74, flailing: 0.70, env_friction: 0.93}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
    lines: 965-982
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.75, user_correction: 0.70, codebase_trap: 0.71, flailing: 0.34, env_friction: 0.79}
---
## Summary
The Bash tool resets cwd to the session's project directory after a command that `cd`s into another repo worktree ("Shell cwd was reset to ..."). It does **not** reset after a `cd` into the session scratchpad (an allowed working dir). Agents learn from dozens of "cwd was reset" lines that `cd` never sticks, then run a bare `git add`/`git diff` after a scratchpad `cd` and it executes in the scratch directory. The reverse also bites: in a compound command the `cd` does apply to every later part of the same command, so chaining two worktrees' operations after one `cd` runs both in the first worktree.

## Symptom
- a0ba828b L555: `set -e; T=.../scratchpad/stagetest; ...; cd "$T"; git init ...` (a throwaway repo to check `git ls-files --stage --unmerged`). No reset line followed. L559: `git add mage/test/mage/merge_kondo_ratchets_test.clj && git commit ...` -> `fatal: pathspec 'mage/test/mage/merge_kondo_ratchets_test.clj' did not match any files` (running inside the scratch repo). L568 agent re-`cd`s explicitly; L572 succeeds.
- 7a939669 L612: `cd .../scratchpad && clojure -M -e ...`. L615: `git diff $(git merge-base master HEAD) HEAD -- ...` -> `fatal: not a git repository (or any of the parent directories): .git` plus a `git diff --no-index` usage dump. L628: "Fixing my path issue by using `git -C` with absolute paths going forward."
- a0ba828b L965 (same-command variant): `cd .../metabase.beguild-30-ratchet-policy && git merge --ff-only origin/beguild-30-ratchet-policy ...; git merge --ff-only origin/kondo-ratchets-merge-script` — the second merge was meant for the session's own worktree but ran in the `cd` target, fast-forwarding `beguild-30-ratchet-policy` onto the top-of-stack branch (8 foreign commits, L978). Repaired with `git reset --hard origin/beguild-30-ratchet-policy` (L981). L1005: "I chained two `merge --ff-only` calls in one command without checking which worktree each belonged to."

## Root cause
Harness behaviour: cwd changes persist only inside allowed working directories (project dir, scratchpad, additional dirs); outside them the harness restores cwd and prints a notice. The notice appears for worktree `cd`s (sibling directories like `metabase.beguild-30-ratchet-policy`) but not for scratchpad `cd`s, so the model's learned rule "cd never sticks" is wrong exactly when it wanders into a scratch repo.

## Why agents fall for it
Consistent reinforcement from the reset notices; the exception is silent. Stacked-PR work across several sibling worktrees means agents constantly switch dirs.

## Current state
Harness behaviour unchanged as far as visible (same pattern in both sessions, weeks apart). Not documented in CLAUDE.md or memory. The Bash tool description says "Working directory persists between calls" and recommends absolute paths, which doesn't mention the reset-outside-allowed-dirs exception.

## Suggested fix
- Global CLAUDE.md: "Always use `git -C <abs path>`; never rely on cwd after a `cd`, in either direction."
- Harness: print "Shell cwd is now <dir>" whenever a command leaves cwd different from where it started, or reset uniformly.
- For destructive git (merge, reset, rebase, commit), a PreToolUse hook that requires `-C` or an explicit `cd` in the same command.

## Detection signal
- A bare `git` command whose previous Bash call contained `cd <scratchpad path>` without a trailing reset notice.
- Results `fatal: not a git repository` / `pathspec ... did not match any files` right after a scratchpad `cd`.
- Two different branch names operated on after a single `cd` in one compound command.

## Raw excerpts
```
a0ba828b L555 set -e
   T=/private/tmp/claude-501/.../scratchpad/stagetest
   rm -rf "$T"; mkdir -p ...; cd "$T"
   git init -q -b main .; ...
L556 [RESULT] --- porcelain status --- DU .clj-kondo/ratchets.edn ...        (no "Shell cwd was reset")
L559 git add mage/test/mage/merge_kondo_ratchets_test.clj && git -c core.hooksPath=/dev/null commit ...
L560 [RESULT ERROR] Exit code 128  fatal: pathspec 'mage/test/mage/merge_kondo_ratchets_test.clj' did not match any files

a0ba828b L966 [RESULT] Already up to date.
               create mode 100644 mage/test/mage/merge_kondo_ratchets_test.clj
   ... beguild-30-ratchet-policy (#81319) (needs push) ◀
L976 [ASSISTANT] I just made an error — I ran the second `merge --ff-only` in the wrong worktree, merging the top branch into `beguild-30-ratchet-policy`.
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-aee7cc11cc58331de.jsonl (deleted; reconstructed from redacted chunks)
  lines: 65-67
  date: 2026-08-21
  jev: {subagent of flagged session b31b1fd7; scores not in batch}

The /code-review orchestrator subagent ran relative-path commands for ~30 turns, then got
`fatal: not a git repository (or any of the parent directories): .git` / `bfs: error: resources/migrations: No such file or directory`
(L66). Its cwd had been reset, and it re-ran with an explicit `cd /Users/christruter/workspace/metabase/metabase.80394-metabot-tennant && ...` (L67).
The finder subagents it spawned avoided this by prefixing every command with `cd <repo>`.
