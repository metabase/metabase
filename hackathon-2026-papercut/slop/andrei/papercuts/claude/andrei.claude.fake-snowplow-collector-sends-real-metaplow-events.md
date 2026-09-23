---
title: `with-fake-snowplow-collector` turns anon tracking on but fakes only Snowplow, so with `MB_METAPLOW_URL` in mise.local.toml backend tests POST real events to the collector and a Metabot test fails locally
slug: fake-snowplow-collector-sends-real-metaplow-events
kind: test-harness
impact: both
severity: medium
status: open
area: test/metabase/analytics/snowplow_test.clj (do-with-fake-snowplow-collector!), src/metabase/analytics/event.clj (track-event! fan-out), src/metabase/analytics/settings.clj (metaplow-tracking-enabled), dev/src/user.clj (load-mise-local!), metabase.metabot.agent.core-test
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7ee5589e-88e5-463a-a3d6-e429eb321d74/subagents/agent-a81fdc033d9201436.jsonl
    lines: 299-426
    date: 2026-09-23
    jev: {any_papercut: 0.90, env_toolchain: 0.76, stale_state: 0.64, verify_mismatch: 0.24, misleading_code: 0.38, hidden_coupling: 0.88, stale_docs: 0.22, tool_footgun: 0.58, flaky: 0.74, agent_bug: 0.88, wasted_effort: 0.46, user_correction: 0.08}
---
## Summary
For a local demo, mise.local.toml set `MB_METAPLOW_URL` to a local receiver. `dev/src/user.clj` merges that file into environ for every JVM on the `:dev` alias, test runs included. `with-fake-snowplow-collector` sets `anon-tracking-enabled` to true and redefines only the Snowplow sender, while `track-event!` also posts to Metaplow whenever anon tracking is on and a URL is set. `replayed-tool-history-reaches-the-provider-adapter-test` failed locally (an extra HTTP call counted by its `http/request` mock), and even with `MB_ANON_TRACKING_ENABLED=false` two fixture events (session ids `00000000-0000-0000-0000-000000000001/2`, `plan oss`, `duration_ms 0`) reached the demo's event table, where the triage agent grouped them as a genuine search failure.

## Symptom
- L350: three assertion failures in `replayed-tool-history-reaches-the-provider-adapter-test` (`expected: 2 actual: 3`).
- L415-L416: the test passes with `MB_ANON_TRACKING_ENABLED=false`; the agent reruns the three namespaces with that override (L426) and later reports that no test rows reached the demo event table.
- Triage subagent L310-L314: a finding built from two events with fixture session ids and zero duration; the local model first called it genuine, and the agent then traced the two events back to a unit-test run.

## Timeline
- L299 (14:26 UTC): first test run of search-test, self-test and agent core-test.
- L348-L350: three failures in the replay test.
- L352-L361: agent reads the test and checks the event table for foreign distinct ids (none yet).
- L415-L416 (14:32): the single test passes with anon tracking disabled.
- L426 (14:33:37): full rerun with the override; at 14:34:50 two test events still land in the demo table (triage L311).
- Triage L310-L323: the events become a triage group, the model judges it genuine, the agent adds a judging rule and re-runs verdicts.
- Cost: about 8 tool calls in one agent, 4 calls and two model calls in another, polluted demo data, and a wrong "no test rows" claim in a report.

## Root cause
Two links. (1) `load-mise-local!` in dev/src/user.clj merges mise.local.toml's [env] block into environ for test JVMs too (the same happens with MB_LLM_* keys). (2) `do-with-fake-snowplow-collector!` binds `snowplow-available` and `anon-tracking-enabled` to true and redefs only `snowplow/track-event-impl!`, while `analytics.event/track-event!` fans out to Snowplow and Metaplow and `metaplow-tracking-enabled` is `(and (anon-tracking-enabled) metaplow-url)`. `MB_ANON_TRACKING_ENABLED=false` does not help inside the fake's scope, because the fake turns anon tracking back on with `with-temporary-setting-values`.

## Why agents fall for it
The fake's name suggests analytics are sandboxed during the test; the failing assertion (one extra HTTP call) does not mention Metaplow; the env override that fixes the one failing test looks like a complete fix, and its gap only shows up in a different agent's data.

## Current state
Checked origin/master: `do-with-fake-snowplow-collector!` still sets only `snowplow-available` and `anon-tracking-enabled` and redefs only `snowplow/track-event-impl!`; `metaplow-tracking-enabled` still reads `(and (anon-tracking-enabled) metaplow-url)`.

## Suggested fix
- In `do-with-fake-snowplow-collector!`, also bind `metaplow-url` to nil (or stub the Metaplow sender) so the fake never reaches a real collector.
- Have `load-mise-local!` skip analytics and LLM keys (`MB_METAPLOW_URL`, `MB_LLM_*`) when the run mode is test, so a laptop's demo config never reaches a test JVM.
- Local receivers used for demos can drop events carrying fixture session ids or `version_tag vLOCAL_DEV` with `duration_ms 0`.

## Detection signal
A snowplow or Metabot analytics test failing only on a laptop whose mise.local.toml sets `MB_METAPLOW_URL`; events with session id `00000000-0000-0000-0000-00000000000N` arriving at a local collector.

## Raw excerpts
```
L299 [CALL] Bash: cd ~/src/mb/metabase && mise exec -- ./bin/test-agent :only '[metabase.metabot.tools.search-test metabase.metabot.self-test metabase.metabot.agent.core-test]' > $SCRATCH/test-run-1.log 2>&1
L350 [RESULT] FAIL in metabase.metabot.agent.core-test/replayed-tool-history-reaches-the-provider-adapter-test (core_test.clj:702) | expected: 2 | actual: 3 | FAIL in ... (core_test.clj:703) | expected: [{:role "assistant", | actual: [] ...
L415 [CALL] Bash: cd ~/src/mb/metabase && MB_ANON_TRACKING_ENABLED=false mise exec -- ./bin/test-agent :only '[metabase.metabot.agent.core-test/replayed-tool-history-reaches-the-provider-adapter-test]' 2>&1 | ...
L416 [RESULT] Ran 1 tests in 11.779 seconds | 5 assertions, 0 failures, 0 errors.
L426 [CALL] Bash: cd ~/src/mb/metabase && MB_ANON_TRACKING_ENABLED=false mise exec -- ./bin/test-agent :only '[metabase.metabot.tools.search-test metabase.metabot.self-test metabase.metabot.agent.core-test]' > $SCRATCH/test-run-2.log 2>&1
L311 [RESULT] (triage subagent) Finding f23aee1e505c | - event: ai_service_event.agent_used_tool | - tool: search | - error class: ExceptionInfo | - occurrences: 2, first seen 2026-09-23T14:34:50.095Z ...
L311 [RESULT] (triage subagent) 2026-09-23T14:34:50.333Z {"plan":"oss","result":"error","source":"metabot_agent","profile":"internal","user_id":1,"session_id":"00000000-0000-0000-0000-000000000002","duration_ms":0,"version_tag":"vLOCAL_DEV","event_details":{"step":1,"tool_name":"search","agent_error":true,"error_class":"ExceptionInfo"}}
```
