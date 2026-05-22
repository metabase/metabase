# BOT-1515 — Quality Score Implementation Progress

Companion to `quality-score-impl.md`. Section references (§N) below
point into that doc; approach-doc references (§A.x / §B.x) point into
`notes/bot-1569/bot-1515-impl-approach.md`.

## Working agreement

- The user directs which phase to work on next. Implementation should
  **pause and yield back to the user between phases** — e.g. once
  Phase 1 is accomplished, stop before starting Phase 2 and wait for
  direction. This matches the BOT-1569 working agreement.
- When a phase is completed, update this progress doc: check off the
  line items that were finished, and append a brief **Summary / key
  findings** subsection at the end of that phase's section capturing
  remarks worth carrying forward (decisions made, surprises, deviations
  from the impl plan, verification results).
- Keep the summary subsection terse — a few bullets — not a rehash of
  the checklist.

---

## Global conventions to settle during Phase 1

These are conventions the impl plan locks in as defaults. They are
re-stated here so that any deviation surfaced during implementation
gets recorded as a key finding rather than buried in code.

- Composite version is `"v2.0"`. Bumps on any change that would alter
  a previously-scored conversation's value.
- Score range is `[0, 1]`, 1 = healthy.
- Memory-only refs (`query_id`, `chart_id`, `chart_config_id`) are
  excluded upstream by BOT-1569 — scoring never has to dedup them out.
- Entity key in extract is `[type id-str]` with `id-str = (str id)`.
  Stable across int / string ids (some inspection tools return string
  ids for aggregation aliases).
- Database refs are filtered from CONV_Q. Anchoring default #5;
  re-open if substitution detection ever wants to distinguish
  "wrong database" from "wrong table within the right database."
- **Sentinel breakdowns.** For conversations the pipeline declines to
  score, `metabot_conversation.quality_breakdown` holds the JSON shape
  `{"version": "v2.0", "unscoreable": "<reason>"}` and `quality_score`
  stays NULL. Reasons used in MVP:
  - `pre-foundation` — conversation predates the BOT-1569 persisted
    primitives (no `:entity-usage` on any tool result, no
    `prompt-context` block on any user row).
  - `extract-error` — extract step threw on a post-BOT-1569 row.
  - `stub` — Phase 1 placeholder used to prove the integration
    end-to-end before real compute lands.

  Writing a sentinel is what stops the backfill task from re-discovering
  the row tomorrow (discovery is `WHERE quality_breakdown IS NULL`).
- Concern signal magnitudes ∈ `[0, 1]`, 0 = no signal, 1 = max. The
  signal vector is persisted as `concern_signals` (not `concerns`) in
  the `quality_breakdown` JSON, and per-observable in
  `quality_attribution` under the `concern_signal` field.
- Scoring safety guard is **log-only** at MVP. A Prometheus / Snowplow
  instrumentation pass is a follow-up task; do not add metric emits
  inside the guard during this implementation.

---

## Phase 1 — Schema, scaffold, terminal-state plumbing (§Phase 1)

End state: every new conversation gets a `quality_breakdown` row with
a stub value at finalize time. Integration point is wired and proven
not to roll back the user-visible UPDATE on a scoring throw. The
terminal-state data part is being emitted by the agent loop and
persisted.

### Schema

- [ ] Liquibase migration `resources/migrations/062/<YYYYMMDD>_metabot_quality_score.yaml`
  - [ ] Changeset: `addColumn metabot_conversation.quality_score` (double, nullable)
  - [ ] Changeset: `addColumn metabot_conversation.quality_breakdown` (text, nullable)
  - [ ] Changeset: `addColumn metabot_message.quality_attribution` (text, nullable)
- [ ] Confirm migration applies cleanly to dev appdb (postgres + h2)
- [ ] Confirm migration applies cleanly to a fresh app DB initialization

### Model transforms

- [ ] Extend `models/metabot_conversation.clj` `deftransforms` with
  `:quality_breakdown mi/transform-json`
- [ ] Extend `models/metabot_message.clj` `deftransforms` with
  `:quality_attribution mi/transform-json`

### Constants + stub

- [ ] Create `src/metabase/metabot/quality/constants.clj`
  - [ ] `composite-version` = `"v2.0"`
  - [ ] Saturation constants placeholders (`C-substitution`,
    `C-grounding`, `C-rediscovery`, `query-similarity-threshold`,
    `eh-mitigation-floor`, target ratios — values to be set during
    Phase 5)
- [ ] Create `src/metabase/metabot/quality/core.clj` with the stub
  - [ ] Public `score-conversation!` that returns `:sentinel` and writes
    `{"version": "v2.0", "unscoreable": "stub"}` to the conversation's
    `quality_breakdown` column. `quality_score` stays NULL.
  - [ ] Inner try/catch (log-only) on any throw — no Prometheus /
    Snowplow emit here; telemetry is a follow-up task

### Integration into finalize

- [ ] Wire `quality.core/score-conversation!` into
  `persistence.clj/finalize-assistant-turn!`
  - [ ] Call site is inside the existing `t2/with-transaction` block
  - [ ] Outer try/catch (log-only) around the call is defense-in-depth
    for any throw that escapes the inner guard (e.g. a throw from
    `profile-id-for-conversation`)
  - [ ] Confirm a throw inside `score-conversation!` does not roll back
    the user-visible message UPDATE

### Terminal-state plumbing

- [ ] Extend `src/metabase/metabot/agent/streaming.clj`
  - [ ] `terminal-state-type` = `"terminal_state"`
  - [ ] `terminal-state-part` constructor producing
    `{:type :data :data-type "terminal_state" :version 1 :data {:reason "..."}}`
- [ ] Extend `src/metabase/metabot/agent/core.clj/loop-step`
  - [ ] Emit `terminal-state-part` from **both** `:done` branches:
    - Normal completion (`:else` of the inner `cond`) — carry the
      existing `finish-reason` keyword (`:max-iterations` /
      `:final-response` / `:stop`)
    - Empty-parts exit (the `(if (empty? parts) …)` outer branch) —
      carry `:empty-response` for the rare case where the LLM call
      returned zero AISDK parts
  - [ ] Each emission goes *before* the existing `final-state-part`
  - [ ] Map the agent-loop's exit reasons to the persisted
    categorical:
    - `:max-iterations` → `:iter_cap`
    - `:final-response` → `:final_response`
    - `:stop`           → `:model_signaled_done`
    - `:empty-response` → `:error` (degenerate completion; treated as
      termination failure by concern signal 6)
- [ ] Confirm `agent/streaming.clj/persistable-data-part?` returns true
  for the new type (it's not a `state` data part, so it should already)
- [ ] Confirm `persistence.clj/convert-content-block` falls through to
  `nil` for unknown `data-type` values (existing behavior; pin with a
  test below)
- [ ] Document the orthogonality with `metabot_message.error`: the
  `error` column captures *why a turn failed*; `terminal_state`
  captures *how the loop exited*. The new plumbing does not modify
  the population logic of the `error` column.

### Tests

- [ ] `test/metabase/metabot/quality/core_test.clj`
  - [ ] Stub `score-conversation!` writes the sentinel breakdown shape
  - [ ] End-to-end finalize integration: a finalized turn writes
    `quality_breakdown` on `metabot_conversation`
  - [ ] Throw inside `score-conversation!` doesn't roll back the
    message UPDATE
  - [ ] Outer guard at the integration site catches throws that escape
    the inner guard
- [ ] `test/metabase/metabot/agent/core_test.clj`
  - [ ] `terminal_state` data part emitted on each of `:max-iterations`,
    `:final-response`, `:stop`
  - [ ] `terminal_state` data part emitted with `:empty-response`
    reason when the LLM returns zero parts
  - [ ] Part's `:reason` matches the projected categorical
- [ ] `test/metabase/metabot/persistence_test.clj`
  - [ ] `terminal-state-data-part-is-not-rendered-as-chat-message-test`

### Cleanup

- [ ] Kondo clean on every touched file:
  ```bash
  ./bin/mage kondo src/metabase/metabot/quality/ \
                    src/metabase/metabot/persistence.clj \
                    src/metabase/metabot/agent/core.clj \
                    src/metabase/metabot/agent/streaming.clj \
                    src/metabase/metabot/models/metabot_conversation.clj \
                    src/metabase/metabot/models/metabot_message.clj
  ```

### Phase 1 — Summary / key findings

_(to be filled in once Phase 1 is complete)_

---

## Phase 2 — Layer 1 atoms + sets (§Phase 2)

End state: pure-code extract works against fixture conversations.
`score-conversation!` is still the stub.

- [ ] Create `src/metabase/metabot/quality/extract.clj`
- [ ] `normalize` builds the struct documented in §B
  - [ ] `:messages` — sorted by `created_at, id`
  - [ ] `:tool-events` — paired tool-input/tool-output by id, flat stream
  - [ ] `:tool-events[*].tool-type` — looked up from registered tool
    metadata in `metabase.metabot.tools`
  - [ ] `:tool-events[*].iteration-index` — BOT-1569 iter-count convention
    (maximal run of consecutive text/tool-input parts)
  - [ ] `:prompt-context` — union over all user-row `data[1]` blocks
- [ ] Set construction:
  - [ ] CONV_P — union of `user_is_viewing` + `mentioned_refs` +
    `user_recently_viewed` across user rows (all three sub-channels
    collapse into a single set at the scoring layer)
  - [ ] CONV_D — union of `:output` refs from `:tool-type ∈ {:discovery :hybrid}`
  - [ ] CONV_Q — union of `:input` refs from `:tool-type = :authoring`,
    with database refs filtered out
  - [ ] CONV_I — union of `:input` refs from `:tool-type = :inspection`
  - [ ] CONV_H — `CONV_Q \ (CONV_P ∪ CONV_D)` by set arithmetic
- [ ] Atom-record carries `:type`, `:id`, `:id-str`, `:provenance` (list
  of `{:set :call-id :iteration :metadata}`), `:t-first-seen` (set by
  extract; `:t-first-used` set by temporal.clj)
- [ ] Entity key = `[type id-str]`; helper `entity-key` for stable dedup
- [ ] Tool-type lookup helper that resolves a tool name to its declared
  `:tool-type` from the registered tools map
- [ ] Unit tests in `test/metabase/metabot/quality/extract_test.clj`
  - [ ] Fixture: representative `internal`-profile conversation
  - [ ] Fixture: `sql`-profile conversation
  - [ ] Fixture: `transforms_codegen` conversation
  - [ ] Hallucination scenario (authoring ref ∉ P/D ⇒ E ∈ CONV_H)
  - [ ] Structural-overlap scenario (field in Q whose parent table is in D)
  - [ ] Database ref appearing in an authoring tool's args is filtered out
    of CONV_Q
  - [ ] Mixed-type ids (int + string) dedup correctly under `[type id-str]`
  - [ ] Pre-foundation conversation (no entity-usage anywhere)
- [ ] Kondo clean on `src/metabase/metabot/quality/extract.clj`

### Phase 2 — Summary / key findings

_(to be filled in once Phase 2 is complete)_

---

## Phase 3 — Layer 0 enrichment (§Phase 3)

End state: governance facts batched into the normalized struct. No
score change yet.

- [ ] Create `src/metabase/metabot/quality/governance.clj`
- [ ] `resolve` returns map keyed by `[type id-str]` (see §C for shape)
- [ ] Card query: `report_card` LEFT JOIN `collection` + `moderation_review`
  - [ ] Covers card-type entities: `card`, `question`, `model`, `metric`
  - [ ] Surfaces `:verified?`, `:lives-in-personal?`, `:name`,
    `:source-card-id`
- [ ] Table query: `metabase_table`
  - [ ] Surfaces `:schema`, `:db-id`, `:name`
- [ ] Minimal lookup for dashboards / databases / transforms (`:name`
  only — used for attribution debugging)
- [ ] No `:archived?` / `:deleted?` fact surfaced; metabot search
  hard-codes `:archived false`, so an archived entity in CONV_Q can
  only have entered via a user-provided reference. Not modeled as a
  selection-quality signal. (Anchoring default #11.)
- [ ] Source-card ancestry walks memoized per `score-conversation!`
  invocation (local `memoize` inside the call scope, dropped after)
- [ ] Unit tests in `test/metabase/metabot/quality/governance_test.clj`
  - [ ] `t2.with-temp` fixtures cover: verified card, unverified card,
    personal-collection card, model-of-card
  - [ ] Batched query returns the expected `{[type id-str] → facts}` map
  - [ ] Source-card ancestry walk terminates correctly on a root card
  - [ ] Source-card ancestry walk handles a cycle defensively (returns
    after first repeat)
- [ ] Kondo clean on `src/metabase/metabot/quality/governance.clj`

### Phase 3 — Summary / key findings

_(to be filled in once Phase 3 is complete)_

---

## Phase 4 — Layer 2 temporality (§Phase 4)

End state: pure-code temporal derivations work against fixture
conversations. Terminal-state can be read from the new data part.

- [ ] Create `src/metabase/metabot/quality/temporal.clj`
- [ ] `derive` populates `:t-first-seen` / `:t-first-used` on each
  set's atom records
- [ ] Compute the `:temporal` block of the normalized struct (§D):
  - [ ] `:iterations` — total
  - [ ] `:thrash-events` — normalized Levenshtein on serialized args,
    adjacent same-function calls, similarity ≥
    `query-similarity-threshold` (from `constants.clj`; default 0.8)
  - [ ] `:rediscovery-r` — cluster search-tool query strings by
    normalized-Levenshtein similarity ≥ `query-similarity-threshold`;
    `r = N_search − N_clusters` (count of search calls that duplicate
    an earlier one). Five identical searches → `r = 4`.
  - [ ] `:errors-resolved-rate` — same-function + same-target
    next-attempt matching, computed directly from `:tool-events[*].error`
- [ ] Terminal-state classification with priority order:
  1. `terminal_state` data part in any assistant row's `:data` —
     projected per the mapping table in §I (includes `empty_response`
     → `:error`)
  2. `metabot_message.error` non-nil → `:error`
  3. `metabot_message.finished = false` → `:aborted` (recorded; treated
     as `:error` for concern signal 6 but surfaced separately in the
     breakdown context)
  4. Default → `:model_signaled_done`
- [ ] Unit tests in `test/metabase/metabot/quality/temporal_test.clj`
  - [ ] Productive iteration (errors decreasing) — high
    `errors-resolved-rate`
  - [ ] Thrash (errors flat / oscillating) — low rate
  - [ ] Re-discovery detection across two near-identical search queries
  - [ ] Terminal-state — one fixture per category, including the
    fallback chain when no data part is present
- [ ] Kondo clean on `src/metabase/metabot/quality/temporal.clj`

### Phase 4 — Summary / key findings

_(to be filled in once Phase 4 is complete)_

---

## Phase 5 — Layer 3 concern signals (§Phase 5)

End state: six concern signal magnitudes in `[0, 1]` against fixture
conversations. Saturation constants calibrated against representative
fixtures.

- [ ] Create `src/metabase/metabot/quality/concern_signals.clj`
- [ ] Selection-quality signal (§E table)
  - [ ] Substitution detection for cards and tables (anchoring default #7)
  - [ ] `% CONV_Q in personal-collection`
- [ ] Grounding signal — three-bucket variant (§E)
  - [ ] Helper `bucket-CONV_Q` classifies into `:grounded_via_P` /
    `:grounded_via_D` / `:ambiguous`
  - [ ] Signal computed against `:ambiguous` only:
    `|amb| / (|amb| + C-grounding)`
- [ ] Discovery-efficiency signal
  - [ ] `surfaced-but-unused-fraction` (`|CONV_D \ CONV_Q| / |CONV_D|`)
  - [ ] `avg-rank-used` normalized against typical result-list length
  - [ ] `r` (re-discovery count from temporal layer) saturated as
    `r / (r + C-rediscovery)`
- [ ] Execution-health signal — floor-bounded boost (§E):
  ```
  let p = 1 − success_rate
  let u = 1 − errors_resolved_rate
  signal = p × (α + (1 − α) × u)        ; α = eh-mitigation-floor
  ```
- [ ] Conversational-economy signal
  - [ ] `iterations / max(1, |CONV_Q|)` saturated above target ratio
  - [ ] `thrash-events` saturated
  - [ ] Max per-entity reuse count saturated above baseline (e.g. 2)
- [ ] Termination signal — categorical map
  - [ ] `model_signaled_done` → 0
  - [ ] `final_response` → 0
  - [ ] `iter_cap` → 1
  - [ ] `error` → 1
- [ ] Set saturation constants in `constants.clj` to values that produce
  sensible magnitudes on representative fixtures (these are design-time
  choices, not corpus-derived thresholds). Includes
  `eh-mitigation-floor` (default 0.5) and `query-similarity-threshold`
  (default 0.8, shared with thrash detection).
- [ ] Unit tests in `test/metabase/metabot/quality/concern_signals_test.clj`
  - [ ] Each signal at 0 on a "healthy" fixture
  - [ ] Each signal at 1 (or near-1) on a worst-case fixture
  - [ ] Execution-health: floor is hit when `errors_resolved_rate = 1`;
    full penalty when `errors_resolved_rate = 0`
  - [ ] Substitution detection — positive case (verified sibling in
    CONV_D), negative case, edge case (similar name but different
    schema), edge case (model-of-card lineage)
  - [ ] Three-bucket grounding — each bucket exercised
- [ ] Kondo clean on `src/metabase/metabot/quality/concern_signals.clj`

### Phase 5 — Summary / key findings

_(to be filled in once Phase 5 is complete)_

---

## Phase 6 — Layer 4 subscores + wire-up (§Phase 6)

End state: real scores are written to `metabot_conversation.quality_score`
and `quality_breakdown`. The Phase-1 stub is gone.

- [ ] Create `src/metabase/metabot/quality/subscores.clj`
- [ ] A/B/C/D subscores per §F:
  - [ ] Subscore A = `1 − mean(selection-quality, grounding)`,
    N/A iff `|CONV_Q| = 0` AND no authoring tool was ever called
  - [ ] Subscore B = `1 − discovery-efficiency`, N/A iff `|CONV_D| = 0`
  - [ ] Subscore C = `1 − execution-health`, always applicable
  - [ ] Subscore D = `1 − mean(conversational-economy, termination)`,
    always applicable
  - [ ] Composite = geometric mean over non-N/A subscores
  - [ ] `artifact-intended?` derived from `:tool-events` (presence of
    any `:authoring` event), not from the profile
- [ ] Replace the Phase-1 stub in `quality/core.clj`:
  - [ ] `compute-conversation-score` wires extract → governance →
    temporal → concern signals → subscores
  - [ ] Build the `quality_breakdown` JSON per the §Storage formats shape
  - [ ] Persist `quality_score` and `quality_breakdown` on the
    conversation (single UPDATE)
  - [ ] `pre-foundation?` detection (§H) writes the `pre-foundation`
    sentinel — predicate is: no assistant message row carries a
    `:tool-output` with `:structured-output.entity-usage` populated,
    **and** no user row carries a `data[1] {:type "prompt-context"}`
    block. Both negatives must hold; either signal present means
    we have enough Layer-0 atoms to run the pipeline.
  - [ ] `extract-error` sentinel written if extract throws (defense
    against missing/malformed `entity-usage` shapes on rows that
    nominally come post-BOT-1569 but are corrupt)
- [ ] Unit tests in `test/metabase/metabot/quality/subscores_test.clj`
  - [ ] Geometric-mean composite over non-N/A subscores
  - [ ] Subscore A N/A when no authoring tool was called
  - [ ] Subscore B N/A when no discovery happened
  - [ ] Weakest-link domination (one bad subscore craters the composite)
- [ ] End-to-end test in `quality/core_test.clj`:
  - [ ] Seed a representative conversation via Toucan; call
    `score-conversation!`; read back `quality_score` and
    `quality_breakdown`; assert shape and approximate composite value
  - [ ] Pre-foundation conversation → `quality_score = NULL`,
    `quality_breakdown.unscoreable = "pre-foundation"`
  - [ ] Extract-error conversation → `quality_score = NULL`,
    `quality_breakdown.unscoreable = "extract-error"`
- [ ] Kondo clean on `src/metabase/metabot/quality/subscores.clj`,
  `quality/core.clj`

### Phase 6 — Summary / key findings

_(to be filled in once Phase 6 is complete)_

---

## Phase 7 — Per-turn attribution (§Phase 7)

End state: every assistant row carries a `quality_attribution` JSON
shape with observables + prefix-subscores. The conversation's last
assistant row's `prefix_subscores` matches the conversation-level
breakdown.

- [ ] Create `src/metabase/metabot/quality/attribution.clj`
- [ ] `project` returns `{message-id → attribution-map}` (one entry per
  assistant row)
- [ ] Each observable carries a `concern_signal` field naming the
  signal it traces back to (matches the JSON key in storage format)
- [ ] Observable kinds per §G's table:
  - [ ] `canonical-bypass` — selection-quality
  - [ ] `personal-collection-pick` — selection-quality
  - [ ] `hallucinated-ref` — grounding
  - [ ] `unused-surfacing` — discovery-efficiency
  - [ ] `rediscovery` — discovery-efficiency
  - [ ] `tool-error` — execution-health
  - [ ] `thrash-event` — conversational-economy
  - [ ] `iter-cap` — termination
  - [ ] `error-termination` — termination
- [ ] Attribution rules:
  - [ ] `canonical-bypass` lands on the bypass turn with a
    `canonical-surfacing-turn` back-reference
  - [ ] `tool-error` lands on the errored call's turn
  - [ ] `hallucinated-ref` lands on the turn where the ref entered
    CONV_Q
  - [ ] `unused-surfacing` lands on the discovery call's turn
  - [ ] `rediscovery` lands on the turn of the duplicate search call
    (the one that re-asked for what an earlier call already surfaced)
  - [ ] `thrash-event` lands on the second-in-pair turn
  - [ ] `iter-cap` / `error-termination` land on the last assistant turn
- [ ] `prefix_subscores` per turn:
  - [ ] Restrict `:tool-events` and `:sets` to events with
    `:iteration-index ≤ end-iteration-of-turn-N`
  - [ ] Re-use `subscores/compose` on the restricted struct
  - [ ] Cache per-turn-prefix computations so projecting onto N turns
    doesn't re-derive Layers 1–4 N times
- [ ] Extend `quality/core.clj`:
  - [ ] `compute-conversation-score` returns `:quality_attribution` as
    `{message-id → ...}` map
  - [ ] Persistence: a single bulk UPDATE per row, or one UPDATE per
    `(message-id, json)` pair — choose the cheaper option once measured
- [ ] Unit tests in `test/metabase/metabot/quality/attribution_test.clj`
  - [ ] `canonical-bypass` attribution lands on the bypass turn with
    the correct back-reference
  - [ ] `tool-error` attribution lands on the errored turn
  - [ ] Last-turn `prefix_subscores` matches the conversation-level
    breakdown
  - [ ] 10-turn fixture conversation produces 10 attribution blocks,
    each with non-trivial `prefix_subscores`
- [ ] End-to-end test in `quality/core_test.clj`:
  - [ ] After finalize, every assistant row has `quality_attribution`
    populated; user rows have `quality_attribution = NULL`
- [ ] Kondo clean on `src/metabase/metabot/quality/attribution.clj`

### Phase 7 — Summary / key findings

_(to be filled in once Phase 7 is complete)_

---

## Phase 8 — Backfill task (§Phase 8)

End state: pre-foundation conversations get marked with the sentinel on
a daily cron.

- [ ] Create `src/metabase/metabot/task/quality_score_backfill.clj`
- [ ] Job key + trigger key follow the existing convention
- [ ] `batch-size` = 500
- [ ] `unprocessed-conversation-ids`:
  - [ ] Selects `metabot_conversation.id WHERE quality_breakdown IS NULL`
  - [ ] `ORDER BY created_at DESC` so freshly-finalized rows score
    before historical backlog
  - [ ] `LIMIT batch-size`
- [ ] `backfill-quality-scores!` loop:
  - [ ] Skip-set per run (rows whose `score-conversation!` returned `nil`
    don't get re-discovered within the same run)
  - [ ] Categorize results by return type: number (scored), `:sentinel`
    (sentinel breakdown written), `nil` (throw)
  - [ ] Log iteration summary
- [ ] Quartz schedule: daily at `02:17:43` (off-the-hour, low-traffic
  overnight window)
- [ ] Wire-up via `defmethod task/init! ::QualityScoreBackfill`
- [ ] Comment-block REPL helper `debug-backfill-sample!`
  - [ ] Bypasses the inner catch boundary so throws are visible
  - [ ] Read-only — does not write to the DB
- [ ] Unit tests in
  `test/metabase/metabot/task/quality_score_backfill_test.clj`
  - [ ] Discovery query returns IDs of conversations where
    `quality_breakdown IS NULL`
  - [ ] Per-id loop tolerates throws and continues
  - [ ] Sentinel breakdown is written for pre-foundation conversations
    so they're not re-discovered tomorrow
  - [ ] Newest-first ordering
- [ ] Kondo clean

### Phase 8 — Summary / key findings

_(to be filled in once Phase 8 is complete)_

---

## Phase 9 — EE analytics surface (§Phase 9)

End state: EE admin pages surface the quality breakdown + per-turn
attribution via the existing conversation-detail endpoint and the
analytics view. Aggregate analytics endpoints are intentionally
**out of scope** for this PR.

- [ ] Analytics view v4
  - [ ] Add `resources/migrations/instance_analytics_views/metabot_conversations/v4/postgres-metabot_conversations.sql`
  - [ ] Add v4 `mysql-metabot_conversations.sql`
  - [ ] Add v4 `h2-metabot_conversations.sql`
  - [ ] Each variant extends v3 by projecting `c.quality_score` and
    `c.quality_breakdown`
  - [ ] Add changeset in `062/<date>_metabot_quality_score.yaml`
    installing the v4 view per the prior-version `runOnChange: true`
    pattern; rollback `DROP VIEW IF EXISTS v_metabot_conversations`
- [ ] EE conversation-detail response shape
  - [ ] Extend `fetch-conversation-detail` in
    `enterprise/.../metabot_analytics/conversations.clj` to surface
    `quality_score` and `quality_breakdown` at the conversation level
  - [ ] Surface `quality_attribution` per assistant message (carried
    alongside each assistant `chat_messages` entry, or as a parallel
    `{message-external-id → attribution}` map at the conversation
    level — pick whichever ergonomics the admin UI consumes more
    cleanly)
- [ ] EE-only tests
  - [ ] Detail response includes `quality_score`, `quality_breakdown`,
    and per-assistant-message `quality_attribution` when present
  - [ ] Detail response omits / nils the fields cleanly for
    pre-foundation rows (sentinel breakdown is exposed verbatim)
- [ ] Kondo clean

### Phase 9 — Summary / key findings

_(to be filled in once Phase 9 is complete)_

---

## Phase 10 — Operational verification (§Phase 10)

End state: every profile exercised end-to-end; representative
conversations spot-checked for sensible scores; backfill job exercised
on the historical corpus; ready to merge.

- [ ] Exercise each profile end-to-end against the dev appdb
  (`bot-1569-track-injected-context`) plus a representative
  production-shape snapshot:
  - [ ] `internal`: search → construct → chart → navigate → score lands
  - [ ] `sql`: sql_search → create → edit → clarification → score lands
  - [ ] `transforms_codegen`: search → details → write → score lands
  - [ ] `embedding_next`: nlq_search → construct → chart → score lands
- [ ] Eyeball 5–10 conversations per profile:
  - [ ] Are the subscores defensible to a reviewer reading the
    transcript?
  - [ ] Are observables in `quality_attribution` attributed to the
    right turn?
  - [ ] Is `pre-foundation` correctly applied to pre-BOT-1569 rows?
  - [ ] Does the breakdown lineage trace back to specific entities and
    iterations as the strategy doc promises?
- [ ] Exercise the backfill task against the dev appdb
  - [ ] Sentinel rows are not re-discovered on the next run
  - [ ] Scoreable rows get scored cleanly
- [ ] Confirm zero `score-conversation!` errors in the app log after
  a representative session — any errors indicate a real bug
- [ ] Measure row-size impact
  - [ ] `quality_breakdown` ≈ few-hundred bytes per conversation
  - [ ] `quality_attribution` ≈ low-KB per assistant row
- [ ] Measure in-tx compute cost (anchoring default #1)
  - [ ] If P95 in-tx scoring time exceeds ~50 ms, file a follow-up to
    detach to an async tail
- [ ] Kondo clean across all touched files
- [ ] Test suite green:
  ```bash
  ./bin/mage kondo src/metabase/metabot/quality/ \
                    src/metabase/metabot/task/quality_score_backfill.clj \
                    src/metabase/metabot/persistence.clj \
                    src/metabase/metabot/agent/core.clj \
                    src/metabase/metabot/agent/streaming.clj
  ./bin/test-agent :only '[metabase.metabot.quality.core-test
                           metabase.metabot.quality.extract-test
                           metabase.metabot.quality.governance-test
                           metabase.metabot.quality.temporal-test
                           metabase.metabot.quality.concern-signals-test
                           metabase.metabot.quality.subscores-test
                           metabase.metabot.quality.attribution-test
                           metabase.metabot.task.quality-score-backfill-test
                           metabase.metabot.persistence-test
                           metabase.metabot.agent.core-test]'
  ```

### Phase 10 — Summary / key findings

_(to be filled in once Phase 10 is complete)_

---

## Out of scope for this PR — referenced for cross-check

- Sidecar `ai_tool_usage` / per-entity rollup table (deferred to
  Layer 5)
- Layer 5 — admin-facing aggregate rollups and recommendations
- Aggregate analytics endpoints (score distributions, per-concern-signal
  rollups, etc.) — EE conversation-detail carries the data; aggregate
  surfaces are a follow-up
- Operational telemetry for the scoring guard (Prometheus / Snowplow
  instrumentation around `score-conversation!` is a follow-up)
- Backfill of historical entity-usage (pre-BOT-1569 conversations land
  with the `pre-foundation` sentinel)
- Free-form prompt-text entity extraction (Option-2 Haiku) — the
  three-bucket Grounding variant is the MVP stance
- Async-tail compute (default is in-tx; detach only if perf demands)
- Substitution detection for dashboards / databases / transforms
- Archived / deleted entity modeling (anchoring default #11 — search
  hard-codes `:archived false`, so the signal isn't agent-attributable)
- Corpus-based calibration of saturation constants
- Primitives cut from MVP because no concern signal consumes them —
  full list in `quality-score-impl.md` under "Deferred — primitives no
  MVP concern signal consumes". Summary: `:t-last-used`; governance
  `:authority-level` / `:view-count` / `:view-count-percentile` /
  `:collection-location` / `:creator-id` / `:source-table-id` plus the
  percentile cache; temporal `:tool-calls-per-iteration` /
  `:error-sequence` / `:chain-shapes` / `:chain-histogram`; provenance
  metadata `:uri` / `:verified` / `:database_id` (D) and `:arg_slot`
  (Q)
