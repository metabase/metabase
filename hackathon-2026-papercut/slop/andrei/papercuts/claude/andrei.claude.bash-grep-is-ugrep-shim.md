---
title: Bare `grep` in the Bash tool is a shell function running ugrep with `-I`, so on a CI log containing a stray binary byte it prints nothing and exits 1; the agent read that as 'no FAIL/ERROR lines' until `/usr/bin/grep -a` found them
slug: bash-grep-is-ugrep-shim
kind: tool-quirk
impact: wasted-time
severity: medium
status: documented-still-hit # a local note covered it
area: Claude Code Bash tool `grep` function (ugrep `-G --ignore-files --hidden -I`), GitHub Actions job logs saved to files
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/17ced372-740e-4ab7-a0be-3ea30f2f9a1c.jsonl
    lines: 139-156
    date: 2026-09-07
    jev: {any_papercut: 0.93, env_toolchain: 0.42, stale_state: 0.72, verify_mismatch: 0.38, misleading_code: 0.25, hidden_coupling: 0.44, stale_docs: 0.20, tool_footgun: 0.94, flaky: 0.94, agent_bug: 0.62, wasted_effort: 0.81, user_correction: 0.92}
---
## Summary
Two red driver jobs had 1.7 MB logs saved to files. `grep -nE "FAIL in |ERROR in |Ran [0-9]+ tests|assertions, |##\[error\]" j<id>.log` printed nothing for both, which would mean the jobs failed without any test failure. `/usr/bin/grep` answered `Binary file (standard input) matches`, and `/usr/bin/grep -a` then found a database-routing e2e FAIL and a BigQuery FAIL.

## Symptom
- L139-L140: bare grep over both logs prints only the headers.
- L143-L144: `tail -30` shows the logs are there (1695285 bytes).
- L151-L152: `/usr/bin/grep -nE ...` → `Binary file (standard input) matches` for both.
- L155-L156: `/usr/bin/grep -a -nE ...` → `720:... FAIL in metabase-enterprise.database-routing.e2e-test/db-routing-e2e-test (e2e_test.clj:473)`, `753:... FAIL in metabase.driver.bigquery-cloud-sdk-test/...`.

## Timeline
- L139-L140: empty result.
- L143-L144: sanity check with tail.
- L151-L152: system grep reports a binary match.
- L155-L156: `-a` finds the failures.
- Cost: 3 extra calls; trusting the first result would have turned two real failures into 'infra problem, no test failed'.

## Root cause
`type grep` in the tool shell shows a function from the session's zsh snapshot that runs the Claude binary as `ugrep -G --ignore-files --hidden -I ...`. `-I` skips files it considers binary without any message (and `--ignore-files` skips gitignored paths in recursive searches). The saved CI log contains at least one byte that makes it look binary; GNU grep says so and needs `-a`. Reproduced in a scratch dir: a two-line file with one NUL byte gives no output and exit 1 from the `grep` function, and `Binary file ... matches` from `/usr/bin/grep`.

## Why agents fall for it
Empty output with no error is the normal 'not found' signal, and the shim only shows itself via `type grep`. The agent used `/usr/bin/grep` in other commands of the same session and still reached for bare grep on a file.

## Current state
Tooling, not repo code. Checked locally: the grep function in the current zsh snapshot still passes `-I` and `--ignore-files`.

## Suggested fix
- Drop `-I` from the shim, or print a line when a file is skipped as binary.
- Until then, alias `grep` to `/usr/bin/grep` in the tool shell for this workspace, or have a PreToolUse hook rewrite bare `grep` with file arguments.
- Strip NUL and control bytes when saving CI logs (`tr -d '\000'`), so both greps see text.

## Detection signal
A bare `grep` on a file returning nothing, followed within a few calls by `/usr/bin/grep` or `grep -a` on the same file returning matches; `Binary file (standard input) matches` in any result.

## Raw excerpts
```
L139 [CALL] cd <scratchpad> | for id in 101820588802 101820589174; do | echo "######## job $id ########" | ./joblog.sh $id > j$id.log 2>/dev/null | grep -nE "FAIL in |ERROR in |Ran [0-9]+ tests|assertions, |##\[error\]" j$id.log | head -20 | done
L140 [RESULT] ######## job 101820588802 ######## | ######## job 101820589174 ######## | Shell cwd was reset to ~/src/mb
L143 [CALL] ... echo "######## job $id (size $(wc -c < j$id.log)) ########" | tail -30 j$id.log ...
L144 [RESULT] ######## job 101820588802 (size  1695285) ######## | ...Z Temporarily overriding HOME=... | ...
L151 [CALL] ... /usr/bin/grep -nE "error|Error|FAIL|fail" j$id.log | /usr/bin/grep -viE "error-type|errors: 0|:error|error_|log/error|error!" | tail -25 ...
L152 [RESULT] ######## job 101820588802 ######## | Binary file (standard input) matches | ######## job 101820589174 ######## | Binary file (standard input) matches
L155 [CALL] ... /usr/bin/grep -a -nE "FAIL in |ERROR in |Ran [0-9]+ tests|assertions, |##\[error\]|Exception in thread|Syntax error|Unable to resolve" j$id.log | tail -25 ...
L156 [RESULT] ######## job 101820588802 ######## | 720:2026-09-07T17:30:48.8007327Z FAIL in metabase-enterprise.database-routing.e2e-test/db-routing-e2e-test (e2e_test.clj:473) | 753:2026-09-07T17:34:54.9344350Z FAIL in metabase.driver.bigquery-cloud-sdk-test/later-page-fetch-returns-nil-test (bigquery_cloud_sdk_test.clj:1373) | ...
```
