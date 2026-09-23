---
title: Metabot's tool-output `:error` map and Snowplow `event_details` are closed malli maps checked far from where they are built, so a key added in `run-tool` or the tool-usage event passes locally and only throws in dev on the next LLM call or event send
slug: metabot-closed-part-schemas-fail-next-llm-call
kind: codebase-trap
impact: wasted-time
severity: low
status: open
area: src/metabase/metabot/self/core.clj (run-tool, AISDKPart, LLMRequestOpts), src/metabase/metabot/self.clj (agent_used_tool event), src/metabase/analytics/snowplow.clj (:event-details)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7ee5589e-88e5-463a-a3d6-e429eb321d74/subagents/agent-a81fdc033d9201436.jsonl
    lines: 342-402
    date: 2026-09-23
    jev: {any_papercut: 0.90, env_toolchain: 0.76, stale_state: 0.64, verify_mismatch: 0.24, misleading_code: 0.38, hidden_coupling: 0.88, stale_docs: 0.22, tool_footgun: 0.58, flaky: 0.74, agent_bug: 0.88, wasted_effort: 0.46, user_correction: 0.08}
---
## Summary
An agent added `:error-class` and `:agent-error?` to the error map `run-tool` returns. The part is replayed into the next LLM request, where `LLMRequestOpts` validates every input part against `AISDKPart`, whose `:error` entry is `[:map {:closed true} ...]`. The turn crashed one step after the tool call, in dev only, behind a nil-padded "Invalid input" message. The Snowplow `event-details` map is closed the same way; two agents widened it after dev-ee rejected their new event keys.

## Symptom
- L343: live `throw` turn: the tool error is reported, then `stream error: Invalid input ... disallowed key, got: "metabase.metabot.tools.search/index-unavailable"` on the following request.
- L352-L367: the agent reads self/core.clj, finds the closed `:error` map inside `AISDKPart`, and widens it.
- L393-L398: confirms with `malli.core/validate` on `LLMRequestOpts` over nREPL; L401-L402 the live turn completes.
- The demo agent hit the same crash at its L253 while the edit was half done; the turn-review agent's report says "snowplow.clj: added ... to the closed event_details schema. dev-ee rejects the event without them".

## Timeline
- L342-L343: first live `throw` turn dies on the next LLM call.
- L347-L367: search for which schema rejects the key, then edit `AISDKPart`.
- L393-L398: validation checked over nREPL.
- L401-L402: live turn works; later a replay assertion is added to self_test.clj so the unit test covers it.
- Cost: about 10 tool calls and two failed live turns (one in another agent's session on the shared server).

## Root cause
The producer (`run-tool`) and the validator (`AISDKPart` in `LLMRequestOpts`) are separate; the check runs when history is replayed, not when the part is built, and `mu` input validation only throws when `config/is-dev?` or `is-test?`. Unit tests of the tool executor did not replay the part through `LLMRequestOpts`, so they passed with the new key.

## Why agents fall for it
Nothing next to `run-tool` or the event builder says the map is closed downstream; the failure appears in a different step, only in a running dev server, and with an unreadable message.

## Current state
Checked origin/master: `AISDKPart` in src/metabase/metabot/self/core.clj still declares `:error` as `[:maybe [:map {:closed true} [:message ...] [:type ...]]]`, and `:event-details` in src/metabase/analytics/snowplow.clj is still a closed map with only `tool_name` and `step`.

## Suggested fix
- Validate the tool-output part against `AISDKPart` where `run-tool` builds it (or in a helper every tool-executor test uses), so failures point at the producer.
- Define the error map schema once and reference it from both the producer and `AISDKPart`.
- A comment on the closed `:error` entry naming its producer and the replay path.

## Detection signal
"disallowed key" inside an "Invalid input" error from the Metabot agent loop, soon after edits to self/core.clj, self.clj or snowplow.clj.

## Raw excerpts
```
L343 [RESULT] [ 69.4s] !! search error: Search index unavailable | [ 69.7s] stream error: Invalid input: {:input [nil ... {:error {:error-class ["disallowed key, got: \"metabase.metabot.tools.search/index-unavailable\""], ...
L352 [CALL] Bash: cd ~/src/mb/metabase && sed -n 100,150p src/metabase/metabot/self/core.clj
L353 [RESULT] :keyword | number? | :boolean | :nil | [:map {:closed true} | [:output {:optional true} [:maybe :string]] | ...
L367 [CALL] Edit ~/src/mb/metabase/src/metabase/metabot/self/core.clj: old='[:duration-ms {:optional true} [:maybe number?]]\n [:error {:optional true} [:maybe [:map {:closed true}\n [:message {:optional true} ...' new='... [:error {:optional true} [ ...
L397 [CALL] Bash: ~/src/mb/papercuts/bin/nrepl-eval "(malli.core/validate metabase.metabot.self.core/LLMRequestOpts {:input [{:type :tool-output :id \"x\" :error {:message \"m\" :type \"t\" :error-class \"c\" :agent-error? false}}]})"
L398 [RESULT] true
L402 [RESULT] metabot-demo-break-search: throw | ... | [ 24.6s] !! search error: Search index unavailable | [ 26.9s] call read_resource {"uris":["metabase://databases"]} ...
```
