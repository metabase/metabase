---
title: Rerunning a label-gated GitHub Actions job replays the original event payload, so 'Decide whether to backport or not' fails again after the label is added, and the fresh red rerun is what `gh pr checks` then reports although the merge box ignores it
slug: gha-rerun-replays-original-event-payload
kind: tool-quirk
impact: both
severity: medium
status: open
area: `.github/workflows/backport-reminder.yml` (`contains(github.event.pull_request.labels.*.name, ...)`), `gh run rerun --failed`, `gh pr checks`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/17ced372-740e-4ab7-a0be-3ea30f2f9a1c.jsonl
    lines: 291-477
    date: 2026-09-07
    jev: {any_papercut: 0.93, env_toolchain: 0.42, stale_state: 0.72, verify_mismatch: 0.38, misleading_code: 0.25, hidden_coupling: 0.44, stale_docs: 0.20, tool_footgun: 0.94, flaky: 0.94, agent_bug: 0.62, wasted_effort: 0.81, user_correction: 0.92}
---
## Summary
Sweeping red CI across the user's PRs, the agent reran the failed backport-decision runs on a docs PR, then reran one again. The job reads labels from the event payload, and a rerun replays the payload captured before the user added `no-backport`, so every rerun failed. The agent reported that the check could never go green and nothing needed doing; the user pointed out the label was already there. Checking again, the agent found its reruns were now the newest check runs, so `gh pr checks` listed the check as failing, while GitHub's merge box counted the later labelled-event run and showed all checks passing.

## Symptom
- L291-L292: `gh run rerun <id> --failed` for both backport-reminder runs.
- L353-L354: `run_attempt=2 conclusion=cancelled`, `run_attempt=2 conclusion=failure`.
- L363-L369: 'rerun it again' → `attempt=3`.
- L373-L374: attempt-2 log: `::error::PR has docs changes and is missing a backport decision label`.
- L406: the user points out the `no-backport` label was added after the failed run.
- L429-L435: check runs `10:50 success` (labelled event), `17:54 cancelled`, `17:57 failure` (the reruns); `gh pr checks` shows `Decide whether to backport or not fail`.
- L477: the merge box shows all checks passed while `gh pr checks` still lists the check as failing.

## Timeline
- L44: the PR shows the check failing from the run before the label was added.
- L291-L292: first reruns.
- L353-L374: attempts fail; reran again; log says the label is missing.
- L402: tells the user the run can never go green and there is nothing to do.
- L406: user correction.
- L413-L441: reads the workflow, finds the payload gating and the newer red check runs it created; offers to toggle the label; user says leave it.
- L477: realizes the merge box already showed green.
- Cost: 3 needless reruns, 2 wrong status reports to the user, a red check it created on a PR that was green, about 10 tool calls.

## Root cause
GitHub Actions reruns reuse the original run's event payload, so `github.event.pull_request.labels` is frozen at the time of the first event, and `backport-reminder.yml` gates on exactly that. `gh pr checks` lists check runs by name and shows the latest, including reruns of a run superseded by a newer event, while the merge box evaluated the head commit's checks differently. The exact GitHub resolution rule was not verified; the transcript shows only the disagreement.

## Why agents fall for it
'Red job, probably flaky, rerun it' is the standard move, and the user's instruction said to rerun flakes. The job error says the label is missing while the PR page shows it, and nothing says the label list came from an old payload.

## Current state
Checked origin/master: `.github/workflows/backport-reminder.yml` still computes `has_backport_label` from `contains(github.event.pull_request.labels.*.name, 'no-backport') || ...`, with `concurrency: cancel-in-progress: true`.

## Suggested fix
- Read the PR's current labels through the API inside the job (`gh pr view $PR --json labels`) instead of the event payload, so reruns see the present state.
- Or make the job's error say that a rerun cannot pick up a newly added label.
- For agents: before rerunning a job whose workflow triggers on `labeled`/`edited`, compare the run's start time with the label timeline, and cross-check `gh pr checks` against the PR's merge state before reporting a red check.

## Detection signal
`gh run rerun` on a run whose log says a label is missing, or whose workflow `on:` includes `labeled`; `run_attempt` greater than 1 with the same conclusion as attempt 1.

## Raw excerpts
```
L291 [CALL] cd ~/src/mb/metabase | echo "=== <PR>: rerun backport decision runs ===" | for r in 34112818668 34112892343; do gh run rerun $r --failed 2>&1 | head -2; done | ...
L292 [RESULT] === <PR>: rerun backport decision runs === | ... | 34112892343  queued/  Backport Reminder
L354 [RESULT] Backport Reminder event=pull_request branch=<branch> completed/cancelled | --- attempt count --- | run_attempt=2 conclusion=cancelled | --- and the other --- | run_attempt=2 conclusion=failure
L363 [CALL] ... echo "--- rerun it again ---" | gh run rerun 34112892343 --failed 2>&1 | head -3 | sleep 8 | ...
L369 [RESULT] attempt=2 started=2026-09-07T17:54:40Z updated=2026-09-07T17:55:00Z | --- rerun it again --- | attempt=3 status=queued conclusion=null
L374 [RESULT] === attempt-2 log (why it still failed) === | ...Z ##[group]Run echo "::error::PR has docs changes and is missing a backport decision label. Add one of: no-backport, backport, single-backport, double-backport, or triple-backport"
L430 [RESULT] 2026-09-07T10:42:12Z  cancelled  run=34112816983 | 2026-09-07T10:49:14Z  cancelled  run=34113393913 | 2026-09-07T10:50:22Z  success  run=34113416129 | 2026-09-07T17:54:42Z  cancelled  run=34112818668 | 2026-09-07T17:57:05Z  failure  run=34112892343
L435 [RESULT] ... --- checks summary as gh sees it now --- | Decide whether to backport or not	fail	4s	... | backport	skipping	0	...
```
