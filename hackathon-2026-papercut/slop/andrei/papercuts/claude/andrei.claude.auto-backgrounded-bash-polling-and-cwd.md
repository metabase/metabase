---
title: Told that `sleep` is blocked and to use an until-loop, a review orchestrator ran `until [ -s <background task output> ]` in the foreground and stayed blocked for the full 600 s timeout while its two lens subagents' completion notices queued behind it
slug: auto-backgrounded-bash-polling-and-cwd
kind: env-friction
impact: wasted-time
severity: medium
status: open
area: Bash tool sleep block and hint, auto-backgrounded commands, 600 s foreground timeout, subagent task notifications
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/31c858da-b01f-4914-87ef-7f7df04bd7c0/subagents/agent-a081e5c29fa5d1099.jsonl
    lines: 430-458
    date: 2026-09-14
    jev: {any_papercut: 0.82, env_toolchain: 0.62, stale_state: 0.30, verify_mismatch: 0.80, misleading_code: 0.55, hidden_coupling: 0.74, stale_docs: 0.37, tool_footgun: 0.81, flaky: 0.70, agent_bug: 0.74, wasted_effort: 0.64, user_correction: 0.18}
---
## Summary
A review subagent wanted to wait for two lens subagents it had launched in the background. `sleep 60` was blocked with the hint to use an until-loop. Its first until-loop, on the lens transcripts' mtimes, was auto-backgrounded, so it then waited in the foreground for that background job's output file to become non-empty. The file is written only when the job ends, so the call ran to the 600 s timeout, and both lens completion notices (12:13:07 and 12:15:46) were delivered only after it returned.

## Symptom
L430-L431 `sleep 60; ls ...` blocked: 'To wait for a condition, use Monitor with an until-loop'. L447-L448 the mtime until-loop returned at once as background task `b2cjnmy63`. L455 `until [ -s <tasks>/b2cjnmy63.output ]; do sleep 5; done` started at 12:05:51; L456 at 12:15:51: 'Command did not complete within its 600s timeout and was moved to the background'. L457-L458 the queued notifications for both lens agents surface only then.

## Timeline
- 12:04:20 L430-L431 `sleep 60` blocked with the Monitor/until-loop hint.
- 12:05:10 L447-L448 until-loop on transcript mtimes, auto-backgrounded.
- 12:05:51 L455 foreground until-loop on the background task's output file.
- 12:13:07 and 12:15:46 both lens agents finish; notifications queue.
- 12:15:51 L456 foreground call times out; L457-L458 notifications delivered; the review resumes.
- Same session: agent-a26424f0417d4520b L421-L430 a foreground until-loop hit the 600 s cap while a long database query ran and the query had to be cancelled; agent-ad6dd18c355655af0 L446 blocked `sleep 45`, then L494-L495 another 600 s until-loop timeout.
- Cost: about 10 minutes of a blocked orchestrator per incident.

## Root cause
The harness blocks `sleep`, recommends until-loops, auto-backgrounds some long commands, and caps foreground commands at 600 s. Background subagent completions are delivered between tool calls, so a long foreground wait delays them. Unknown: the rule that decides which commands are auto-backgrounded.

## Why agents fall for it
The block message itself recommends an until-loop, and nothing says that background subagents and shells notify on completion without any polling. An empty output file for a running background job looks like a valid readiness condition.

## Current state
Not checked (harness behaviour).

## Suggested fix
- Say in the sleep-block message that background subagents and shells send a notification on completion, and that a foreground wait delays those notifications.
- Refuse or warn on foreground until-loops whose condition reads a background task's `tasks/*.output` file.
- Let a pending subagent notification interrupt a blocked foreground Bash wait, or cap such loops at a much shorter timeout.

## Detection signal
A Bash call containing `until` and `sleep` whose result is 'did not complete within its 600s timeout'; queued task-notification attachments timestamped inside that window; `until [ -s .../tasks/<id>.output ]`.

## Raw excerpts
```
L430 [CALL] sleep 60; ls -la <transcripts>/subagents/ | /usr/bin/grep -E "a5eb76|a3acac"
L431 [RESULT (ERROR)] <tool_use_error>Blocked: sleep 60 followed by: ls -la ... To wait for a condition, use Monitor with an until-loop (e.g. `until <check>; do sleep 2; done`). To wait for a command you started, use run_in_background: true. Do not chain shorter sleeps to work around this block.</tool_use_error>
L447 [CALL] D=<transcripts>/subagents; until [ $(( $(date +%s) - $(stat -f %m $D/agent-a5eb76cc3de563cdc.jsonl) )) -gt 90 ] && [ $(( $(date +%s) - $(stat -f %m $D/agent-a3acac0cff5341e71.jsonl) )) -gt 90 ]; do sleep 5; done; echo "both agent transcripts idle for 90s"
L448 [RESULT] Command running in background with ID: b2cjnmy63. Output is being written to: <tasks>/b2cjnmy63.output. You will be notified when it completes.
L455 [CALL] until [ -s <tasks>/b2cjnmy63.output ]; do sleep 5; done; cat <tasks>/b2cjnmy63.output
L456 [RESULT] Command did not complete within its 600s timeout and was moved to the background (ID: bmwud9pqk).
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-af57a8eefaff9d874.jsonl
  lines: 546-577
  date: 2026-09-17
  jev: {any_papercut: 0.74, env_toolchain: 0.57, stale_state: 0.34, verify_mismatch: 0.93, misleading_code: 0.20, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.45, flaky: 0.85, agent_bug: 0.20, wasted_effort: 0.71, user_correction: 0.15}

agent-af57 L559, L563, L570: 'Command did not complete within its 600s timeout and was moved to the background (ID: ...)' for loops that only waited on `-s` of another task's output file.

- agent-af57 L546-L547: the CI wait loop is backgrounded.
- agent-af57 L558-L570: three more loops wait on that task's output file; each is backgrounded.
- agent-af57 L576-L577: the first task's output is read, 24 minutes after it started.
- agent-a342 L1168-L1243 and agent-a632 L414-L415: the same pattern while waiting on CI.
- Cost: several extra calls per CI wait and a trail of task IDs to track; no wrong result observed.

```
L546 [CALL] Bash: until s=$(gh pr checks 82639 -R metabase/metabase --json name,bucket 2>/dev/null) && { jq -e 'any(.[]; .bucket=="fail")' <<<"$s" >/dev/null ||
L547 [RESULT] Command running in background with ID: bgkq3gzsz. Output is being written to: <tasks>/bgkq3gzsz.output. You will be notified when it completes. To check interim output, use Read on that file path.
L558 [CALL] Bash: until [ -s <tasks>/bgkq3gzsz.output ]; do sleep 30; done; cat <tasks>/bgkq3gzsz.output
L559 [RESULT] Command running in background with ID: bnobfchal. Output is being written to: <tasks>/bnobfchal.output. You will be notified when it completes. To check interim output, use Read on that file path.
L562 [CALL] Bash: until [ -s <tasks>/bgkq3gzsz.output ]; do sleep 20; done; cat <tasks>/bgkq3gzsz.output
L563 [RESULT] Command did not complete within its 600s timeout and was moved to the background (ID: blh8ktggi). Output is being written to: <tasks>/blh8ktggi.output. You will be notified when it completes. To check interim output,
L569 [CALL] Bash: until [ -s <tasks>/bgkq3gzsz.output ]; do sleep 20; done; cat <tasks>/bgkq3gzsz.output
L570 [RESULT] Command did not complete within its 590s timeout and was moved to the background (ID: bhgyd3ff4). Output is being written to: <tasks>/bhgyd3ff4.output. You will be notified when it completes. To check interim output,
L576 [CALL] Bash: until [ -s <tasks>/bgkq3gzsz.output ]; do sleep 20; done; cat <tasks>/bgkq3gzsz.output
L577 [RESULT] pass: 142, skipping: 62
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501/subagents/agent-a1516fbd08d9d497a.jsonl
  lines: 341-402
  date: 2026-08-27
  jev: {any_papercut: 0.78, env_toolchain: 0.36, stale_state: 0.22, verify_mismatch: 0.55, misleading_code: 0.48, hidden_coupling: 0.83, stale_docs: 0.32, tool_footgun: 0.67, flaky: 0.33, agent_bug: 0.86, wasted_effort: 0.48, user_correction: 0.85}

L393-L394: a busy-wait loop with no sleep printed a half-written log line. L398-L399: the `until` wait loop came back as "Command running in background with ID". L401: the turn ends with a status line about waiting on the two full Eastwood src runs. L402: the coordinator reads that as stopping before reporting, assumes the Eastwood runs are no longer in flight and asks for a re-run of whatever did not complete.

- L341 (13:12 UTC): two whole-tree Eastwood runs chained in one command, auto-backgrounded.
- L393-L394 (13:17): 12 greps in a row without sleep, second log not started yet.
- L396-L399: loads Monitor, then runs an `until` loop in Bash anyway; it is backgrounded too.
- L401: turn ends with a status line instead of a report.
- Parent (main transcript L730-L736, 13:17): reads the completion as "stopped before reporting", resumes the subagent with instructions to re-run.
- Parent L752-L760: subagent re-runs scoped Eastwood gates and reports; parent tells the user the whole-tree gate was only covered at narrower scope.
- Parent L777 (13:25): addendum, the original background runs did finish, 0/0 on 1900 namespaces.
- Earlier, parent L1003-L1004: `sleep 90; cat <output>` blocked by the harness while a health poll was already backgrounded.
- Cost: one extra parent round trip, two redundant scoped Eastwood runs (a few minutes), and a caveat about gate coverage sent to the user that turned out to be wrong.

```
L393 [CALL] Bash: sleep_done=0; for i in 1 2 3 4 5 6 7 8 9 10 11 12; do if grep -q "Warnings:" $CLAUDE_JOB_DIR/tmp/eastwood-src-up.log 2>/dev/null; then break; fi; done; tail -1 $CLAUDE_JOB_DIR/tmp/eastwood-src-mw.log; tail -1 $CLAUDE_JOB_DIR/tmp/eastwood-src-up.log 2>/dev/null || echo "second not started yet"
L394 [RESULT] == Linting metabase.indexed-entities.task.index-values == | second not started yet
L398 [CALL] Bash: until grep -q "Warnings:" $CLAUDE_JOB_DIR/tmp/eastwood-src-up.log 2>/dev/null; do sleep 5; done; echo "MW:"; tail -1 $CLAUDE_JOB_DIR/tmp/eastwood-src-mw.log; echo "UP:"; tail -1 $CLAUDE_JOB_DIR/tmp/eastwood-src-up.log
L399 [RESULT] Command running in background with ID: b9jy0sw7i. Output is being written to: <tasks>/b9jy0sw7i.output. You will be notified when it completes.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/7496be2b-9961-45b7-8797-6ed8b8fdfcc2/subagents/agent-ae3923bd48afbbf5d.jsonl
  lines: 224-335
  date: 2026-09-11
  jev: {any_papercut: 0.80, env_toolchain: 0.81, stale_state: 0.15, verify_mismatch: 0.50, misleading_code: 0.34, hidden_coupling: 0.63, stale_docs: 0.35, tool_footgun: 0.75, flaky: 0.28, agent_bug: 0.31, wasted_effort: 0.45, user_correction: 0.09}

- L224-L225, L286-L287, L290-L292: commands return `Command running in background with ID: ...` and `Session cwd remains <session cwd>`.
- L293: `Blocked: sleep 60 followed by: tail -20 ...`.
- L307-L308: `tail` of the task file prints nothing yet.
- L310-L311: `InputValidationError: Monitor failed ... An unexpected parameter timeout was provided ... This tool's schema was not sent to the API`.
- L313: `ToolSearch select:Monitor`.

- L224-L253: first test runs backgrounded; results read from task files a few calls later.
- L286-L297: kondo backgrounded and polled.
- L290-L313: another test run backgrounded; blocked sleep, empty poll, failed Monitor call, schema load.
- L325-L335: results finally grepped out of the task file.
- Cost: about 6 extra calls.

```
L224 [CALL] cd ~/src/mb/wt/<branch> && timeout 1500 clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test :only '[metabase.metabot.api.document-test/generate-content-prometheus-test]' 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -30
L225 [RESULT] Command running in background with ID: b390pjqb5. Output is being written to: <tasks>/b390pjqb5.output. ... Session cwd remains <session cwd>; directory changes made by the backgrounded command do not apply to subsequent commands.
L287 [RESULT] Command running in background with ID: b0h288lgv. ... Session cwd remains <session cwd>; ...
L291 [CALL] sleep 60; tail -20 <tasks>/b0h288lgv.output 2>/dev/null
L293 [RESULT (ERROR)] <tool_use_error>Blocked: sleep 60 followed by: tail -20 <tasks>/b0h288lgv.output. To wait for a condition, use Monitor with an until-loop ...
L307 [CALL] tail -25 <tasks>/bkkywqtsh.output 2>/dev/null || echo "still running"
L308 [RESULT] (Bash completed with no output)
L310 [CALL] Monitor: {"command": "until grep -aq \"assertions,\" <tasks>/bkkywqtsh.output 2>/dev/null; do sleep 10; done; tail -25 ...", "description": "Wait for the PR verification test run to finish", "timeout": "900000"}
L311 [RESULT (ERROR)] <tool_use_error>InputValidationError: Monitor failed due to the following issue: | An unexpected parameter `timeout` was provided | This tool's schema was not sent to the API ...
L313 [CALL] ToolSearch: {"query": "select:Monitor", "max_results": 3}
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/dcbc556d-c81c-4160-af67-238040132220.jsonl
  lines: 2590-2818
  date: 2026-09-11
  jev: {any_papercut: 0.89, env_toolchain: 0.75, stale_state: 0.24, verify_mismatch: 0.82, misleading_code: 0.59, hidden_coupling: 0.79, stale_docs: 0.17, tool_footgun: 0.52, flaky: 0.84, agent_bug: 0.95, wasted_effort: 0.65, user_correction: 0.11}

L2593 'Monitor started ... Keep working – do not poll or sleep.' L2604-L2674 fifteen identical greps, each '(Bash completed with no output)' until L2675 prints the failure summary. L2721-L2722 a second Monitor; L2730-L2818 twenty identical greps.

- 20:47:39 L2593 Monitor armed (20-minute timeout).
- 20:47:59-20:48:46 L2604-L2674 fifteen identical polls; L2675 run finished (1 failure, 1 error).
- 20:49:45 L2717 re-run started; 20:49:49 L2721-L2722 Monitor armed again.
- 20:49:56-20:50:59 L2730-L2818 twenty identical polls.
- Cost: 35 model turns over about two minutes with no new information.

```
L2593 [RESULT] Monitor started (task bfnfs7xss, timeout 1200000ms). You will be notified on each event. Keep working – do not poll or sleep. Events may arrive while you are waiting for the user – an event is not their reply.
L2604 [CALL] grep -E "^FAIL in|assertions,|EXIT=" /tmp/f1.log 2>/dev/null | tail -8
L2611 [RESULT] (Bash completed with no output)
L2615 [CALL] grep -E "^FAIL in|assertions,|EXIT=" /tmp/f1.log 2>/dev/null | tail -8
L2674 [CALL] grep -E "^FAIL in|assertions,|EXIT=" /tmp/f1.log 2>/dev/null | tail -8
L2675 [RESULT] FAIL in metabase.metabot.tools.transforms-test/get-transform-details-native-query-test (transforms_test.clj:37) 1194 assertions, 1 failure, 1 error. EXIT=1
L2722 [RESULT] Monitor started (task b086lunby, timeout 1200000ms). You will be notified on each event. Keep working – do not poll or sleep. ...
L2730 [CALL] grep -E "^FAIL in|^ERROR in|assertions,|EXIT=" /tmp/f2.log 2>/dev/null | tail -8
L2818 [CALL] grep -E "^FAIL in|^ERROR in|assertions,|EXIT=" /tmp/f2.log 2>/dev/null | tail -8
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/450bcb5c-b531-4980-8fad-e6ce15770a1c.jsonl
  lines: 231-301
  date: 2026-08-25
  jev: {any_papercut: 0.82, env_toolchain: 0.72, stale_state: 0.34, verify_mismatch: 0.78, misleading_code: 0.25, hidden_coupling: 0.37, stale_docs: 0.31, tool_footgun: 0.75, flaky: 0.92, agent_bug: 0.22, wasted_effort: 0.66, user_correction: 0.10}

L232, L239, L277, L283, L295: each `Command running in background with ID: …`; only the last run's output is ever read (L334-L367).

- L231, L238: two identical `-M … -m mb.hawk.core` runs, backgrounded; L247 the first shows an NPE.
- L276, L282: corrected `-X:dev:ee:ee-dev:test :only …` issued twice, backgrounded, outputs never read.
- L294-L295: `bt.sh` with `cd` into the worktree, backgrounded; read at L355-L367 (143 tests pass).
- Cost: four redundant JVM test runs competing for CPU, several minutes.

```
L231 [CALL Bash] env -u MB_LLM_BEDROCK_ACCESS_KEY_ID -u MB_LLM_BEDROCK_SECRET_ACCESS_KEY -u MB_LLM_BEDROCK_REGION clojure -M:dev:ee:ee-dev:test:test/ee -m mb.hawk.core '{:only [metabase.llm.provider-test …]}' 2>&1 | tail -30
L232 [RESULT] Command running in background with ID: <id1>. …
L238 [CALL Bash] env -u … clojure -M:dev:ee:ee-dev:test:test/ee -m mb.hawk.core '{:only [metabase.llm.provider-test …]}' 2>&1 | tail -30
L239 [RESULT] Command running in background with ID: <id2>. …
L276 [CALL Bash] env -u … clojure -X:dev:ee:ee-dev:test :only '[metabase.llm.provider-test metabase.llm.api.provider-test metabase.metabot.self.bedrock-test metabase.metabot.settings-test]' 2>&1 | tail -25
L282 [CALL Bash] pwd && env -u … clojure -X:dev:ee:ee-dev:test :only '[…]' 2>&1 | tail -25
L294 [CALL Bash] cat > "$CLAUDE_JOB_DIR/tmp/bt.sh" <<'EOF' ⏎ #!/bin/zsh ⏎ cd ~/src/mb/wt/<branch> || exit 1 ⏎ echo "cwd: $PWD" ⏎ … clojure -X:dev:ee:ee-dev:test :only '[…]' 2>&1 | tail -40 ⏎ EOF ⏎ chmod +x … && "$CLAUDE_JOB_DIR/tmp/bt.sh"
L295 [RESULT] Command running in background with ID: <id5>. …
```
