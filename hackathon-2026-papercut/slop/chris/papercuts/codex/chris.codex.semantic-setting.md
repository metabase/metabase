# Removed-setting validation treated true as a disable request

Source: Codex session 2026-07-27, [transcript](/Users/christruter/.codex/sessions/2026/07/27/rollout-2026-07-27T19-07-20-019fa48b-9953-7570-af15-0dc141972278.jsonl).

Observed failure: the user suspected that `MB_SEMANTIC_SEARCH_ENABLED=true` could trigger startup validation intended for disabling semantic search ([line 10](/Users/christruter/.codex/sessions/2026/07/27/rollout-2026-07-27T19-07-20-019fa48b-9953-7570-af15-0dc141972278.jsonl#L10)). The agent confirmed that `src/metabase/search/core.clj` checked only whether the environment variable was nonblank, not its Boolean value; `true` therefore entered the disable-consistency branch and could abort startup ([line 35](/Users/christruter/.codex/sessions/2026/07/27/rollout-2026-07-27T19-07-20-019fa48b-9953-7570-af15-0dc141972278.jsonl#L35)).

Mechanism: migration logic treated the presence of a removed setting as equivalent to a false value. The existing `test/metabase/search/engine_test.clj` covered only `false`, so the wrong truthy behavior survived. The transcript traces the change to commit `5616e61f7ac`, PR #77903 ([line 24](/Users/christruter/.codex/sessions/2026/07/27/rollout-2026-07-27T19-07-20-019fa48b-9953-7570-af15-0dc141972278.jsonl#L24)).

Recorded repair: production validation and tests were updated; the focused test passed with 11 assertions ([lines 83–126](/Users/christruter/.codex/sessions/2026/07/27/rollout-2026-07-27T19-07-20-019fa48b-9953-7570-af15-0dc141972278.jsonl#L83)).

Classification: confirmed conditional/migration papercut; potentially blocking startup. The transcript establishes the introducing commit and discovery, not the original author's identity.
