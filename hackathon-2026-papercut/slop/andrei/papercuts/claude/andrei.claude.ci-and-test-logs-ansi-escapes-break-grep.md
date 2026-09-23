---
title: Metabase test output carries ANSI color codes between words even in CI logs and redirected files (`ESC[31mERROR ESC[m in ...`), so `grep 'FAIL in\|ERROR in'` silently matches nothing and the failure detail looks missing
slug: ci-and-test-logs-ansi-escapes-break-grep
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: metabase test reporter output (`clojure -X:dev:test`, mb.hawk), GitHub Actions job logs via `gh run view --log-failed`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/31e1a415-680c-4ede-a3d2-fbb1d6e6a89c/subagents/agent-ac949dc44885b8ee9.jsonl
    lines: 82-101
    date: 2026-08-26
    jev: {any_papercut: 0.78, env_toolchain: 0.91, stale_state: 0.12, verify_mismatch: 0.68, misleading_code: 0.23, hidden_coupling: 0.39, stale_docs: 0.41, tool_footgun: 0.63, flaky: 0.81, agent_bug: 0.13, wasted_effort: 0.55, user_correction: 0.08}
---
## Summary
Triaging a red SQL Server driver job, the subagent grepped the failed-job log for `FAIL in|ERROR in|expected:|actual:` and got nothing. Four more greps (for `fail`, `Tests failed`, a timestamp window) produced runner noise and the summary `13830 assertions, 0 failures, 1 error.`. The actual `ERROR in metabase.driver-test/check-can-connect-before-sync-test` line only appeared when it dumped a raw range of the log, showing `^[[31mERROR^[[m in`.

## Symptom
- L82-L83: `gh run view --log-failed --job=<id> | grep -E "FAIL in|ERROR in|expected:|actual:"` → no output.
- L86-L95: broader greps return curl/Clojure-install retry lines.
- L97-L98: `^[[31m13830 assertions, 0 failures, 1 error.^[[m`.
- L100-L101: `^[[31mERROR^[[m in ^[[37mmetabase.driver-test/^[[34mcheck-can-connect-before-sync-test^[[m (load_data.clj:307)`.

## Timeline
- L82-L83: targeted grep, empty.
- L86-L88: broad grep, noise.
- L91-L92: `Tests failed.` only.
- L94-L95: log saved, broad grep, noise.
- L97-L98: timestamp window finds the colored summary.
- L100-L101: raw range finds the colored ERROR line.
- Cost: 6 calls to find one error line.

## Root cause
The test reporter colors the `FAIL`/`ERROR` token and the test name separately, so an escape sequence sits between `ERROR` and ` in`, and it does so when stdout is a file or a CI log, not only a terminal. GitHub runner echo lines add their own escapes. Whether the reporter honours `NO_COLOR` is unknown.

## Why agents fall for it
Escape codes are invisible in most renderings. An empty grep reads as 'no such line', not 'pattern split by escapes', and the colored summary line (`N assertions, 0 failures, 1 error.`) still matches looser patterns, so the agent knows something failed but cannot find what.

## Current state
Checked origin/master: tests run through `io.github.metabase/hawk` 1.0.19 (`deps.edn`, `:exec-fn mb.hawk.core/find-and-run-tests-cli`); nothing in `deps.edn` or the workflows turns color off. Not checked whether hawk honours `NO_COLOR`.

## Suggested fix
- Emit plain text when stdout is not a TTY, or when `CI`/`NO_COLOR` is set, in the test reporter.
- Until then, document the strip step next to the test commands agents use: `sed 's/\x1b\[[0-9;]*m//g' <log> | grep -a 'FAIL in\|ERROR in'`.

## Detection signal
An empty result from grepping a test log for `FAIL in`/`ERROR in` when the log's summary says `[1-9][0-9]* (failures|errors?)`; `^[[31m` or `\x1b[31m` visible in tool output.

## Raw excerpts
```
L82 [CALL] cd ~/src/mb/wt/<worktree> && gh run view --log-failed --job=97578545151 2>/dev/null | grep -E "FAIL in|ERROR in|expected:|actual:" | sort -u | head -25
L83 [RESULT] (Bash completed with no output)
L86 [CALL] ... gh run view --log-failed --job=97578545151 2>/dev/null | grep -iE "fail|assert" | grep -v "Downloading\|Uploading" | head -15
L88 [RESULT] driver-tests / SQL Server 2022 Driver Tests	UNKNOWN STEP	...Z ^[[36;1m  curl --retry 3 --retry-delay 5 --fail -O https://download.clojure.org/install/linux-install-1.12.0.1488.sh \^[[0m | ...
L91 [CALL] ... | grep -E "FAIL in \(|ERROR in \(|Tests failed|[0-9]+ failures, [0-9]+ errors" | head -10
L92 [RESULT] driver-tests / SQL Server 2022 Driver Tests	UNKNOWN STEP	2026-08-24T20:37:47.9210379Z Tests failed.
L97 [CALL] grep -n "20:37:4" /tmp/sqlserver-log.txt | head -40 | sed 's/driver-tests \/ SQL Server 2022 Driver Tests\tUNKNOWN STEP\t//' | cut -c1-200
L98 [RESULT] 813:...Z Ran 3523 tests in 812.578 seconds | 814:...Z ^[[31m13830 assertions, 0 failures, 1 error.^[[m | ...
L100 [CALL] sed -n '700,812p' /tmp/sqlserver-log.txt | ... | grep -iE "error|test|exception|metabase" | head -25
L101 [RESULT] 2026-08-24T20:28:24.0567559Z ^[[31mERROR^[[m in ^[[37mmetabase.driver-test/^[[34mcheck-can-connect-before-sync-test^[[m (^[[3mload_data.clj:307^[[m) | ...Uncaught exception, not in assertion.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/9e38f5be-3bf9-4dc3-bc55-e7013bc8dcbb.jsonl
  lines: 583-640
  date: 2026-09-05
  jev: {any_papercut: 0.87, env_toolchain: 0.88, stale_state: 0.16, verify_mismatch: 0.30, misleading_code: 0.19, hidden_coupling: 0.47, stale_docs: 0.33, tool_footgun: 0.84, flaky: 0.30, agent_bug: 0.93, wasted_effort: 0.55, user_correction: 0.30}

- L583: summary grep with `FAIL in|ERROR in` over the test log.
- L611: `90 assertions, 0 failures, 1 error.` (colored).
- L629-L630: `/usr/bin/grep -n -A14 'ERROR in' <log>` → no output.
- L634-L635: `[31mERROR[m in [37mmetabase.cmd.copy-test/[34mcopy-metabot-permissions-test[m ([3mjdbc.clj:826[m)`.

- L583-L611: runs finish with one error on both editions.
- L629-L630: targeted grep, empty.
- L634-L635: broad grep shows the colored line.
- L640: diagnosis and fix.
- Cost: 1 extra call here; the same pattern was used for every run in the session and could never have shown a FAIL or ERROR detail line.

```
L583 [CALL] clojure -X:dev:test :only metabase.cmd.copy-test > <scratchpad>/oss-r3.log 2>&1; echo "exit=$?"; /usr/bin/grep -E 'Ran [0-9]+ tests|FAIL in|ERROR in|expected:|actual:|failures|already closed' <scratchpad>/oss-r3.log | head
L611 [RESULT] --- by2wpyuoa | Ran 4 tests in 21.220 seconds | [31m90 assertions, 0 failures, 1 error.[m | ...
L629 [CALL] /usr/bin/grep -n -A14 'ERROR in' <scratchpad>/oss-r3.log | head -30
L630 [RESULT] (Bash completed with no output)
L634 [CALL] f=<scratchpad>/oss-r3.log; /usr/bin/grep -n -i 'error\|exception' $f | /usr/bin/grep -v 'Error during\|debugf' | head -12; ...
L635 [RESULT] 14: | 0/4     0% [...]  ETA: --:-- | [31mERROR[m in [37mmetabase.cmd.copy-test/[34mcopy-metabot-permissions-test[m ([3mjdbc.clj:826[m) | 15:Uncaught exception, not in assertion.
```
