---
title: mu/defn "Invalid input" errors print one nil per valid element of a sequential argument, so on a long Metabot parts vector the real violation is buried behind dozens of nils or truncated away
slug: malli-invalid-input-error-pads-valid-elements-with-nil
kind: misleading-signal
impact: wasted-time
severity: medium
status: open
area: src/metabase/util/malli/fn.clj (validate), Metabot agent loop validating LLMRequestOpts in src/metabase/metabot/self/core.clj, metabase.lib.equality/find-matching-column, dev-ee.log, metabot_message.error
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7ee5589e-88e5-463a-a3d6-e429eb321d74/subagents/agent-a81fdc033d9201436.jsonl
    lines: 343-503
    date: 2026-09-23
    jev: {any_papercut: 0.90, env_toolchain: 0.76, stale_state: 0.64, verify_mismatch: 0.24, misleading_code: 0.38, hidden_coupling: 0.88, stale_docs: 0.22, tool_footgun: 0.58, flaky: 0.74, agent_bug: 0.88, wasted_effort: 0.46, user_correction: 0.08}
---
## Summary
In dev and test, `metabase.util.malli.fn/validate` throws `Invalid input: <pr-str of me/humanize>`. For a sequential argument malli humanizes to a vector aligned with the input, with `nil` at every valid index, so an error in part 39 of a Metabot request prints 38 nils before the message. The same string goes to dev-ee.log, the streamed error and the persisted `metabot_message.error`, and every tool or agent that truncates long lines cuts the real error off. Four agents in one session hit it; the actual causes ("disallowed key", "should be a string, got: {...}") only surfaced after stripping nils from the log line.

## Symptom
- Tool-signals agent: its first live `throw` turn died with `stream error: Invalid input: {:input [nil nil ... {:error {:error-class ["disallowed key, got: ..."]` (L343).
- Same agent, diagnosing why query-building turns crashed: grepping dev-ee.log for the error hit BSD grep's "maximum repetition exceeds 255" (L496-L497), and the message was only readable after `sed -E 's/nil //g'` on the log line (L502-L503).
- Demo agent: the stored assistant message error was a wall of nils (its L199), and a REPL probe truncated the exception to `Invalid input: [nil nil nil nil nil nil nil nil nil {:table-` (its L298).
- Turn-review agent: same truncated string from the same probe (its L897).

## Timeline
- L343 (14:28 UTC): live turn fails; the message is 38 nils, then the disallowed-key error, then a client ZlibError.
- L347-L398: the agent reads the self/core.clj schemas and validates `LLMRequestOpts` over nREPL to find which closed map rejects the new key.
- L492-L503: a second crash (query-building turns) is diagnosed by grepping the log, hitting a grep limit, then stripping nils to read `:query ["should be a string, got: {...}"]`.
- Demo agent L199, L253, L298 and turn-review agent L897 each get the nil-padded or truncated form for other failures and dig through stack traces instead.
- Cost: roughly 15 tool calls across three agents, each re-deriving the nil-stripping or stack-trace route to the real message.

## Root cause
`validate` renders `(pr-str humanized)`, where `humanized` is `me/humanize` of the explanation. For `[:sequential ...]` schemas malli returns a vector the length of the input with nil at valid positions. `LLMRequestOpts` validates the whole `:input` parts vector (202 and 352 parts in the turns logged here), so the message grows with the conversation. The prod branch logs `me/humanize` without the wrap and should have the same shape; not observed here.

## Why agents fall for it
The text reads like corrupted data rather than a validation report; agents and helpers routinely cut long lines (`cut -c`, `subs`, `tail`), which removes the only non-nil entry; the failing element sits far from the edit that caused it.

## Current state
Checked origin/master: `validate` in src/metabase/util/malli/fn.clj still throws `(i18n/tru "Invalid input: {0}" (pr-str humanized))` in dev/test with `humanized` from `me/humanize`; no nil compaction.

## Suggested fix
- In `validate`, compact sequential explanations before rendering: keep only non-nil entries keyed by index, e.g. `{38 {:error {:error-class [...]}}}`.
- Lead the message with the first error's `:in` path and message from `mr/explain`, and cap the rendered length.
- In the Metabot agent loop, log the failing part's index and `:type` instead of the humanized vector.

## Detection signal
Regex `Invalid (input|output): \{?:?\w* ?\[(nil ){5,}` in tool results or logs; agents piping log lines through `sed 's/nil //g'` or `tr -s` to read an error.

## Raw excerpts
```
L342 [CALL] Bash: ./demo/break.sh throw && (timeout 240 ./demo/chat.sh "Search for tables about orders and list what you find." 2>&1 | cut -c1-300 ...
L343 [RESULT] [ 69.4s] !! search error: Search index unavailable | [ 69.7s] stream error: Invalid input: {:input [nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil {:error {:error-class ["disallowed key, got: \"metabase.metabot.tools.search/index-unavailable\""], ... | Decompression error: ZlibError
L493 [RESULT] [backend] 2026-09-23 14:30:15,274 ERROR agent.core :: Agent loop error: Invalid input: {:input [nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil ...
L496 [CALL] Bash: /usr/bin/grep -E "^\[backend\] 2026-09-23 14:30:15,274 ERROR agent.core" ~/src/mb/logs/dev-ee.log | /usr/bin/grep -o -E "\{:error \{[^}]{0,300}" | head -3; ...
L497 [RESULT] grep: maximum repetition exceeds 255 | 2 disallowed key, got: \ | 2 disallowed key, got: false
L502 [CALL] Bash: for n in 1048859 1049217 1049278; do sed -n "${n}p" ~/src/mb/logs/dev-ee.log | tr -s ' ' | sed -E 's/nil //g' | cut -c1-600; echo; done
L503 [RESULT] [backend] 2026-09-23 14:30:15,274 ERROR agent.core :: Agent loop error: Invalid input: {:input [{:arguments {:query ["should be a string, got: {:lib/type \"mbql/query\", :stages [...]}" ...
L199 [RESULT] (demo subagent) {:id 78, :role :assistant, ... :error "{\"message\":\"Invalid input: {:input [nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil nil n ...
L298 [RESULT] (demo subagent) {:msg "Invalid input: [nil nil nil nil nil nil nil nil nil {:table-reference [\"Valid column metadata, got: \\\"User\\\"\"]} {:table-", :trace ("metabase.lib.equality$fn__72019$mufn__72050.invoke(equality.cljc:421)" ...
L897 [RESULT] (turn-review subagent) {:breakouts 1, :with-table-reference "Invalid input: [nil nil nil nil nil nil nil nil nil {:table-", :without ["CREATED_AT"]}
```
