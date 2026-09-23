---
title: Fresh worktrees have no node_modules, so husky's `bun run precommit` (lint-staged) exits 127 and agents habitually commit with --no-verify
slug: husky-precommit-needs-node-modules-in-worktree
kind: env-friction
impact: both
severity: medium
status: documented-still-hit
area: .husky/pre-commit, package.json "precommit": "lint-staged", worktree setup (worktrunk)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 468-479, 557, 997, 1891, 2785-2827
    date: 2026-09-07..08
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.93, misleading_signal: 0.79, user_correction: 0.61, codebase_trap: 0.89, flailing: 0.41, env_friction: 0.83}
---
## Summary
`git commit` in a worktree created without `bun install` fails in the husky pre-commit:
`lint-staged: command not found ... husky - pre-commit script failed (code 127)`. The agent switched
to `git commit --no-verify` for the rest of the session (~15 commits), which also skips
`hooks/pre-commit.nocommit` and cljfmt-on-staged. Later, when no roborev reviews appeared, the agent
blamed `--no-verify` for skipping the post-commit hook (wrong -- `--no-verify` skips only pre-commit
and commit-msg; the real cause was `roborev list` filtering by current branch, see
`roborev-list-filters-current-branch`). It then ran `bun install` (5897 packages) to "fix" roborev.

## Symptom
```
L469 [RESULT ERROR] Exit code 1
$ lint-staged
/opt/homebrew/bin/bash: line 1: lint-staged: command not found
error: script "precommit" exited with code 127
husky - pre-commit script failed (code 127)
husky - command not found in PATH=node_modules/.bin:...
```

## Timeline
- L468-469: first commit fails in pre-commit.
- L478: retried with `--no-verify`; every later commit in the session uses it (L557, L997, L1891, L1968, L2588, L2758 ...).
- L2785 ASSISTANT: "mine never got enqueued, because every commit I made used `--no-verify` to dodge the husky failure, which skips the post-commit hook too." (incorrect)
- L2813-2814: `bun install` in the worktree; "no node_modules" confirmed.
- L2827: "I'll drop `--no-verify` from here on".
- L3485-3486: next commit runs `$ lint-staged` successfully.

## Root cause
Worktree creation (worktrunk `wt switch`) does not install JS deps, but the husky hook (installed via
`core.hooksPath=.husky/_`, shared by all worktrees) assumes `node_modules/.bin` exists. The Clojure-only
agent workflow never otherwise needs node_modules.

## Why agents fall for it
`--no-verify` is the obvious unblock and is even recorded as "required" in memory. Its cost (skipped
formatter/nocommit checks, commits reaching CI unformatted) is deferred and invisible.

## Current state
Still present: `.husky/pre-commit` runs `bun run precommit`; `package.json:482` `"precommit": "lint-staged"`.
Documented: auto-memory `project_nested_modules.md:100-101` ("Scratch worktrees have no `node_modules`,
so husky's lint-staged pre-commit dies with exit 127 -- `--no-verify` is required there") and
`project_fix_unused_requires_pod_crash.md:16-18` (cost of `--no-verify`: cljfmt misses reach CI).
Neither is in a CLAUDE.md, and the memory's advice ("--no-verify is required") entrenches the habit.

## Suggested fix
- Make `.husky/pre-commit` degrade gracefully: `command -v lint-staged >/dev/null || [ -x node_modules/.bin/lint-staged ] || { echo "skipping lint-staged: run bun install"; exit 0; }`, while still running `./hooks/pre-commit.nocommit`.
- Or have the worktrunk post-create hook run `bun install --frozen-lockfile` (5s) in new worktrees.
- Update memory to say "run `bun install` (5s)" instead of "--no-verify is required".

## Detection signal
Tool result `lint-staged: command not found` / `husky - pre-commit script failed (code 127)`, then a
`git commit --no-verify` in the following calls.

## Raw excerpts
```
L2813 [TOOL Bash] ls package.json bun.lock 2>/dev/null; ls -d node_modules 2>/dev/null || echo "  no node_modules"
timeout 900 bun install 2>&1 | tail -15
L2814 [RESULT] bun.lock
package.json
  no node_modules
...
5897 packages installed [5.37s]
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
  lines: 1827-1891
  date: 2026-09-17
  jev: {self_inflicted_bug: 0.64, tool_misuse: 0.95, misleading_signal: 0.81, user_correction: 0.66, codebase_trap: 0.63, flailing: 0.33, env_friction: 0.93}

The agent made a fresh worktree `metabase.util-cycle-cuts` (L1827, `git worktree add`) and cherry-picked a commit into it. Resolving the conflicts worked, but `git -c core.editor=true cherry-pick --continue` died in husky:
```
L1877 [RESULT] $ lint-staged
/opt/homebrew/bin/bash: line 1: lint-staged: command not found
error: script "precommit" exited with code 127
husky - pre-commit script failed (code 127)
```
L1880 "The fresh worktree has no `node_modules`, so the husky hook can't run. Committing with `--no-verify`."
There was a second trap after that. L1881 `git -c core.editor=true cherry-pick --continue --no-verify 2>&1 | tail -3 || git commit --no-verify -q -C 5f21dcce9f2 2>&1 | tail -3`.
- `cherry-pick --continue` has no `--no-verify` flag, so git printed its usage (`--empty (stop|drop|keep) ...`).
- The `|| git commit ...` fallback never ran, because the exit status of `| tail -3` was 0.
- The result looked like a success, but `git log` still showed master's tip, and the index was staged but not committed.
- The agent needed a third call (L1891: `git commit --no-verify -q -C 5f21dcce9f2; git cherry-pick --quit`).

Documented-still-hit: the metabase memory `project_nested_modules.md:100` already says "Scratch worktrees have no `node_modules`, so husky's lint-staged pre-commit dies with exit 127". The evals memory `metabase-worktree-precommit-hook.md` also documents it. Neither is in the metabase MEMORY.md index as a separate line, so an agent sees it only when it opens that project note.

## Related
- `chris.claude.memory-no-verify-workaround-invites-preemptive-hook-bypass.md`: the memory's `--no-verify`
  advice leads to preemptive bypass; here the bypass followed a real exit-127 failure caused by missing node_modules.
- `chris.claude.roborev-list-filters-current-branch.md`: the wrong "--no-verify skipped roborev" diagnosis.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/40cd8c33-43d3-4e2e-8088-d99acee7a38f.jsonl
  lines: 255-270, 380, 1062
  date: 2026-09-08
  jev: {self_inflicted_bug: 0.67, tool_misuse: 0.91, misleading_signal: 0.73, user_correction: 0.93, codebase_trap: 0.69, flailing: 0.38, env_friction: 0.82}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
  lines: 1035
  date: 2026-09-10
  jev: {self_inflicted_bug: 0.97, tool_misuse: 0.89, misleading_signal: 0.82, user_correction: 0.11, codebase_trap: 0.56, flailing: 0.55, env_friction: 0.92}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-78704-copy-transform-models/9201d948-0009-4073-b8a4-a56cab4824a2.jsonl
  lines: 623
  date: 2026-09-10
  jev: {self_inflicted_bug: 0.89, tool_misuse: 0.95, misleading_signal: 0.71, user_correction: 0.62, codebase_trap: 0.35, flailing: 0.27, env_friction: 0.90}

- 40cd8c33 L260: rebasing Ben Grabow's branches in `/private/tmp/metabase-hier-*` worktrees (created with
  `git worktree add`, no install): `husky - pre-commit script failed (code 127)` / `husky - command not found`
  during a squash. L269 agent: "`--no-verify` needed (known husky issue)." Every later commit in that session used
  `git -c core.hooksPath=/dev/null commit -q --no-verify` (L380, L1062), including an `--amend` of a pushed commit.
- 7a939669 L1035 (THINKING): "commit locally with `--no-verify` (skipping the husky hook since node_modules is missing)"
  in a new follow-up worktree `../metabase.module-resolver-prose`.
- 9201d948 L623: "Husky's pre-commit hook can't run in this scratch worktree (no `node_modules`). Disabling hooks for
  the commit" on a backport scratch worktree under the session scratchpad.
All three are scratch worktrees made by the agent itself, so the fix belongs in whatever creates them (or a hook
shim that skips lint-staged with a clear message when node_modules is absent, while still running cljfmt).

## Additional occurrence (commit fails, but the chained push and `gh pr create` still run)
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/72ee4b52-4213-4328-b91b-df0671210015.jsonl
  lines: 244-263
  date: ~2026-09-17
  jev: {self_inflicted_bug: 0.80, tool_misuse: 0.80, misleading_signal: 0.62, user_correction: 0.75, codebase_trap: 0.39, flailing: 0.43, env_friction: 0.95}

The worktree was created mid-session with `git worktree add` after the original one was deleted under the agent (L89 "Working directory ... was deleted", L100 "presumably by post-merge cleanup").
`git add -A src test && git commit ...` failed in husky with `lint-staged: command not found` (code 127). The rest of the compound command still pushed the branch *without the commit* and ran `gh pr create`, which failed with `No commits between master and sql-errors-comment-cleanup`. An empty branch was left on the remote.
The agent then re-committed with `--no-verify` (L261) and reasoned that "cljfmt already ran on these files". That was true here, but it also skipped the token scan and fix-unused-requires.
```
L246 [RESULT ERROR] Exit code 1
$ lint-staged
/opt/homebrew/bin/bash: line 1: lint-staged: command not found
error: script "precommit" exited with code 127
husky - pre-commit script failed (code 127)
...
remote:      https://github.com/metabase/metabase/pull/new/sql-errors-comment-cleanup
pull request create failed: GraphQL: No commits between master and sql-errors-comment-cleanup (createPullRequest)
L260 [THINKING] The commit failed because the fresh worktree lacks node_modules, so husky's pre-commit hook couldn't run lint-staged and pushed an empty branch—meaning roborev never triggered since it fires post-commit.
```
The same fresh worktree also auto-installed a per-worktree Babashka on first `./bin/mage` use (L102 "Babashka 1.12.212 successfully installed at .../metabase.sql-errors-comment-cleanup/bin/bb"), and bare clj-kondo reported 203 bogus errors there (see `bare-clj-kondo-lint-misses-repo-hooks`). A fresh worktree is missing three things an agent expects: node_modules, the kondo copied configs, and bb.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-review-bot-1997/ef637b05-28bd-40e5-a402-79a3e8b7d142.jsonl
  lines: 96-117
  date: 2026-09 (PR #80083 review)
  jev: {self_inflicted_bug: 0.72, tool_misuse: 0.97, misleading_signal: 0.78, user_correction: 0.05, codebase_trap: 0.73, flailing: 0.77, env_friction: 0.93}
- The agent created a scratch worktree (`git worktree add --detach $SCRATCH/rr-wt 08497ded2fd`) to build synthetic "baseline" and "new work" commits for roborev. L100: `$ lint-staged / bash: line 1: lint-staged: command not found / husky - pre-commit script failed (code 127)`. Commit A never landed, and **the `echo "commit B: $(git rev-parse --short HEAD)"` printed master's sha `08497ded2fd`**, so the "incremental diffstat" was of master's own last commit (`bun.lock`, `package.json`, `ValuesSourceModal/utils.ts`). This compounded with the zsh word-splitting failure in the same command. L111 retried with `git commit --no-verify`. Here the scratch worktree was throwaway, so `--no-verify` was harmless, but the silent "HEAD didn't move" meant the first diff looked plausible.
- The post-commit hook still fired in the scratch worktree: L274 `roborev list --repo $WT` shows job 5670 `running` on the synthetic commit, auto-enqueued alongside the agent's manual 5671/5672 (see `roborev-postcommit-fires-per-local-commit`).
