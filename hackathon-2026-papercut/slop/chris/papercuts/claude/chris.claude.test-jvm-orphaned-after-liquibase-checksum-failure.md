---
title: A ./bin/test-agent run that failed app-db init (Liquibase checksum) left its test JVM running for ~8 hours
slug: test-jvm-orphaned-after-liquibase-checksum-failure
kind: test-harness
impact: wasted-time
severity: medium
status: unknown
area: ./bin/test-agent, test app-db init, `timeout N ./bin/test-agent ...` wrappers
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 3508-3600
    date: 2026-09-09
    jev: {self_inflicted_bug: 0.93, tool_misuse: 0.84, misleading_signal: 0.70, user_correction: 0.30, codebase_trap: 0.45, flailing: 0.62, env_friction: 0.94}
---
## Summary
After a migration changeset's checksum changed, `timeout 1800 ./bin/test-agent :only '[...]'` printed a
stack trace and ended from the agent's point of view (L3509 returned nothing; L3512 stack tail;
L3515 ValidationFailedException). A test JVM (pid 30037, `-Dmb.run.mode=test`, cwd in this worktree)
kept running: found 7h48m later when the user asked "has it finished?". The agent killed it on request.
Likely mechanism: app-db init failure left non-daemon threads alive so the JVM never exits, and/or
`timeout` killed the wrapper script but not the java child.

## Symptom
```
L3569 [RESULT] 30037 .../bin/java ... -Dmb.run.mode=test ... -Dmb.db.in.memory=true ...
L3579 [RESULT] 30037 Wed Sep  9 03:20:18 2026  07:48:38
java 30037 christruter cwd DIR ... /Users/christruter/workspace/metabase/metabase.uxw-4796-preliminary-cleanups
L3582 [ASSISTANT] One thing never finished: a test JVM from my last cold run, pid 30037, started 03:20 and still sitting there after 7h48m ... It's the run that hit the Liquibase checksum failure and never exited.
```

## Timeline
- L3508-3509: test-agent run returns no summary lines.
- L3511-3519: reruns show `liquibase.exception.ValidationFailedException ... check sum`.
- L3563 USER: "has it finished?"
- L3568-3579: pgrep finds the orphan JVM.
- L3585-3589: killed.

## Root cause
Not verified in this drill. Candidates: (a) `metabase.test-runner` / app-db setup throws during
fixture init but non-daemon threads (connection pool, quartz) keep the JVM alive; (b) `timeout`
signals only its direct child (`bin/test-agent` shell/bb), leaving `java` orphaned.

## Why agents fall for it
The command's stdout ends, so the agent moves on; nothing reports the lingering process. Also blocks
ports/CPU and can confuse later "which JVM is mine" checks (another worktree's nREPL was on 45685).

## Current state
Unknown -- not checked by running tests (drill is read-only). Note `bin/test-agent:67` is
`exec clojure -X"${ALIASES}" "${args[@]}" 2>&1 | clean_output`: `exec` inside a pipeline does not
replace the wrapper shell, so the JVM is a pipeline member rather than the process `timeout` signals,
which makes the "java child survives the wrapper" mechanism plausible. Related memory:
`reference_local_test_appdb_migration_reset.md` (how to fix the checksum), and MEMORY.md entry
"[mage stray-killing](project_mage_stray_killing_rejected.md)" (closed work on killing strays, rejected).

## Suggested fix
- test-agent: on fatal init error, `System/exit 1` explicitly (after printing), and run the JVM in its
  own process group so `timeout`/SIGTERM on the wrapper reaches it (`exec` the java process, or trap
  and forward signals).
- Agents: after a test run that ended without the `Ran N tests` summary, check `pgrep -f mb.run.mode=test`.

## Detection signal
A test-agent invocation whose output lacks `Ran N tests`/`assertions,` and contains
`ValidationFailedException` or an init stack trace; any `mb.run.mode=test` JVM older than the session's
last test command.

## Raw excerpts
See Symptom.
