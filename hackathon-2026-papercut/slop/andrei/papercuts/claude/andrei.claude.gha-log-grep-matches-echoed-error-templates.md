---
title: Grepping GitHub Actions job logs for "error" matches the step scripts GitHub prints before running them, so `echo "::error::Docker login failed after 3 attempts"` template lines were reported to the user as evidence of infra failures
slug: gha-log-grep-matches-echoed-error-templates
kind: misleading-signal
impact: wasted-time
severity: low
status: open # GitHub prints `run:` scripts into job logs; Metabase CI scripts contain many `::error::` templates
area: GitHub Actions job logs, .github/actions/* scripts with retry/`::error::` messages
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/367ade68-abaa-469f-ad27-a55947196cd0.jsonl
    lines: 751-820
    date: 2026-09-10
    jev: {any_papercut: 0.88, env_toolchain: 0.85, stale_state: 0.39, verify_mismatch: 0.64, misleading_code: 0.21, hidden_coupling: 0.17, stale_docs: 0.17, tool_footgun: 0.88, flaky: 0.96, agent_bug: 0.32, wasted_effort: 0.84, user_correction: 0.43}
---
## Summary
To support the "infra bad day" explanation, the agent grepped another branch's failed e2e log for `error|failing`. The hits included lines like `echo "::error::Docker login failed after 3 attempts"` and `echo "::error::Clojure CLI installation failed after 3 attempts"`, which are the printed source of the step scripts, not executed failures. The final summary to the user cited "docker login retries, Clojure CLI install retries" as observed.

## Symptom
- L756: grep hits at lines 267 and 330 are `echo "::error::..."` source lines; the only real `##[error]` is at 3155.
- L820: the summary to the user cites docker login retries, Clojure CLI install retries and `Backend failed to start within N minutes` as seen in other branches' logs.

## Timeline
- L751-L752: another run's group-06 log fetched.
- L755-L756: grep for error keywords returns echoed script templates and one real error.
- L820: templates cited as evidence in the explanation to the user.
- Cost: incorrect supporting evidence in a report the user acted on (the conclusion survived because the rerun went green).

## Root cause
GitHub Actions logs include each `run:` step's script text (under `##[group]Run ...`), and Metabase's composite actions embed `echo "::error::..."` messages for retry exhaustion. Only lines prefixed `##[error]` are emitted annotations.

## Why agents fall for it
The template text is a well-formed error message with the word error in it, and log lines carry timestamps like real output.

## Current state
origin/master .github/actions/prepare-backend/action.yml still contains `echo "::error::Clojure CLI installation failed after 3 attempts"`.

## Suggested fix
- Grep only `##\[error\]` lines, or read check-run annotations through the API instead of raw logs.
- Provide a helper that strips `##[group]Run` script blocks from downloaded job logs.

## Detection signal
Grep hits of the form `^\S+Z\s+echo "::error::` in a job log being quoted as a failure.

## Raw excerpts
```
L755 [CALL] Bash: S=<scratchpad>; /usr/bin/grep -nE '##\[error\]|Error|error|failing|Timed out' $S/other06.log | tail -20
L756 [RESULT] 267:2026-09-10T15:05:51.6913359Z     echo "::error::Docker login failed after 3 attempts" | 330:2026-09-10T15:05:52.6101123Z     echo "::error::Docker compose up failed after 3 attempts" | 1818: ... echo "::error::bun reports its store at $ACTUAL, not $STORE; ..." | ... | 3155: ... ##[error]Unhandled error: Error: Pattern ./cypress/reports/mochareports/*.json matched no report files
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/7e19d6c9-cfc3-46a6-b6db-e21f76a54bfd.jsonl
  lines: 473-482
  date: 2026-09-10
  jev: {any_papercut: 0.72, env_toolchain: 0.74, stale_state: 0.71, verify_mismatch: 0.42, misleading_code: 0.20, hidden_coupling: 0.24, stale_docs: 0.23, tool_footgun: 0.66, flaky: 0.93, agent_bug: 0.19, wasted_effort: 0.52, user_correction: 0.17}

- L474: hit 593 is `echo "::error::Clojure CLI installation failed after 3 attempts"`, hit 681 is `##[error]fetch failed`.

- L473-L474: grep over the stripped log.
- L482: both hits reported as failures.
- Cost: an inaccurate diagnosis in the explanation of a CI failure.

```
L474 [RESULT] 593:2026-09-10T10:32:08.5714029Z   echo "::error::Clojure CLI installation failed after 3 attempts" | 681:2026-09-10T10:32:08.7566258Z ##[error]fetch failed | ...
```
