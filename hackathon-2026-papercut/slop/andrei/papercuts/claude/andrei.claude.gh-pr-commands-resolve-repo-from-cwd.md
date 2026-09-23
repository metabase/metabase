---
title: `gh pr checks <n>` without `-R` resolves the repository from the current directory, so after a `cd` into another repository it failed and, piped through grep/awk, printed an empty summary that read like 'no failures'
slug: gh-pr-commands-resolve-repo-from-cwd
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: gh pr checks / gh pr view without -R; workspace holding several git repos and worktrees
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7f8310f8-f0b6-492c-ae68-48d13121c540.jsonl
    lines: 348-378
    date: 2026-09-07
    jev: {any_papercut: 0.89, env_toolchain: 0.90, stale_state: 0.68, verify_mismatch: 0.84, misleading_code: 0.16, hidden_coupling: 0.55, stale_docs: 0.30, tool_footgun: 0.75, flaky: 0.73, agent_bug: 0.40, wasted_effort: 0.54, user_correction: 0.10}
---
## Summary
The agent polled CI with `gh pr checks <pr> 2>&1 | grep -E ... ; ... | awk ... | uniq -c`. After it had `cd`'d into another repository for an unrelated edit, the same command resolved the PR number against that repo; the GraphQL error was swallowed by the pipe and the summary showed only `--- counts:` and ` 1`, which looks like nothing pending or failing. The next call printed the raw output and exposed 'Could not resolve to a PullRequest with the number of <pr>'.

## Symptom
L374: `--- counts:` / `   1` (no fail or pending lines); L378: `GraphQL: Could not resolve to a PullRequest with the number of <pr>. (repository.pullRequest)`.

## Timeline
- L348-L350: the check works from the metabase checkout (45 pending).
- L349-L369: agent `cd`s into another repository for an unrelated edit.
- L373-L374: the same check prints an empty summary.
- L377-L378: raw output shows the GraphQL error; the agent queries check-runs through the API instead.
- Cost: one misleading result that could have been reported as 'CI green'.

## Root cause
gh infers the repo from the git remote of the current directory; the Bash tool keeps the directory from the previous `cd`; `2>&1 | grep` hides the error line.

## Why agents fall for it
The PR number is unambiguous to the agent, and the earlier identical command worked minutes before.

## Current state
not checked.

## Suggested fix
- Always pass `-R metabase/metabase` in agent gh recipes (the coordinator in later sessions does).
- Do not filter gh output through grep without checking gh's exit status first.

## Detection signal
`Could not resolve to a PullRequest with the number of`; `gh pr checks` output with no tab-separated rows after a `cd` into another repo.

## Raw excerpts
```
L348 [CALL] Bash: gh pr checks <pr> 2>&1 | /usr/bin/grep -cE "pending|queued"; echo "--- fails:"; gh pr checks <pr> 2>&1 | /usr/bin/grep -E "\tfail\t" | head
L349 [CALL] Bash: cd <other-repo> && ...
L350 [RESULT] 45
    --- fails:
L373 [CALL] Bash: gh pr checks <pr> 2>&1 | /usr/bin/grep -E "\tfail\t|\tpending\t" | head -5; echo "--- counts:"; gh pr checks <pr> 2>&1 | awk -F'\t' '{print $2}' | sort | uniq -c
L374 [RESULT] --- counts:
       1
L377 [CALL] Bash: gh pr checks <pr> 2>&1 | head -5; echo "=== via api:"; gh api repos/metabase/metabase/commits/0149f2f3df8/check-runs --jq '.check_runs | group_by(.conclusion // "running") | map({k: .[0].conclusion // "running", n: length})' 2>&1 | head
L378 [RESULT] GraphQL: Could not resolve to a PullRequest with the number of <pr>. (repository.pullRequest)
    === via api:
    [{"k":"running","n":8},{"k":"skipped","n":17},{"k":"success","n":5}]
```
