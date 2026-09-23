---
title: `gh api repos/<repo>/actions/jobs/<id>/logs` refuses to print a CI log that contains ANSI escapes (one notice line on stderr) unless given `--allow-escape-sequences`, so `2>/dev/null | grep` comes back empty and `> file` yields a one-line file while the agent hunts for a CI error.
slug: gh-ci-inspection-silent-empty-and-in-progress-logs
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: gh api job logs, gh run view --log-failed, CI failure triage
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/b9969651-5371-431a-b6c4-6d9916153234.jsonl
    lines: 1125-1146
    date: 2026-08-24
    jev: {any_papercut: 0.87, env_toolchain: 0.82, stale_state: 0.49, verify_mismatch: 0.94, misleading_code: 0.25, hidden_coupling: 0.74, stale_docs: 0.44, tool_footgun: 0.72, flaky: 0.63, agent_bug: 0.88, wasted_effort: 0.78, user_correction: 0.38}
---
## Summary
To find why a PR's `Eastwood (changed tests only)` job failed, the agent tried `gh run view --log-failed` (no output), then the raw job-logs API with stderr discarded (no output), then the API into a file (one line: the escape-sequence notice), and only then `--allow-escape-sequences`, which showed a one-line reflection warning in a test file.

## Symptom
- L1126: `gh run view <run> --log-failed 2>&1 | grep -iE "claude_test|error|warning"` printed nothing.
- L1136: `gh api .../jobs/<id>/logs 2>/dev/null | grep ...` printed nothing.
- L1141: the saved log was 1 line: `the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway`.
- L1146: with the flag, `test/metabase/metabot/self/claude_test.clj:346:7: reflection: reference to field close can't be resolved.`

## Timeline
- L1125-1126 (21:02:07): `--log-failed` empty (reason unknown; the run may still have had jobs in progress).
- L1130-1131: job metadata via the API: `backend-tests / Eastwood (changed tests only)`.
- L1135-1136: raw logs with `2>/dev/null`: empty.
- L1140-1141: raw logs to a file: the notice only.
- L1145-1146 (21:02:36): with `--allow-escape-sequences`: the warning.
- Cost: 4 extra calls, under a minute here; the same notice cost a call in another session two weeks later.

## Root cause
gh guards terminal output against escape sequences in API responses and prints a notice to stderr instead of the body; GitHub Actions logs are full of ANSI color codes. The exit status in this case was not captured.

## Why agents fall for it
`gh api ... | grep` is the textbook way to read logs, and agents routinely add `2>/dev/null`, which hides the only explanation.

## Current state
Not checked (gh CLI behaviour).

## Suggested fix
- A small `ci-log <job-id>` helper that passes `--allow-escape-sequences` and strips ANSI codes.
- Read job logs with `gh api .../logs --allow-escape-sequences`, never with `2>/dev/null`.

## Detection signal
`the response contains terminal escape sequences; pass --allow-escape-sequences` in a result or saved file; empty output from `gh api .../actions/jobs/<id>/logs 2>/dev/null | grep`.

## Raw excerpts
```
L1125 [CALL] Bash: cd ~/src/mb/metabase && gh run view <run> --repo metabase/metabase --log-failed 2>&1 | grep -iE "claude_test|error|warning" | head -30
L1126 [RESULT] (Bash completed with no output)
L1131 [RESULT] {"conclusion":"failure","name":"backend-tests / Eastwood (changed tests only)","steps":["Run Eastwood on changed test namespaces"]}
L1135 [CALL] Bash: gh api repos/metabase/metabase/actions/jobs/<id>/logs 2>/dev/null | grep -iE "claude_test|eastwood|:linter|warning|error" | tail -30
L1136 [RESULT] (Bash completed with no output)
L1140 [CALL] Bash: gh api repos/metabase/metabase/actions/jobs/<id>/logs > ~/.claude/jobs/<session>/tmp/eastwood.log 2>&1; wc -l [...]; tail -40 [...]
L1141 [RESULT] 1 ~/.claude/jobs/<session>/tmp/eastwood.log the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway
L1145 [CALL] Bash: gh api repos/metabase/metabase/actions/jobs/<id>/logs --allow-escape-sequences 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' > [...]; grep -nE "claude_test|Eastwood|linter|reflection|warning" [...] | tail -25
L1146 [RESULT] [...] 437:[...] test/metabase/metabot/self/claude_test.clj:346:7: reflection: reference to field close can't be resolved.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/cc241e7a-e140-4ab6-94cb-4cd826d04ab6.jsonl
  lines: 443-466
  date: 2026-09-10
  jev: {any_papercut: 0.72, env_toolchain: 0.87, stale_state: 0.28, verify_mismatch: 0.59, misleading_code: 0.18, hidden_coupling: 0.53, stale_docs: 0.28, tool_footgun: 0.68, flaky: 0.63, agent_bug: 0.49, wasted_effort: 0.41, user_correction: 0.10}

- L444: three `=== job <id>` headers with nothing under them.
- L462: `1 vertica.log` and `the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway`.

- L443-L444: grep over three job logs returns nothing.
- L447-L458: job steps via the API show which step failed.
- L461-L462: log saved to a file is a single line: the refusal.
- L465-L466: re-fetched with `--allow-escape-sequences` and `sed` stripping; errors found.
- Cost: 3 extra calls.

```
L443 [CALL] Bash: for job in 102907560335 102910638726 102907295874; do echo "=== job $job"; gh api repos/metabase/metabase/actions/jobs/$job/logs 2>/dev/null | /usr/bin/grep -iE "FAIL in|expected:|actual:|Error:|assertion|Ran [0-9]+ tests|failures, .* errors" | head -8; done
L444 [RESULT] === job 102907560335 | === job 102910638726 | === job 102907295874
L461 [CALL] Bash: cd <scratchpad> && gh api repos/metabase/metabase/actions/jobs/102907295874/logs > vertica.log 2>&1; wc -l vertica.log; tail -40 vertica.log
L462 [RESULT] 1 vertica.log | the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway
L465 [CALL] Bash: cd <scratchpad> && gh api repos/metabase/metabase/actions/jobs/102907295874/logs --allow-escape-sequences 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' > vertica.log; /usr/bin/grep -nE "FAIL in|ERROR in|expected:|Exception|failures, |Ran [0-9]+ tests" vertica.log | tail -15
L466 [RESULT] 724: ... ERROR in metabase.warehouse-schema.models.field-values-test/detached-fetch!-sweeps-stalled-fetches-test (core.clj:7157) | ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/7e19d6c9-cfc3-46a6-b6db-e21f76a54bfd.jsonl
  lines: 446-474
  date: 2026-09-10
  jev: {any_papercut: 0.72, env_toolchain: 0.74, stale_state: 0.71, verify_mismatch: 0.42, misleading_code: 0.20, hidden_coupling: 0.24, stale_docs: 0.23, tool_footgun: 0.66, flaky: 0.93, agent_bug: 0.19, wasted_effort: 0.52, user_correction: 0.17}

- L447, L451, L466: `(Bash completed with no output)`; L470: `1` line and `the response contains terminal escape sequences`.

- L446-L451: two grep pipelines over `gh run view --log*` print nothing.
- L455-L462: job steps via the API show "Test Postgres Latest" failed.
- L465-L470: log length 1; API refusal visible.
- L473-L474: `--allow-escape-sequences` plus ANSI strip returns the errors.
- Cost: 4 wasted calls.

```
L446 [CALL] Bash: gh run view --job 102835426129 --log-failed 2>&1 | grep -E "failure:|NOT quarantined|VERDICT|FAIL in|expected:|actual:|Exception|Error" | head -30
L447 [RESULT] (Bash completed with no output)
L450 [CALL] Bash: gh run view --job 102835426129 --log 2>&1 | grep -iE "##\[error\]|error:|failed|exception|FAIL in" | ... | head -25
L451 [RESULT] (Bash completed with no output)
L469 [CALL] Bash: gh run view --job 102835426129 --log 2>&1 | wc -l; echo "--- raw log via api ---"; gh api "repos/metabase/metabase/actions/jobs/102835426129/logs" 2>&1 | tail -50
L470 [RESULT] 1 | --- raw log via api --- | the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway
L473 [CALL] Bash: gh api "repos/metabase/metabase/actions/jobs/102835426129/logs" --allow-escape-sequences 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -nE "FAIL|error|Error|Exception|..." | head -30
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/367ade68-abaa-469f-ad27-a55947196cd0.jsonl
  lines: 348-367
  date: 2026-09-10
  jev: {any_papercut: 0.78, env_toolchain: 0.89, stale_state: 0.26, verify_mismatch: 0.93, misleading_code: 0.21, hidden_coupling: 0.32, stale_docs: 0.19, tool_footgun: 0.74, flaky: 0.88, agent_bug: 0.26, wasted_effort: 0.38, user_correction: 0.16}

- L349: `run 34490609242 is still in progress; logs will be available when it is complete`.
- L363: `the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway`.

- L348-L349: `--log-failed` refused while the run is in progress.
- L352-L353: job steps fetched through the API instead.
- L362-L363: raw log fetch refused.
- L366-L367: works with the flag and a sed strip.
- Cost: 2 wasted calls.

```
L348 [CALL] Bash: gh run view --repo metabase/metabase --job 102920143202 --log-failed 2>&1 | tail -60
L349 [RESULT] run 34490609242 is still in progress; logs will be available when it is complete
L362 [CALL] Bash: gh api repos/metabase/metabase/actions/jobs/102920143202/logs 2>&1 | tail -50
L363 [RESULT] the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway
L366 [CALL] Bash: gh api repos/metabase/metabase/actions/jobs/102920143202/logs --allow-escape-sequences 2>/dev/null | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | tail -60
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/79096893-1a0d-4e0e-abc8-cb0026bb1248.jsonl
  lines: 82-120
  date: 2026-09-07
  jev: {any_papercut: 0.70, env_toolchain: 0.88, stale_state: 0.19, verify_mismatch: 0.47, misleading_code: 0.16, hidden_coupling: 0.41, stale_docs: 0.26, tool_footgun: 0.78, flaky: 0.84, agent_bug: 0.24, wasted_effort: 0.60, user_correction: 0.20}

- L83: every run-log line reads `<job name>	UNKNOWN STEP	<timestamp> ...`.
- L99: `1 .../e2e01.log`, `1 .../pgpy.log`, `1 .../sdk19.log`.
- L104: `the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway`.
- L110: `grep: invalid option -- P` (macOS grep).
- L120: the awk filter on step name `Quarantine gate` printed nothing.

- L82-83 (16:23): greps the run log by step; every line is `UNKNOWN STEP`.
- L98-99 (16:23:58): `gh api .../logs > file` x3; each file is one line.
- L103-104: reads the notice, switches to `gh run view --job <id> --log`.
- L109-120 (16:24:30): `grep -P` and a step-name awk filter both fail.
- L127 onward: searches the full text instead.
- Cost: about 5 wasted calls, roughly a minute and a half.

```
L83 [RESULT] sdk-tests / SDK component tests / SDK component tests (React 19)	UNKNOWN STEP	2026-09-07T09:26:15.4274516Z ##[end-action id=[...]
L98 [CALL] Bash: S=<scratchpad>; gh api repos/metabase/metabase/actions/jobs/<id>/logs > $S/e2e01.log 2>&1; [...] wc -l $S/*.log; [...]
L99 [RESULT] 1 <scratchpad>/e2e01.log 1 <scratchpad>/pgpy.log 1 <scratchpad>/sdk19.log 3 total
L104 [RESULT] the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway 4233 <scratchpad>/e2e01.log [...]
L109 [CALL] Bash: [...] /usr/bin/grep -P '\tQuarantine gate\t' $S/e2e01.log | cut -f3- | [...]
L110 [RESULT] ##### STEP NAMES e2e01 ##### Quarantine gate output grep: invalid option -- P
L115 [CALL] Bash: [...] awk -F'\t' '$2=="Quarantine gate"{print $3}' $S/e2e01.log | [...] | head -90
L120 [RESULT] e2e-tests / e2e-group-01-ee / e2e-tests-e2e-group-01-ee	UNKNOWN STEP	[...] Current runner version: '2.337.0' [...] -----
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/450bcb5c-b531-4980-8fad-e6ce15770a1c.jsonl
  lines: 668-704
  date: 2026-08-25
  jev: {any_papercut: 0.82, env_toolchain: 0.72, stale_state: 0.34, verify_mismatch: 0.78, misleading_code: 0.25, hidden_coupling: 0.37, stale_docs: 0.31, tool_footgun: 0.75, flaky: 0.92, agent_bug: 0.22, wasted_effort: 0.66, user_correction: 0.10}

L669 and L692: `(Bash completed with no output)`; L674: `run 32863520325 is still in progress; logs will be available when it is complete`; L698: `the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway ⏎ ---size--- ⏎ 99`.

- L668-L669: `--log-failed` piped to grep, empty.
- L673-L674: unpiped, in-progress refusal.
- L691-L692: `gh api` logs piped to grep, empty.
- L697-L698: head and wc reveal the escape-sequence refusal.
- L703-L704: `--allow-escape-sequences` works.
- Cost: four extra calls; with less persistence "no failure lines" could have been reported.

```
L668 [CALL Bash] gh run view --job 97856344894 --log-failed 2>&1 | grep -iE "[0-9]+ failing|AssertionError|CypressError|Timed out|✖|Running: |test\(s\) failed" | tail -30
L669 [RESULT] (Bash completed with no output)
L673 [CALL Bash] gh run view --job 97856344894 --log-failed 2>&1 | tail -60
L674 [RESULT] run 32863520325 is still in progress; logs will be available when it is complete
L691 [CALL Bash] gh api repos/metabase/metabase/actions/jobs/97856344894/logs 2>&1 | grep -aiE "[0-9]+ failing|AssertionError|CypressError|Timed out retrying|✖ |Running: " | tail -40
L692 [RESULT] (Bash completed with no output)
L698 [RESULT] the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway ⏎ ---size--- ⏎       99
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99.jsonl
  lines: 1659-1665
  date: 2026-09-11
  jev: {any_papercut: 0.88, env_toolchain: 0.89, stale_state: 0.34, verify_mismatch: 0.88, misleading_code: 0.18, hidden_coupling: 0.50, stale_docs: 0.29, tool_footgun: 0.78, flaky: 0.95, agent_bug: 0.84, wasted_effort: 0.38, user_correction: 0.35}

L1660: `prev run: ` (empty) then `gh: Not Found (HTTP 404)`; chunk 2 L1044: `job 103204079267 cannot be rerun`.

- L1659-L1660: short SHA, empty result, 404.
- L1664-L1665: full SHA from `git rev-parse`, run found.
- Chunk 2 L1043-L1049: single-job rerun refused mid-run; background watcher reruns after completion.
- Cost: one retry and a watcher loop.

```
L1659 [CALL Bash] cd ~/src/mb/metabase ⏎ RUN=$(gh api "repos/metabase/metabase/actions/runs?head_sha=6dfd18ce040&per_page=50" --jq '.workflow_runs[] | select(.name=="Run tests") | .id' | head -1) ⏎ echo "prev run: $RUN" ⏎ gh api "repos/metabase/metabase/actions/runs/$RUN/jobs?per_page=100" --paginate --jq '…'
L1660 [RESULT (ERROR)] Exit code 1 ⏎ prev run: ⏎ { ⏎   "message": "Not Found", ⏎   "documentation_url": "https://docs.github.com/rest", ⏎   "status": "404" ⏎ }gh: Not Found (HTTP 404)
L1664 [CALL Bash] … SHA=$(git rev-parse 6dfd18ce040) ⏎ echo "full sha: $SHA" ⏎ RUN=$(gh api "repos/metabase/metabase/actions/runs?head_sha=$SHA&per_page=50" …)
L1665 [RESULT] full sha: 6dfd18ce0402d772f181babbcefd4a4d0183ae8e ⏎ run: 34650994544 ⏎ semantic-search-tests / Postgres 14.x with pgvector pg17 Semantic Search Tests  id=…
chunk2 L1048 (summary) single-job rerun is refused while the overall run is still in progress (`cannot be rerun`)
```
