---
title: Test console log appender is FATAL-only, so "zero warnings in the test output" looks like proof that a warn path never fired
slug: test-log-console-fatal-hides-warnings
kind: misleading-signal
impact: wasted-time
severity: high
status: open  # partly fixed: only metabase.app-db.connection warnings reach the console
area: test_config/log4j2-test.xml; any debugging that greps ./bin/test-agent output for log/warn strings
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 2046-2061, 2219-2232, 2280-2308
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.45, tool_misuse: 0.92, misleading_signal: 0.87, user_correction: 0.29, codebase_trap: 0.92, flailing: 0.81, env_friction: 0.89}
---
## Summary
While hunting a row leak that only showed under `DRIVERS=mysql`, the agent had the right hypothesis: DDL inside a
rollback-only `with-temp` commits implicitly, so the rollback fails and the code logs `Could not roll back a
rollback-only transaction`. It grepped the captured test output for that warning, found 0 hits, and discarded the
hypothesis. The warning had fired every time. `test_config/log4j2-test.xml` gave the Console appender a
`ThresholdFilter level="FATAL"`, so no `log/warn` ever reached stdout. Warnings went only to `logs/test-log.json`.
The agent spent hours on wrong hypotheses: prewarm, `with-model-cleanup`, and cross-thread commits. A subagent then
proved the path fired by adding a `println` at the same catch.

## Symptom
```
L2051 grep -ac "Could not roll back a rollback-only transaction" $SP/repro.log
L2052 [RESULT] === 'Could not roll back a rollback-only transaction' warnings ===
0
=== other rollback warnings ===
0
L2061 [ASSISTANT] No rollback-failure warnings at all — so the DDL-commit path isn't firing, and that hypothesis is wrong too.
```

## Timeline
- L2046-2050: the leak reproduces locally (the test expected 1 transform and found 4).
- L2051-2061: the agent greps `repro.log` for the warning, gets 0, and concludes "the DDL-commit path isn't firing".
- L2062-2098: a bisect and more hypotheses follow. The bisect blames the PR's core commit.
- L2184-2219: the user asks for a subagent. Its report says: "the 'no log strings' check was invalid —
  `test_config/log4j2-test.xml`'s console appender has `ThresholdFilter level="FATAL"`, so the ... warn can never
  appear in test output (my println at the same catch proved the path fires)".
- L2222-2232: the agent confirms it: `7: <ThresholdFilter level="FATAL" onMatch="ACCEPT" onMismatch="DENY"/>`.
  "I treated absence of evidence as evidence of absence, and it pointed me away from the correct answer for hours."
- L2283-2308: the user approves fix #1. The agent adds a `WarnConsole` appender for `metabase.app-db.connection` and
  notes that the warning still goes to `logs/test-log.json` at INFO.

## Root cause
The suite is noisy, so console logging is FATAL-only. Nothing in the test output says that logging is suppressed.
An agent that greps for a log line cannot tell "never logged" apart from "logged and filtered".

## Why agents fall for it
Grepping the output for a message is the natural way to check whether a code path ran. With a FATAL-only console
it is a guaranteed false negative for warn, info and debug. `logs/test-log.json` is written with `append="false"`,
so the next run overwrites it. Nothing on screen points to that file.

## Current state
Partly fixed on master. `test_config/log4j2-test.xml:12` adds a `WarnConsole` (WARN threshold), and a dedicated
`<Logger name="metabase.app-db.connection" ... additivity="false">` routes to it (around line 36-40). All other
namespaces still log to the FATAL-only Console (line 7). Warnings from any other namespace are still invisible in
test output. Also on master: the rollback-only failure now throws when `config/is-test?`
(`src/metabase/app_db/connection.clj:378`), so this path is no longer silent. No CLAUDE.md or memory entry says that
test stdout is FATAL-only or that `logs/test-log.json` has the INFO+ stream.

## Suggested fix
- Document this in CLAUDE.md "Running Backend Tests": test stdout shows FATAL only; use `logs/test-log.json` (JSON
  lines, INFO+, overwritten each run) to check whether a log line fired.
- Have `./bin/test-agent` print a footer such as `logs: logs/test-log.json (N WARN, M ERROR)` so the channel is
  discoverable.
- Or let the threshold be overridden per run, for example `MB_TEST_CONSOLE_LOG_LEVEL=warn`.

## Detection signal
In a transcript: a grep of test-agent output for a log message that returns 0, followed by "path isn't firing" or
"hypothesis is wrong". A hook could flag `grep ... <test output>` for strings that match a `log/warn` or `log/info`
call site in src.

## Raw excerpts
```
L2219 (subagent result) **Why the earlier "disproofs" misled:** (a) the "no log strings" check was invalid —
`test_config/log4j2-test.xml`'s console appender has `ThresholdFilter level="FATAL"`, so the `Could not roll back a
rollback-only transaction` warn can never appear in test output (my println at the same catch proved the path fires)
...
L2258 [ASSISTANT] ## Why I lost the thread
My "the DDL path isn't firing — zero warnings in the log" check was **invalid**. `test_config/log4j2-test.xml` puts a
`ThresholdFilter level="FATAL"` on the console appender, so a `warn` can never appear in test output. I treated
absence of evidence as evidence of absence, and it pointed me away from the correct answer for hours.
L2293 [ASSISTANT] The warning isn't lost — it goes to `logs/test-log.json` via the File appender at INFO. It's only the
*console* that's FATAL-only, which is why it never reached CI output. Adding a targeted appender.
```
