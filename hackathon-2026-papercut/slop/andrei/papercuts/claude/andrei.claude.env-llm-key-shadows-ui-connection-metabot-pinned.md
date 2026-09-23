---
title: With `MB_LLM_ANTHROPIC_API_KEY` set, a key entered in the admin UI lands on a new `anthropic-2` connection that `MB_LLM_METABOT_PROVIDER = "anthropic/…"` never uses, so Metabot keeps failing with 401 on the env-backed key
slug: env-llm-key-shadows-ui-connection-metabot-pinned
kind: codebase-trap
impact: wasted-time
severity: medium
status: documented-still-hit # a local note covered it
area: src/metabase/llm/provider.clj `connections` and env overlays; MB_LLM_METABOT_PROVIDER; mise.local.toml; admin AI settings
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8.jsonl
    lines: 1780-1849
    date: 2026-09-03
    jev: {any_papercut: 0.87, env_toolchain: 0.94, stale_state: 0.33, verify_mismatch: 0.50, misleading_code: 0.33, hidden_coupling: 0.75, stale_docs: 0.48, tool_footgun: 0.57, flaky: 0.31, agent_bug: 0.84, wasted_effort: 0.61, user_correction: 0.60}
---
## Summary
Asked for live Metabot screenshots, a subagent got "Something went wrong" and `Anthropic API key expired or invalid status=401` in the dev server log: the key set in mise.local.toml was rejected. The user added a fresh key in the admin UI, which created a second connection `anthropic-2`, while `MB_LLM_METABOT_PROVIDER = "anthropic/claude-sonnet-4-6"` kept Metabot on the env-backed `anthropic` connection, whose api-key field the env var owns. Metabot still 401'd; `/api/llm/providers` and `/api/llm/models` showed one working and one dead Anthropic connection. The parent repointed the setting to `anthropic-2/…` and restarted.

## Symptom
L1788: `ERROR agent.core :: Agent loop API error: Anthropic API key expired or invalid status=401 provider=anthropic`; L1795: the user adds a new Anthropic key in the admin UI; L1808: still 401; subagent report at L1828: `anthropic-2` (source db) lists models, `anthropic` (source env, `MB_LLM_ANTHROPIC_API_KEY`) returns "Anthropic API key expired or invalid".

## Timeline
- Subagent a9924 L63-L89: first live attempt fails with 401; stops.
- L1791: parent tells the user the env key is rejected.
- L1795: user adds a key in the admin UI.
- L1807-L1808 and subagent a9924 L106-L149: retry still 401; network requests show two Anthropic connections.
- L1824: parent predicts env shadowing; L1838-L1849 repoints `MB_LLM_METABOT_PROVIDER` to `anthropic-2/…` and restarts dev-ee.
- Cost: two subagent runs (about nine minutes) and two user round trips before Metabot answered.

## Root cause
`metabase.llm.provider/connections` builds the `anthropic` connection from `MB_LLM_ANTHROPIC_API_KEY` (as a standalone `:env` connection, or as an overlay on a stored one) and lists `api-key` in `:env-fields`, so the form cannot edit it and adding a key creates a new connection key. `MB_LLM_METABOT_PROVIDER` names a connection key, not a provider type, so it silently stays on the dead env connection. Why the env key was rejected is not in the transcript.

## Why agents fall for it
`anthropic/claude-sonnet-4-6` reads as provider/model, so "add a working Anthropic key" looks like the fix. A static read of mise.local.toml ("provider and key are set") says nothing about whether the key works, and the UI accepts the new key without saying Metabot will ignore it.

## Current state
origin/master src/metabase/llm/provider.clj `connections` docstring: env shadows stored connections field by field, and "a standalone `:env` connection is synthesized only when a variable marked `:credential?` is set"; `:env-fields` names the fields the form must disable.

## Suggested fix
- Admin UI: when a new connection duplicates the type of an env-backed connection that `MB_LLM_METABOT_PROVIDER` pins, say that Metabot keeps using the env one.
- Log a startup WARN when the pinned connection's model listing fails (dead key), naming the env var.
- Dev tooling: a dev-server status check that probes the pinned connection and reports "LLM key rejected".

## Detection signal
Dev server log line `Anthropic API key expired or invalid status=401` while `GET /api/llm/providers` returns two connections of the same type, one with `"source":"env"`.

## Raw excerpts
```
L1788 [RESULT] … --- recent 401s in the log --- ⏎ [backend] 2026-09-03 12:56:28,833 WARN self.core :: Provider API request failed: provider=anthropic status=401 ⏎ [backend] 2026-09-03 12:56:28,836 ERROR agent.core :: Agent loop API error: Anthropic API key expired or invalid status=401 provider=anthropic
L1808 [RESULT] MB_LLM_METABOT_PROVIDER = "anthropic/claude-sonnet-4-6" ⏎ --- any successful LLM call since 13:00? --- ⏎ … ⏎ [backend] 2026-09-03 13:02:11,922 WARN self.core :: Provider API request failed: provider=anthropic status=401
L1844 [RESULT] repointed ⏎ 19:MB_LLM_METABOT_PROVIDER = "anthropic-2/claude-sonnet-4-6"
```
