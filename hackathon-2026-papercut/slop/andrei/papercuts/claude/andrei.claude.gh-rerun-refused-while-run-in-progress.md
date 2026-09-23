---
title: `gh run rerun --job`/`--failed` on a red job refuses with 'cannot be rerun' while any other job in the run is still going, so agents that rerun a flake straight away need an extra wait loop
slug: gh-rerun-refused-while-run-in-progress
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: gh run rerun; GitHub Actions REST POST /actions/jobs/{id}/rerun
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a342a3a46659ac024.jsonl
    lines: 1207-1243
    date: 2026-09-17
    jev: {any_papercut: 0.79, env_toolchain: 0.74, stale_state: 0.20, verify_mismatch: 0.92, misleading_code: 0.23, hidden_coupling: 0.38, stale_docs: 0.18, tool_footgun: 0.53, flaky: 0.95, agent_bug: 0.34, wasted_effort: 0.43, user_correction: 0.08}
---
## Summary
A job-level rerun is only allowed once the whole workflow run has completed. gh prints 'job N cannot be rerun' with no reason; the REST API says 'The workflow run containing this job is already running' (403). Three subagents in one session tried to rerun a flaky backend or e2e job as soon as it went red, then wrote a loop to wait for the run and reran `--failed` afterwards.

## Symptom
agent-a342 L1208 `job 105212724966 cannot be rerun` with the run still `in_progress`; agent-a632 L411 `{"message":"The workflow run containing this job is already running" ... "status":"403"}`; agent-af57 L764 `job 105292693534 cannot be rerun`.

## Timeline
- agent-a342 L1207-L1243: rerun refused; waits about 20 minutes for the run, reruns failed jobs; attempt 2 green.
- agent-a632 L410-L453: API rerun refused; waits for completion, reruns failed jobs.
- agent-af57 L763-L781: rerun refused; waits, reruns.
- Cost: a failed call and an extra wait loop per agent (the rerun could not start earlier anyway).

## Root cause
GitHub Actions only permits reruns of completed runs; gh's message omits the reason.

## Why agents fall for it
The failing job has finished, the usual flake advice is to rerun the job, and gh's message sounds permanent rather than 'wait'.

## Current state
not checked (GitHub behaviour).

## Suggested fix
- In agent guidance for flakes, say that reruns only work after the whole run completes: wait on `gh run view <id> --json status`, then `gh run rerun <id> --failed`.
- Give agents one wrapper that waits and reruns.

## Detection signal
gh output `cannot be rerun`; `The workflow run containing this job is already running`; `This workflow is already running`.

## Raw excerpts
```
L1207 [CALL] Bash: cd ~/src/mb/wt/<worktree> && gh run rerun --job 105212724966 --repo metabase/metabase 2>&1 | tail -3; gh run view 35224288049 --repo metabase/metabase --json status,conclusion --jq '"\(.status) \(.conclusion)"'
L1208 [RESULT] job 105212724966 cannot be rerun
    in_progress
L1235 [CALL] Bash: cd ~/src/mb/wt/<worktree> && gh run rerun 35224288049 --failed --repo metabase/metabase 2>&1 | tail -2; sleep 20; gh run view 35224288049 --repo metabase/metabase --json status,attempt --jq '"\(.status) attempt 
L1243 [RESULT] success attempt 2
-- subagent agent-a632b29c43867bb36 --
L410 [CALL] Bash: cd ~/src/mb/wt/<worktree> && gh api -X POST repos/metabase/metabase/actions/jobs/105148543783/rerun 2>&1 | head -5
L411 [RESULT] {"message":"The workflow run containing this job is already running","documentation_url":"https://docs.github.com/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run","status":"403"}gh: The workflow run conta
-- subagent agent-af57a8eefaff9d874 --
L763 [CALL] Bash: gh run rerun 35246670823 -R metabase/metabase --job 105292693534 2>&1 | tail -3
L764 [RESULT] job 105292693534 cannot be rerun
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/6bc1800e-c3b5-4388-9868-f321f7266cce.jsonl
  lines: 619-632
  date: 2026-09-14
  jev: {any_papercut: 0.79, env_toolchain: 0.25, stale_state: 0.40, verify_mismatch: 0.77, misleading_code: 0.17, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.77, flaky: 0.95, agent_bug: 0.26, wasted_effort: 0.32, user_correction: 0.08}

L621: `run 34883323538 cannot be rerun; This workflow is already running`.

- L619-L621: rerun refused.
- L629-L632: background watcher that reruns failed jobs after completion.
- L682: status message explains GitHub won't rerun while the run is going.
- Cost: one failed call and a background task to track.

```
L619 [CALL] Bash: gh run rerun 34883323538 --failed --repo metabase/metabase 2>&1 | tail -2
L621 [RESULT] run 34883323538 cannot be rerun; This workflow is already running
L629 [CALL] Bash: gh run watch 34883323538 --repo metabase/metabase --interval 60 > /dev/null 2>&1; gh run view 34883323538 --repo metabase/metabase --json conclusion,jobs --jq '"conclusion=\(.conclusion) failed=\([.jobs[] | select(.conclusion=="failure") | .n
```
