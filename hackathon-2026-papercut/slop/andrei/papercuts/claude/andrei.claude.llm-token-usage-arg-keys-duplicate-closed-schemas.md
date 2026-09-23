---
title: `track-token-usage!` slices its options with hand-kept `snowplow-arg-keys`/`prometheus-arg-keys` vectors that duplicate the closed `SnowplowArgs`/`PrometheusArgs` schemas, so a key added only to a schema passes validation and is then silently dropped (the Prometheus label falls back to `unknown`)
slug: llm-token-usage-arg-keys-duplicate-closed-schemas
kind: codebase-trap
impact: introduced-bug
severity: medium
status: open # both key vectors are still literal lists next to the schemas on master
area: src/metabase/analytics/llm_token_usage.clj (snowplow-arg-keys, prometheus-arg-keys, SnowplowArgs, PrometheusArgs, TrackTokenUsageArgs, track-token-usage!, track-prometheus!)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a6fd99bcc709d6e88.jsonl
    lines: 120-137
    date: 2026-09-17
    jev: {any_papercut: 0.56, env_toolchain: 0.62, stale_state: 0.18, verify_mismatch: 0.27, misleading_code: 0.35, hidden_coupling: 0.51, stale_docs: 0.25, tool_footgun: 0.43, flaky: 0.18, agent_bug: 0.27, wasted_effort: 0.26, user_correction: 0.15}
---
## Summary
The follow-up to the closed-schema change (#82537) made `track-token-usage!` call `(track-prometheus! (select-keys opts prometheus-arg-keys))`. A branch that added `:provider` to the Prometheus args merged master without conflicts, but `:provider` was not in `prometheus-arg-keys`, so every LLM token metric would have been labelled `unknown` with no error: the combined `TrackTokenUsageArgs` schema accepts the key, `select-keys` drops it, and `track-prometheus!` defaults the label. The agent caught it only because it diffed master's changes to every file the branch touched.

## Symptom
No failure at merge time. L124-L125: the agent's `git diff` of `llm_token_usage.clj` against master shows the new `select-keys` split and a `prometheus-arg-keys` vector without `:provider`, while `track-prometheus!` builds `{:provider (or provider "unknown")}`.

## Timeline
- L120-L121: after merging master, the agent reads the branch's version of the file and master's recent commits (#82537).
- L124-L125: the diff shows the `select-keys` split; `git grep` finds the two key vectors.
- L136-L137: adds `:provider` to `prometheus-arg-keys` inside the merge commit.
- agent-a6fd L642 (final report): 'Every token metric would have been labelled `unknown`.'
- Cost: about a minute here because the agent reviewed master's diff per touched file; a merge taken on trust would have shipped `provider="unknown"` on every token metric.

## Root cause
Two sources of truth for one key set: the closed malli map schemas and the vectors used to slice the combined options before calling the inner functions. Validation happens on the merged schema, before the slice, so a missing vector entry is invisible to it.

## Why agents fall for it
The merge is conflict-free, the schema already lists the key, and the `unknown` fallback means no test fails unless one asserts the label value.

## Current state
Checked origin/master (0694a11c901): `prometheus-arg-keys` now includes `:provider` (the branch merged), but both vectors are still literal lists beside `SnowplowArgs`/`PrometheusArgs`.

## Suggested fix
- Derive the vectors from the schemas, e.g. `(mapv first (mc/children PrometheusArgs))` or `(mut/keys PrometheusArgs)`.
- Or drop the slicing and have callers pass each function its own map, letting the closed schemas reject extras.
- Add a test asserting `(set prometheus-arg-keys)` equals the schema's keys.

## Detection signal
`(select-keys opts <name>-arg-keys)` next to a `[:map {:closed true} ...]` with the same keys; a metric or event label reading `unknown` right after a merge.

## Raw excerpts
```
L120 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git show 6a761370349:src/metabase/analytics/llm_token_usage.clj | sed -n 50,120p && git log --oneline -3 origin/master -- src/metabase/analytics/llm_token_usage.clj && git show 48d493
L124 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git diff a6ce02d1c60 origin/master -- src/metabase/analytics/llm_token_usage.clj test/metabase/analytics/llm_token_usage_test.clj && git grep -n "prometheus-arg-keys\|snowplow-arg-key
L125 [RESULT] diff --git a/src/metabase/analytics/llm_token_usage.clj b/src/metabase/analytics/llm_token_usage.clj
    +   [malli.util :as mut]
        [metab [...4016 chars...] tics/llm_token_usage.clj:122:    (track-snowplow! (select-keys opts snowplow-arg-keys)))
    src/metabase/analytics/llm_token_usage.clj:124:    (track-prometheus! (select-keys opts prometheus-arg-keys))))
L136 [CALL] Edit ~/src/mb/wt/<worktree>/src/metabase/analytics/llm_token_usage.clj: old='(def ^:private prometheus-arg-keys\n  [:model-id :tag :prompt-tokens ...' new='(def ^:private prometheus-arg-keys\n  [:model-id :provider :tag :prompt-tokens ...'
```
