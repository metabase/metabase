---
title: Running Metabase backend tests as raw `clojure -X:dev:test` into a log file writes the progress bar's carriage returns and ANSI colours into it, so grepping for failures returned 90 KB of noise, although the repo's `./bin/test-agent` exists for exactly this
slug: raw-clojure-test-run-ansi-hides-failures
kind: tool-quirk
impact: wasted-time
severity: medium
status: documented-still-hit # a local note covered it
area: metabase test runner progress reporter, `clojure -X:dev:test`, `./bin/test-agent`, log files under /tmp
merged_from: devenv-doc-teaches-raw-test-runner, raw-clojure-test-run-writes-progress-bar-log
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/dcbc556d-c81c-4160-af67-238040132220.jsonl
    lines: 458-565
    date: 2026-09-11
    jev: {any_papercut: 0.78, env_toolchain: 0.83, stale_state: 0.18, verify_mismatch: 0.34, misleading_code: 0.45, hidden_coupling: 0.55, stale_docs: 0.25, tool_footgun: 0.62, flaky: 0.60, agent_bug: 0.85, wasted_effort: 0.44, user_correction: 0.14}
---
## Summary
Addressing review feedback from a worktree, the agent ran five backend test batches as `mise exec -- clojure -X:dev:test :only '[...]' > /tmp/mbtestN.log` within ten minutes. The default reporter draws a progress bar with `\r` and colours every line, so `grep -n 'FAIL in|expected:|actual:'` returned coloured fragments, a `sed | cat -v` read produced 91 KB, a context grep 89.9 KB, and only `cat -v | sed (strip ANSI) | tr '\r' '\n' | grep -v ETA:` made the two failures readable. The repo's CLAUDE.md has said since March 2026 not to call `clj -X:dev:test` directly and to use `./bin/test-agent` (plain text, no progress bar); the agent switched to it 40 minutes later.

## Symptom
L544-L545 grep hits are colour-code fragments (`20:expected: (str/includes?`, `31:expected: false`). L548-L549 and L556-L557 the reads come back as 'Output too large (91.2KB)' and '(89.9KB)', full of `^M  5/178  2% [= ... ] ETA: 07:24`. L564-L565 only the `tr '\r' '\n' | grep -v ETA:` pipeline shows the failing assertion.

## Timeline
- 08:00:04 L458-L464 checks `./bin/mage run-tests -h` and looks for an nREPL port; none.
- 08:00:18 L473 first raw run into /tmp/mbtest1.log (backgrounded).
- 08:01:42-08:01:54 L544-L565 four attempts to read two failures.
- 08:06-08:11 L660, L719, L790, L872 four more raw runs, each read through the same cleanup pipeline (L754-L779, L815).
- 08:40:39 L1077 first `./bin/test-agent` run; the rest of the session uses it.
- Cost: about ten extra log-cleanup calls and two oversized tool outputs spilled to disk.

## Root cause
The default reporter assumes an interactive terminal and does not switch to plain output when stdout is a file. `./bin/test-agent` sets `HAWK_MODE=cli/ci` and strips ANSI, but agents reach for the alias they know. The session ran from a directory above the checkout, and the repo's CLAUDE.md only enters context once files in the repo are read.

## Why agents fall for it
`clojure -X:dev:test :only` is the command in most docs and in the agent's prior. Nothing errors, the output is just unreadable, so there is no prompt to look for a better runner.

## Current state
Checked origin/master: CLAUDE.md 'Running Backend Tests' says 'do not fall back to `clj -X:dev:test` directly ... use `./bin/test-agent`' (present since 2026-03-13, also on 2026-09-11); `bin/test-agent` exports `HAWK_MODE=cli/ci` and strips ANSI.

## Suggested fix
- Make the default reporter fall back to plain output when stdout is not a TTY (or when `CI` is set), so the raw alias is safe too.
- Point `./bin/mage run-tests -h` at test-agent for non-interactive use.

## Detection signal
Command text `clojure -X:dev:test` or `clj -X:dev:test` redirected to a file; follow-ups with `tr '\r' '\n'`, `cat -v`, or ANSI-stripping `sed` on a test log; 'Output too large' when reading a test log.

## Raw excerpts
```
L458 [CALL] ./bin/mage run-tests -h 2>&1 | head -30
L473 [CALL] cd ~/src/mb/wt/<branch> && (mise exec -- clojure -X:dev:test :only '[metabase.query-permissions.impl-test metabase.metabot.tools.shared.content-store-test ...]' > /tmp/mbtest1.log 2>&1; echo "EXIT=$?" >> /tmp/mbtest1.log)
L544 [CALL] /usr/bin/grep -n "FAIL in\|expected:\|actual:" /tmp/mbtest1.log | head -40
L545 [RESULT] 20:expected: [1;31m([0m[1;34mstr/includes?[0m 23:  actual: [1;31m([0m[1;34mnot[0m 31:expected: [32mfalse[0m 32:  actual: [32mfalse[0m
L548 [CALL] sed -n '1,45p' /tmp/mbtest1.log | cat -v | sed 's/\^\[\[[0-9;]*m//g'
L549 [RESULT] <persisted-output> Output too large (91.2KB). ...
L556 [CALL] cat -v /tmp/mbtest1.log | sed 's/\^\[\[[0-9;]*m//g' | /usr/bin/grep -n -B 12 -A 20 "^expected:" | head -90
L557 [RESULT] <persisted-output> Output too large (89.9KB). ... 12-^M  0/178     0% [                                                  ]  ETA: --:--Placeholder until other ch ...
L564 [CALL] cat -v /tmp/mbtest1.log | sed 's/\^\[\[[0-9;]*m//g' | tr '\r' '\n' | /usr/bin/grep -v "ETA:" | /usr/bin/grep -n -B 8 -A 18 "^expected:" | head -80
L565 [RESULT] ... 17- a tool-written chart refuses without an audit trail 18:expected: (str/includes? 19-           (:output result) ...
L1077 [CALL] (./bin/test-agent :only '[metabase.query-permissions.impl-test ...]' > /tmp/mbtest5.log 2>&1; echo "EXIT=$?" >> /tmp/mbtest5.log)
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/8c776c72-ae8d-4ded-9d94-9661894ad0b6/subagents/agent-ac3e6b2d811e099e8.jsonl
  lines: 46-169
  date: 2026-09-04
  jev: {any_papercut: 0.92, env_toolchain: 0.95, stale_state: 0.57, verify_mismatch: 0.82, misleading_code: 0.36, hidden_coupling: 0.68, stale_docs: 0.25, tool_footgun: 0.89, flaky: 0.54, agent_bug: 0.52, wasted_effort: 0.80, user_correction: 0.06}

- L156: summary `1311 assertions, 2 failures, 0 errors` with no FAIL line despite `rg "...|FAIL|ERROR in|..."`.
- L163: after the rerun, `rg -n --text "FAIL in|ERROR in"` over the saved log prints nothing.

- L46-L47: reads devenv.md for the test command.
- L153-L156: 11 namespaces run through `rg` filters; failures counted but not shown.
- L161: the agent notices its filtering dropped the FAIL lines and reruns to capture the full log.
- L162-L163: rerun (about 45 s of tests) into a log; `FAIL in` still does not match.
- L167-L169: the agent finds ANSI codes between `FAIL` and `in`, strips escapes and finds the two failures.
- Cost: one duplicate test run and 3 extra calls; a less careful agent could have reported green from the filtered view.

```
L46 [CALL] Bash: cd ~/src/mb/metabase && echo "--- how to run backend tests (devenv.md) ---" && grep -n -i -B2 -A8 "clojure -X:dev:test\|:only\|..." docs/developers-guide/devenv.md ...
L47 [RESULT] --- how to run backend tests (devenv.md) --- | 308-''' | 309-# OSS tests only | 310:clojure -X:dev:test | ... | 320:clojure -X:dev:test :only metabase.session.api-test ...
L153 [CALL] Bash: ... mise exec -- clojure -X:dev:ee:ee-dev:test :only '[...11 namespaces...]' 2>&1 | rg -v "Reflection warning|..." | rg "Running [0-9]+ tests|FAIL|ERROR in|Ran [0-9]+ tests|assertions|..." | head -40
L156 [RESULT] Running 364 tests | Ran 364 tests in 19.275 seconds | \x1b[31m1311 assertions, 2 failures, 0 errors.\x1b[m | ... | Tests failed.
L163 [RESULT] exit=1 | --- failure detail ---
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ac37fe71-7046-48c1-885f-5bf5d9754c26.jsonl
  lines: 1712-1762
  date: 2026-09-10
  jev: {any_papercut: 0.85, env_toolchain: 0.90, stale_state: 0.26, verify_mismatch: 0.79, misleading_code: 0.40, hidden_coupling: 0.82, stale_docs: 0.34, tool_footgun: 0.60, flaky: 0.47, agent_bug: 0.93, wasted_effort: 0.66, user_correction: 0.07}

- L1713: tail shows `actual: [36m0.0[0m` and progress bars.
- L1753: `grep -E "FAIL in"` output is empty ("Bash completed with no output") on a failing run.
- L1762: after stripping ANSI codes, `FAIL in metabase.analytics.llm-token-usage-test/track-token-usage!-test (llm_token_usage_test.clj:185)`.

- L1712-L1713: first run, unreadable tail.
- L1723-L1724: grep for "actual:" shows coloured maps.
- L1752-L1753: grep for "FAIL in" finds nothing.
- L1756-L1762: more greps, then ANSI stripping finds the failing tests.
- Cost: 4 extra full test runs (each a JVM start plus about 20 s of tests) to read one result.

```
L1712 [CALL] Bash: cd ~/src/mb/wt/<branch> && timeout 3000 clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test :only '[metabase-enterprise.metabot.usage-test metabase.analytics.llm-token-usage-test]' 2>&1 | tail -12
L1713 [RESULT] actual: [36m0.0[0m | | 34/35 97% [[31m================================================ [m] ETA: 00:00 | ...
L1752 [CALL] Bash: cd ~/src/mb/wt/<branch> && timeout 3000 clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test :only '[...]' 2>&1 | /usr/bin/grep -E "FAIL in" -A 6 | head -25
L1753 [RESULT] (Bash completed with no output)
L1761 [CALL] Bash: ... clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test :only '[...]' 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | /usr/bin/grep -E "FAIL in|llm_token_usage_test.clj:[0-9]+" | head -6
L1762 [RESULT] 0/35 0% [ ] ETA: --:-- | 1/35 2% [= ] ETA: 03:24 | ... | FAIL in metabase.analytics.llm-token-usage-test/track-token-usage!-test (llm_token_usage_test.clj:185)
```
