Audit whether these 12 "base-side hardening" commits' semantic intent still exists in this branch's refactored structure. Context: this branch (bot-1306-data-complexity-score) includes a massive refactor
  (49887402ca7 "BOT-1306 Expand complexity score into 5 dimensions with tiered cost") that split complexity.clj into metrics/{common,metadata,nominal,scale,semantic}.clj. During a gs sr, that refactor conflicted
  with 12 hardening commits that had landed on the old structure; we took --theirs (the refactor) for all conflicts, so any hardening delta that collided with the rewrite was dropped. I need to know which deltas
  still need porting to the new structure.

  For each commit below:
  1. git show <sha> to see what it added.
  2. Grep the current worktree to check whether the equivalent guard / test / behavior exists in the refactored code (look across enterprise/backend/src/metabase_enterprise/data_complexity_score/** and its tests,
  not just the original files).
  3. Report one of: kept (intent clearly survives), partial (some survived, some gap — describe), missing (not present — would need porting), obsoleted (no longer applicable in new structure — explain why).

  Commits:
  - 2da27266b40 — :weights in fingerprint & Snowplow params (we already saw complexity/weights is gone; is any weight info fed into the fingerprint/Snowplow now?)
  - 9a49c794796 — Validate ee-complexity-synonym-* settings and honour :threshold opt
  - f8397030a29 — Batch provider-embedder calls, harden synonym-provider setter
  - 66ba80b7740 — Gate synonym-axis meta on provider readiness, propagate embedder errors
  - d7401ad2f92 — Harden provider-embedder empty-batch path, test OpenAI batching
  - d1f107a40e9 — Share OpenAI config validation (readiness gate ↔ resolver)
  - 21be7db541f — Trim OpenAI settings before validating readiness
  - 5b974cf09d1 — Cover provider-embedder empty-streaming-result path
  - cde4e38c7bc — Harden complexity emission duplicate assertions
  - 20732920615 — Harden complexity emission axis assertions
  - 459327db1c5 — Assert normalized axis uniqueness in complexity emission test
  - e5abe75f31f — Raise :threshold cutoff in explicit-embedder test to actually reject

  Don't modify code yet — just produce a report table (commit · verdict · evidence/path · porting notes if missing/partial). Track progress with TaskCreate.
