---
title: Running the Eastwood changed-test gate with `:namespaces '"[a b]"'` passes a string, and the linter dies with an opaque `Character cannot be cast to Symbol` buried under JVM frames
slug: eastwood-namespaces-arg-quoted-as-edn-string
kind: tool-quirk
impact: wasted-time
severity: low
status: documented-still-hit # a local note covered it
area: clojure -X:...:eastwood/test :namespaces; test/metabase/linters/eastwood.clj (eastwood-tests); .github/workflows/backend.yml changed-test Eastwood step
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501/subagents/agent-a1516fbd08d9d497a.jsonl
    lines: 201-207
    date: 2026-08-27
    jev: {any_papercut: 0.78, env_toolchain: 0.36, stale_state: 0.22, verify_mismatch: 0.55, misleading_code: 0.48, hidden_coupling: 0.83, stale_docs: 0.32, tool_footgun: 0.67, flaky: 0.33, agent_bug: 0.86, wasted_effort: 0.48, user_correction: 0.85}
---
## Summary
Three separate subagents in one session ran the Eastwood changed-test gate as `clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood/test :namespaces '"[ns-a ns-b]"'`. The single quotes make the EDN value a string, `metabase.linters.eastwood/eastwood-tests` passes it through unvalidated, and Eastwood iterates it as characters, failing with `class java.lang.Character cannot be cast to class clojure.lang.Symbol`. With `| tail` the agents first saw only JVM stack frames and needed a second run to find the message.

## Symptom
L201-L202: the run printed only `at clojure.core$apply...` frames under `tail -8`. L203-L204: rerun with `head -30` to see the header. L206-L207: fixed to `:namespaces '[...]'`, `Warnings: 0. Exceptions thrown: 0`. The same sequence appears in agent-a3a80b88fb4b1a068 (L268-L274) and agent-a63db52416dfc7303 (L213-L224).

## Timeline
- 10:11 UTC, implementer agent (a3a80b88, L268-L274): same quoting, two extra JVM runs to find the ClassCastException, then corrected.
- 10:30 UTC, reviewer agent (a63db524, L213-L224): same quoting, reads the log, "My quoting made the vector a string", corrected.
- 12:39 UTC, stacked-fix agent (this chunk, L201-L207): same quoting twice (tail, then head), then corrected.
- Cost: about 4 minutes and 7 extra tool calls across three agents, each JVM start around 40 seconds.

## Root cause
`clojure -X` parses each argument as EDN. `:namespaces "[a b]"` in a shell is a vector of symbols (the double quotes are shell quotes); `'"[a b]"'` is an EDN string. `eastwood-tests` merges the option map straight into `eastwood-from-cmdline` without checking the type, so the failure surfaces deep inside Eastwood as a cast error rather than a usage error.

## Why agents fall for it
The same repo uses both quoting styles for other `-X` options: `./bin/test-agent :only '"test/metabase/slackbot"'` (an EDN string for a directory) and `:only '[ns]'` (a vector). The CI YAML shows `:namespaces "[$NAMESPACES]"`, whose double quotes look like part of the value. Piping to `tail` hides the one useful line.

## Current state
Checked origin/master: `test/metabase/linters/eastwood.clj` still merges options unvalidated into `eastwood/eastwood-from-cmdline`.

## Suggested fix
- In `eastwood` and `eastwood-tests`, accept a string `:namespaces` by reading it as EDN, or throw a one-line usage error naming the expected vector form.
- Add the exact command for the changed-test gate to `bin/test-agent --help` or a mage task (`./bin/mage eastwood-changed`) so agents stop hand-building it.

## Detection signal
`:namespaces '"[` in a `clojure -X` command; output containing `java.lang.Character cannot be cast to class clojure.lang.Symbol`; the same Eastwood command re-run within a minute with different quoting.

## Raw excerpts
```
L201 [CALL] Bash: cd ~/src/mb/wt/<worktree> && clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood/test :namespaces '"[metabase.metabot.api.document-test metabase.server.middleware.exceptions-test metabase.slackbot.uploads-test]"' 2>&1 | tail -8
L202 [RESULT] at clojure.core$apply.invokeStatic(core.clj:667) | at clojure.main$main_opt.invokeStatic(main.clj:515) | ... | at clojure.main.main(main.java:40)
L203 [CALL] Bash: ... :namespaces '"[metabase.metabot.api.document-test metabase.server.middleware.exceptions-test metabase.slackbot.uploads-test]"' 2>&1 | head -30
L206 [CALL] Bash: ... clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood/test :namespaces '[metabase.metabot.api.document-test metabase.server.middleware.exceptions-test metabase.slackbot.uploads-test]' 2>&1 | tail -8
L207 [RESULT] ... == Linting done in 29026 ms == | == Warnings: 0. Exceptions thrown: 0
(implementer transcript) L268 [CALL] Bash: ... eastwood/test :namespaces '"[metabase.slackbot.streaming-test metabase.metabot.agent.core-test metabase.metabot.self-test]"' 2>&1 | tail -12
(implementer transcript) L271 [RESULT] == Eastwood 1.4.3 ... Exception: class java.lang.Character cannot be cast to class clojure.lang.Symbol (java.lang.Character is in module java.base of loader 'bootstrap'; clojure.lang.Symbol is in unnamed module of loader 'app')
(reviewer transcript) L223 [ASSISTANT] My quoting made the vector a string. Retry with correct quoting.
```
