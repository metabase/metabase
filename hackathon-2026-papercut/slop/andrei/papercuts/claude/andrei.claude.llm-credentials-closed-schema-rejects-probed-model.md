---
title: The provider connect probe saves `:probed-model` into the connection config, and the closed `LLMCredentials` schema rejects that key, so every Metabot call on a Google or vLLM connection saved through the API fails in dev and tests while prod and settings-stubbing unit tests pass
slug: llm-credentials-closed-schema-rejects-probed-model
kind: codebase-trap
impact: both
severity: high
status: open # on master GoogleCredentials and ApiKeyCredentials still lack :probed-model; the Google fix sits on an unmerged PR branch
area: src/metabase/metabot/self/core.clj (ApiKeyCredentials, GoogleCredentials, LLMCredentials, LLMRequestOpts); src/metabase/llm/api/provider.clj (POST /providers merges :learned-config into :config); src/metabase/llm/provider.clj (resolve-model-ref, with-field-defaults); src/metabase/metabot/self/google.clj and vllm.clj (list-models :probe? returns :learned-config {:probed-model ...}); src/metabase/util/malli/fn.clj (instrument-ns?)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a342a3a46659ac024.jsonl
    lines: 424-689
    date: 2026-09-17
    jev: {any_papercut: 0.86, env_toolchain: 0.89, stale_state: 0.29, verify_mismatch: 0.24, misleading_code: 0.38, hidden_coupling: 0.79, stale_docs: 0.33, tool_footgun: 0.86, flaky: 0.67, agent_bug: 0.63, wasted_effort: 0.63, user_correction: 0.13}
---
## Summary
`POST /api/llm/providers` merges the probe's `:learned-config` (`{:probed-model ...}`) into the stored connection config. `resolve-model-ref` hands that whole config to the provider adapter as `:credentials`, and `google-raw`/`vllm-raw` are `mu/defn`s over `LLMRequestOpts`, whose `LLMCredentials` is an `:or` of closed maps that has not listed `:probed-model` since the closed-schema change (#82447). mu/defn only validates in dev and test, so production works while a local server, or any test that goes through a saved connection, fails every call. An agent verifying a Google Model Garden PR end to end hit it minutes after merging master.

## Symptom
After connecting a Google endpoint through the API (L424-L425, the stored config shows `probed-model`), the first Metabot chat turn streamed a single error part (L433): `Invalid input: {:credentials {:auth-method ["disallowed key, got: ..." x3], :oauth-access-token [...], :project-id [...], :location [...], :probed-model [...], :base-url [...]}}`. Every key, including the valid ones, is reported as disallowed, because the humanized `:or` error carries one failure per branch.

## Timeline
- L424-L425: connect through `/api/llm/providers` succeeds; the saved config includes `probed-model`.
- L432-L433: first chat turn fails with the `:credentials` `Invalid input` error that lists every key as disallowed.
- L436-L451: agent traces it to #82447 with `git log -S` and reads `util/malli/fn.clj`: `instrument-ns?` is only true in dev and test.
- L465-L474: patches the closed schemas locally and restarts the throwaway server (2 minutes after the error).
- L634: narrows the fix to `GoogleCredentials`.
- L671-L689: adds a test that streams through the saved connection's credentials and watches it error without the fix (L681-L685).
- Main transcript L1492: the coordinator notes vLLM credentials have the same gap.
- Cost: about 20 minutes, a server restart and a new commit; the PR's existing unit tests could not see it because they set credentials through settings instead of saving a connection.

## Root cause
Two couplings meet. The connect path stores whatever the probe learned in the connection config (`(update conn :config merge learned-config)` in `llm/api/provider.clj`), and `resolve-model-ref` passes that config as `:credentials` through `with-field-defaults`, which keeps unknown keys. `LLMCredentials` became closed on 2026-09-15 (#82447), after `:probed-model` had been added to the learned config for Google partner models and vLLM, and nobody added it to the credentials schemas. Instrumentation runs only when `config/is-dev?` or `config/is-test?`, so production never checks.

## Why agents fall for it
The merge with master was textually clean. The error names `:auth-method`, `:project-id` and other valid keys as disallowed, which points away from the one new key. Unit tests build credentials from settings rather than a saved connection, so they pass. Nothing in the code ties the probe's learned keys to the credentials schema.

## Current state
Checked origin/master (0694a11c901, 2026-09-23): `GoogleCredentials` and `ApiKeyCredentials` in `metabot/self/core.clj` still have no `:probed-model`; `google/list-models` still returns `(assoc :learned-config {:probed-model model})` and `vllm.clj` still records `:probed-model`; `POST /providers` still merges `learned-config` into `:config`; `vllm-raw` and `google-raw` still validate `core/LLMRequestOpts`. The Google-only fix ('Allow the probed model in Google credentials') is on PR #82276, still open.

## Suggested fix
- Build `:credentials` from the provider type's declared `:fields` only (e.g. `select-keys` in `resolve-model-ref`), or store probe results beside `:config` instead of inside it.
- Or derive the closed credentials schemas from the provider registry's fields plus one shared list of learned keys, so a single list governs both.
- Add a test per probing provider type that connects through `POST /api/llm/providers` and then makes a call through the saved connection with instrumentation on.
- Make the humanized error for an `:or` of closed maps name the key no branch accepts, or dispatch the credentials schema on `:type` so only one branch reports.

## Detection signal
Metabot SSE part `{"type":"error","errorText":"Invalid input: {:credentials {...` with `disallowed key, got:` repeated per key; `:probed-model` among the disallowed keys; the same key list repeated once per `:or` branch in a malli explain dump.

## Raw excerpts
```
L424 [CALL] Bash: cd ~/src/mb/tmp/vertex-mock && python3 drive.py connect endpoints/1234567890123456789; python3 drive.py setting llm-metabot-provider; tail -4 mock.log; /usr/bin/grep -n "google\|Google" ~/src/mb/tmp/<e2e-dir>/ser
L425 [RESULT] 200 2.0 s
    {"key":"google","type":"google","name":"Google Gemini Enterprise","source":"db","usable":true,"env_vars":[],"env_fields":[],"config":{"auth-method":"oauth-token","oauth-access-token":"[REDACTED]","project-id":"my-project","l
L433 [RESULT] data: {"type":"error","errorText":"Invalid input: {:credentials {:auth-method [\"disallowed key, got: \\\"oauth-token\\\"\" (x3)], :oauth-access-token [...], :project-id [...], :location [...], :probed-model [\"disallowed key, got: \\\"endpoints/1234567890123456789\\\"\" (x4)], :base-url [...]}}"}
L436 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git log --oneline -S "GoogleCredentials" origin/master -- src/metabase/metabot/self/core.clj | head; git log --oneline -S "probed-model" origin/master -- src/ | head; git show 4d60c4b
L470 [CALL] Edit ~/src/mb/wt/<worktree>/src/metabase/metabot/self/core.clj: old='[:base-url        {:optional true} [:maybe :string]]\n   [:model-reasoning {:optional true} [:maybe [:or :boolean :string]]]])' new='[:base-url      
L634 [CALL] Edit ~/src/mb/wt/<worktree>/src/metabase/metabot/self/core.clj: old='[:model-reasoning {:optional true} [:maybe [:or :boolean :string]]]\n   [:probed-model    {:optional true} [:maybe :string]]])' new='[:model-reasonin
L685 [RESULT] ERROR in metabase.metabot.self.google-test/google-endpoint-stream-test (google.clj:600)
    ERROR in metabase.metabot.self.google-test/google-endpoint-stream-error-test (google.clj:600)
    Ran 2 tests in 0.131 seconds
    2 assertions, 0 failures, 2 errors.
```
