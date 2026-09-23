---
title: A `cd` in one of several parallel Bash calls carries over to its siblings, so the sibling that relied on the earlier directory ran `git grep`, `uv run` and `git add && git commit` in the wrong repository
slug: bash-cwd-persists-in-scratchpad-but-resets-in-worktrees
kind: env-friction
impact: wasted-time
severity: medium
status: documented-still-hit # a local note covered it
area: Claude Code Bash tool, parallel tool calls, workspace holding several git repos
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/56bba9cc-7c7c-4702-a034-a52e575a7302.jsonl
    lines: 504-659
    date: 2026-09-08
    jev: {any_papercut: 0.76, env_toolchain: 0.84, stale_state: 0.28, verify_mismatch: 0.52, misleading_code: 0.25, hidden_coupling: 0.49, stale_docs: 0.34, tool_footgun: 0.74, flaky: 0.29, agent_bug: 0.82, wasted_effort: 0.29, user_correction: 0.10}
---
## Summary
The agent issued two Bash calls in one message: the first began with a `cd` into a sibling repository, the second assumed the shell was still where an earlier turn left it. The calls ran one after the other in the same shell, so the `cd` applied to the second call too. This happened three times in one session, once with a `git add && git commit` aimed at a third repository.

## Symptom
- L505/L513: a metabase `git grep ... origin/master` ran in the sibling repo: `fatal: unable to resolve revision: origin/master` (that repo's default branch is main).
- L520/L522: `uv run ruff check .` meant for the sibling repo ran in the metabase checkout: `error: Failed to spawn: ruff`.
- L648/L650: `git add <file> && git commit ...` meant for a third repo ran in the sibling repo: `fatal: pathspec '<file>' did not match any files`.

## Timeline
- L504-L505: same message, `cd <sibling-repo> && ...` then a metabase `git grep`; the grep fails, re-run with `cd metabase` at L519.
- L519-L520: same message again, `cd metabase && ...` then the sibling repo's `uv run ruff`; fails, re-run with `cd <sibling-repo>` at L535.
- L647-L648: same message, `cd <sibling-repo> && ...` then a `git add && git commit` for a third repo; fails on the pathspec, re-run with `git -C <repo>` at L659.
- Cost: 3 failed calls and 3 re-runs; the commit only failed safely because the path did not exist in the other repo.

## Root cause
Parallel tool calls in one assistant message execute sequentially in one persistent shell, and the shell keeps its cwd between calls while it stays inside the project root. The rule for when cwd persists and when it resets (it resets after leaving the project root, see "Shell cwd was reset" at L420/L437) is not visible to the agent.

## Why agents fall for it
Parallel calls look independent, and the agent reasons about each one as if it starts from the directory the previous turn ended in. The workspace root holds several git repos, so a wrong cwd still yields a valid repo and an error that looks like a content problem.

## Current state
Not a repo issue; harness behaviour.

## Suggested fix
- Harness: give each tool call its own cwd (reset to the project root before every call), or show the effective cwd in each result.
- Agent instructions: require `git -C <repo>` / absolute paths for every git and gh command instead of relying on `cd`.

## Detection signal
Two Bash calls in one message where exactly one starts with `cd`; errors `unable to resolve revision: origin/master`, `did not match any files`, `Failed to spawn` right after a `cd` into a sibling repo.

## Raw excerpts
```
L504 [CALL] Bash: cd <sibling-repo> && ...
L505 [CALL] Bash: echo '##### ex-data status/headers'; git grep -n -E ':status\s+status|...' origin/master -- src/metabase/metabot/self/core.clj ...
L513 [RESULT] ##### ex-data status/headers | fatal: unable to resolve revision: origin/master | ##### call-llm span attrs | fatal: invalid object name 'origin/master'.
L519 [CALL] Bash: cd ~/src/mb/metabase && echo '##### error ex-data with status/headers (self/, llm/)'; git grep -n -E 'ex-info' origin/master ...
L520 [CALL] Bash: uv run ruff check . 2>&1 | tail -2; ...
L522 [RESULT] error: Failed to spawn: `ruff` |   Caused by: No such file or directory (os error 2)
L647 [CALL] Bash: cd <sibling-repo> && ...
L648 [CALL] Bash: git add <file> && git commit -q -m "..." && ...
L650 [RESULT (ERROR)] Exit code 128 | fatal: pathspec '<file>' did not match any files
L659 [CALL] Bash: git -C <repo> add <file> && git -C <repo> commit -q -m "..."
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/7a10ece8-08be-4759-ac32-93c2b9ea147b.jsonl
  lines: 258-300
  date: 2026-08-24
  jev: {any_papercut: 0.84, env_toolchain: 0.87, stale_state: 0.22, verify_mismatch: 0.25, misleading_code: 0.20, hidden_coupling: 0.40, stale_docs: 0.34, tool_footgun: 0.76, flaky: 0.12, agent_bug: 0.59, wasted_effort: 0.54, user_correction: 0.10}

- L264-L265: a `git add -A && git commit --amend --reset-author` meant for a metabase worktree prints `[main 48f2cad] <PR commit title>` and `create mode 100644 <unrelated file>`: it amended the last commit of a different repository.
- L277: reflog `HEAD@{0}: commit (amend): <PR commit title>`, `HEAD@{1}: commit: <original commit title>`.

- L63: `cd ~/src/mb/wt/<worktree> && ...`; the following commands run there without `cd`.
- L258: a `cd` into a sibling repository to read a file.
- L264-L265: the amend lands on that repository's `main`.
- L270-L283: reflog check; tree identical; not pushed.
- L287-L288: the original commit message restored (author date stays reset).
- L294-L300: amend re-run in the worktree after an explicit `cd`.
- Cost: one rewrite of the wrong repo's history and 4 repair calls; had the next step been a push, the wrong commit would have gone out.

```
L63 [CALL] cd ~/src/mb/wt/<worktree> && git status --short && git log --oneline -6 && ...
L258 [CALL] cd <sibling-repo> && grep -n -i -A 25 "<pattern>" <file> | head -70
L264 [CALL] git add -A && git -c commit.gpgsign=false commit --amend --no-edit --reset-author -F - <<'EOF' | <PR commit title> | ...
L265 [RESULT] [main 48f2cad] <PR commit title> |  3 files changed, 250 insertions(+), 1 deletion(-) |  create mode 100644 <unrelated file>
L270 [CALL] git reflog -8 && echo "=== HEAD@{1} ===" && git log -1 --format='%h %s' HEAD@{1} && echo "=== status ===" && git status --short
L277 [RESULT] 48f2cad HEAD@{0}: commit (amend): <PR commit title> | e7618a5 HEAD@{1}: commit: <original commit title> | ...
L294 [CALL] cd ~/src/mb/wt/<worktree> && git status --short && git log --oneline -1
L300 [RESULT] [<branch> aa343acfa3a] <PR commit title> | ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/dcbc556d-c81c-4160-af67-238040132220.jsonl
  lines: 2597-2706
  date: 2026-09-11
  jev: {any_papercut: 0.89, env_toolchain: 0.75, stale_state: 0.24, verify_mismatch: 0.82, misleading_code: 0.59, hidden_coupling: 0.79, stale_docs: 0.17, tool_footgun: 0.52, flaky: 0.84, agent_bug: 0.95, wasted_effort: 0.65, user_correction: 0.11}

L2702: `FileNotFoundError: [Errno 2] No such file or directory: 'src/metabase/metabot/query_export.clj'` followed by `Running Kondo on: [src/metabase/metabot test/metabase/metabot] linting took 3964ms, errors: 0, warnings: 0`; the transcript's cwd field for L2701 is ~/src/mb/metabase. L2705-L2706 the same edit prefixed with `cd ~/src/mb/wt/<branch>` succeeds.

- 20:47:45 L2597 cwd is the worktree; the command starts with `cd ~/src/mb/metabase` to run `gh pr view` and a GraphQL thread query.
- 20:49:13 L2701 heredoc edit plus kondo; the cwd is now the main checkout.
- L2702 FileNotFoundError, then a clean kondo result for the wrong tree.
- 20:49:30 L2705-L2706 retried with an explicit `cd` into the worktree.
- Cost: one retry and a misleading clean lint; the same shape risks silent edits to a checkout another process is using.

```
L2597 [CALL] cd ~/src/mb/metabase && gh pr view <pr> --json reviews --jq '.reviews[] | select(.submittedAt > "2026-09-11T19:12:38Z") | ...'; echo "=== unresolved threads now ==="; gh api graphql -f query='query { repository(owner:"metabase",name:"metabase"){ pullRequest(number:<pr>){ reviewThreads(first:100){ ...
L2701 [CALL] python3 - <<'PY' p='src/metabase/metabot/query_export.clj' s=open(p).read() ... PY ... ./bin/mage kondo src/metabase/metabot test/metabase/metabot 2>&1 | tail -2; /usr/bin/grep -rn "query-for-export" test/ | head
L2702 [RESULT] Traceback (most recent call last):   File "<stdin>", line 2, in <module> FileNotFoundError: [Errno 2] No such file or directory: 'src/metabase/metabot/query_export.clj' Running Kondo on: [src/metabase/metabot test/metabase/metabot] linting took 3964ms, errors: 0, warnings: 0
L2705 [CALL] cd ~/src/mb/wt/<branch> && python3 - <<'PY' p='src/metabase/metabot/query_export.clj' s=open(p).read() ...
L2706 [RESULT] query_export content_store_test test/metabase/metabot/tools/shared/content_store_test.clj:269: ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/16ac4d80-0281-40cd-8fa9-25c158f4853b.jsonl
  lines: 159-185
  date: 2026-09-10
  jev: {any_papercut: 0.83, env_toolchain: 0.82, stale_state: 0.25, verify_mismatch: 0.17, misleading_code: 0.17, hidden_coupling: 0.34, stale_docs: 0.29, tool_footgun: 0.78, flaky: 0.93, agent_bug: 0.31, wasted_effort: 0.61, user_correction: 0.06}

L172 the `cd`-ing call's result ends with 'Shell cwd was reset to ~/src/mb'. L177 `=== PR <pr> commits === failed to run git: fatal: not a git repository (or any of the parent directories): .git`; L178 `failed to determine base repo: failed to run git: fatal: not a git repository`.

- 16:07:53-16:08:07 L159-L167 six calls in one assistant message; cwd is ~/src/mb/metabase.
- L164 one call `cd`s into a sibling repository and then into a directory outside the project root.
- L172 its result reports the cwd reset to ~/src/mb.
- L177-L178 both `gh` calls queued after it fail for lack of a repository.
- 16:08:20 L184-L185 re-run with `-R metabase/metabase`.
- Cost: two failed calls and a re-run.

```
L164 [CALL] cd <sibling-repo> && ...; cd <directory outside the project root> && ...
L165 [CALL] for n in <pr> <pr>; do echo "=== PR $n commits ==="; gh pr view $n --json commits --jq '.commits[]|[.committedDate,.oid[0:8],.messageHeadline]|@tsv'; done
L167 [CALL] echo "=== master Run tests, last 15 ==="; gh run list --branch master --workflow "Run tests" --limit 15 --json databaseId,conclusion,createdAt,headSha ...
L172 [RESULT] <persisted-output> Output too large (38.3KB). ... </persisted-output> Shell cwd was reset to ~/src/mb
L177 [RESULT (ERROR)] Exit code 1 === PR <pr> commits === failed to run git: fatal: not a git repository (or any of the parent directories): .git  === PR <pr> commits === failed to run git: fatal: not a git repository (or any of the parent directories): .git
L178 [RESULT (ERROR)] Exit code 1 === master Run tests, last 15 === failed to determine base repo: failed to run git: fatal: not a git repository (or any of the parent directories): .git
L184 [CALL] for n in <pr> <pr>; do echo "=== PR $n commits ==="; gh pr view $n -R metabase/metabase --json commits --jq '...'; done
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/9a88b72e-3629-4bc8-8ad6-2e2604ad3d18.jsonl
  lines: 229-248
  date: 2026-09-02
  jev: {any_papercut: 0.71, env_toolchain: 0.48, stale_state: 0.25, verify_mismatch: 0.68, misleading_code: 0.18, hidden_coupling: 0.26, stale_docs: 0.31, tool_footgun: 0.60, flaky: 0.88, agent_bug: 0.41, wasted_effort: 0.31, user_correction: 0.08}

L244: `failed to determine base repo: failed to run git: fatal: not a git repository (or any of the parent directories): .git ⏎ ⏎        0 $SCRATCH/sdk.log`.

- L229-L234: `cd $SCRATCH && …`, cwd reset afterwards.
- L243-L244: gh from ~/src/mb fails; empty log.
- L247-L248: `cd ~/src/mb/metabase && gh run view …` works (1387 lines).
- Cost: one retry.

```
L233 [CALL Bash] cd $SCRATCH && sed -n '3540,3618p' g35.log | sed 's/\x1b\[[0-9;]*m//g' | …
L234 [RESULT] … Shell cwd was reset to ~/src/mb
L243 [CALL Bash] gh run view --job 100350598299 --log 2>&1 > $SCRATCH/sdk.log; wc -l $SCRATCH/sdk.log; grep -nE 'failing|✖|Error|error' $SCRATCH/sdk.log | … | head -40
L244 [RESULT] failed to determine base repo: failed to run git: fatal: not a git repository (or any of the parent directories): .git ⏎ ⏎        0 $SCRATCH/sdk.log
L247 [CALL Bash] cd ~/src/mb/metabase && gh run view --job 100350598299 --log > $SCRATCH/sdk.log 2>&1; wc -l $SCRATCH/sdk.log; …
L248 [RESULT] 1387 $SCRATCH/sdk.log ⏎ 1337:sdk-tests / … ##[error]read ECONNRESET
```
