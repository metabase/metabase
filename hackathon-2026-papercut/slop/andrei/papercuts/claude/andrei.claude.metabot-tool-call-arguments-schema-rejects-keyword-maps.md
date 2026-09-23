---
title: In dev and test, the closed `ToolCallArguments` schema only accepts string-keyed nested maps while `parse-tool-arguments` keywordizes every level, so a local Metabase fails any Metabot tool call with object arguments and agents fall back to prod run mode, which switches the checks off
slug: metabot-tool-call-arguments-schema-rejects-keyword-maps
kind: codebase-trap
impact: wasted-time
severity: medium
status: open # not run; on master ToolCallArguments still nests ::json-value (string-keyed maps only) and tool arguments are still decoded with json/decode+kw
area: src/metabase/metabot/self/core.clj (ToolCallArguments, AISDKPart, parse-tool-arguments); src/metabase/request/schema.clj (::json-value); task.suggested-prompts-generator; deps.edn :run alias (-Dmb.run.mode=dev)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a342a3a46659ac024.jsonl
    lines: 485-523
    date: 2026-09-17
    jev: {any_papercut: 0.85, env_toolchain: 0.74, stale_state: 0.36, verify_mismatch: 0.50, misleading_code: 0.43, hidden_coupling: 0.78, stale_docs: 0.29, tool_footgun: 0.74, flaky: 0.58, agent_bug: 0.91, wasted_effort: 0.69, user_correction: 0.08}
---
## Summary
Since typed, closed argument schemas became mandatory for mu/defn (#82447), a Metabase started from the `:run`/`:dev` aliases validates Metabot's AISDK parts at runtime. Tool-call arguments are decoded with `json/decode+kw`, so nested objects have keyword keys, but `ToolCallArguments` values must be `::json-value`, whose maps are `[:map-of :string ...]`. A tool call such as `construct_notebook_query` with `{:query {...} :visualization {...}}` fails validation and the chat turn ends in an error. The same server also logged `Suggested prompts generation failed: Invalid input ... {:table-reference ["Valid column metadata, got: \"User\""]}`. The agent restarted with `-Dmb.run.mode=prod` to get working chats, which also turns off every mu/defn check it was relying on to verify the PR.

## Symptom
L486: the chat stream's error part is a humanized `:or` dump preceded by hundreds of `nil`s: `{:arguments {:query ["should be a string, got: {:aggregation [[\"count\" {}]], ...}" "should be a keyword, got: ..." ... "invalid type, got: ..."], :visualization [...]}}`. L508: server.log `ERROR task.suggested-prompts-generator :: Suggested prompts generation failed: Invalid input: [nil ... {:table-reference ["Valid column metadata, got: \"User\""]} ...`.

## Timeline
- L485-L486: the next chat turn, after an earlier config fix, fails on the tool-call arguments schema.
- L489-L504: agent reads `AISDKPart`, `::json-value` and `parse-tool-arguments`, and confirms master has the same code.
- L507-L508: finds the suggested-prompts `:table-reference` failure in server.log.
- L511-L519: restarts with `-J-Dmb.run.mode=prod`; the prod log has 0 `Invalid input` lines.
- L522-L523: the same chat turn completes normally.
- Main transcript L1492: the coordinator reports that the closed schemas still break dev mode in other places for every provider: nested tool-call arguments, `read_resource` on table fields, and the vLLM connection's `credentials` map.
- Cost: about 6 minutes and two server restarts; the rest of the local end-to-end verification ran without schema instrumentation.

## Root cause
From the code (the failure was not re-run on master): `ToolCallArguments` is `[:map-of [:or :string :keyword] ::request.schema/json-value]` and `::json-value` accepts maps only as `[:map-of :string ...]`, while `parse-tool-arguments` uses `json/decode+kw`, which keywordizes nested keys. The docstring says 'string keys off the wire, keyword keys when built in Clojure', but only the top level takes keywords. The `:table-reference` failure is a separate mismatch in the suggested-prompts path that the session did not investigate. Both are only checked when `instrument-ns?` is true (dev and test).

## Why agents fall for it
The failure appears only in a dev-alias server or in tests with nested arguments, never in prod, and the error is thousands of characters of `nil` and 'should be a string/keyword/number' messages. Switching to prod mode makes it disappear, which hides the bug instead of reporting it.

## Current state
Checked origin/master (0694a11c901): `ToolCallArguments` and `::json-value` are unchanged (string-keyed maps only) and `parse-tool-arguments` still calls `json/decode+kw`; no commit touched `metabot/self/core.clj` or `request/schema.clj` after 2026-09-15 except unrelated scope work. Not run, so the suggested-prompts failure's current state is unknown.

## Suggested fix
- Let `::json-value` (or a tool-arguments variant) accept keyword keys at every level, or keywordize only the top level of decoded tool arguments.
- Add a test that streams a tool call with nested object arguments through `aisdk-xf` with instrumentation on.
- Run a short Metabot chat smoke test against a dev-mode server in CI so dev-only schema drift fails a check rather than a developer's local run.
- Document that `-Dmb.run.mode=prod` disables mu/defn validation, so it is not a neutral workaround.

## Detection signal
Metabot SSE error part starting `Invalid input: [nil nil nil` or containing `should be a string, got: {:` for `:arguments`; server.log `Suggested prompts generation failed: Invalid input`; an agent restarting a local server with `-Dmb.run.mode=prod`.

## Raw excerpts
```
L485 [CALL] Bash: until curl -s --max-time 2 http://localhost:3077/api/health 2>/dev/null | /usr/bin/grep -q '"ok"' || ! kill -0 3613 2>/dev/null; do sleep 3; done; curl -s http://localhost:3077/api/health; echo; cd ~/src/mb/tmp/v
L486 [RESULT] {"status":"ok"} conversation 6a0e34bf-... status 202 34.0 s ... <nil x ~600> {:arguments {:query [\"should be a string, got: {:aggregation [[\\\"count\\\" {}]], :lib/type \\\"mbql/query\\\", ...}\" \"should be a keyword, got: ...\" \"should be a number, got: ...\" \"should be a boolean, got: ...\" \"should be nil, got: ...\" \"invalid type, got: ...\"], :visualization [\"should be a string, got: {:chart_type \\\"scalar\\\"}\" ...]}}]}"}
L508 [RESULT] src/metabase/lib/schema/metadata.cljc:389:    :error/message    "Valid column metadata"
    638:2026-09-17 11:38:26,838 ERROR task.suggested-prompts-generator :: Suggested prompts generation failed: Invalid input: [nil nil nil nil nil nil nil nil nil {:table-reference ["Valid column metadata, got: \"User\""]} {:table
L511 [CALL] Bash: /usr/bin/grep -n -i "run.mode\|mode\b" ~/src/mb/tmp/<e2e-dir>/server.log | head -5 | cut -c 1-200; kill 3613; until ! kill -0 3613 2>/dev/null; do sleep 1; done; echo stopped; cd ~/src/mb/wt/<worktree> && T=~/src
L515 [RESULT] {"status":"ok"}
    -Dmb.run.mode=dev
    -Dmacaw.run.mode=dev
    -Dmb.run.mode=prod
L519 [RESULT] 0
L523 [RESULT] data: {"type":"finish","finishReason":"stop","messageMetadata":{"usage":{"inputTokens":204955,"outputTokens":10567,"totalTokens":215522,"cacheCreationTokens":0,"cacheReadTokens":0,"cachedInputTokens":0},"usageByModel
```
