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

- [x] Liquibase migration `resources/migrations/062/20260522_metabot_quality_score.yaml`
  - [x] Changeset: `addColumn metabot_conversation.quality_score` (double, nullable)
  - [x] Changeset: `addColumn metabot_conversation.quality_breakdown` (text, nullable)
  - [x] Changeset: `addColumn metabot_message.quality_attribution` (text, nullable)
- [x] Confirm migration applies cleanly to dev appdb (postgres — applied via
  REPL `(mdb/migrate! (mdb.conn/data-source) :up)`, 3 changesets ran in 924 ms)
- [ ] Confirm migration applies cleanly to a fresh app DB initialization
      (deferred — fresh-init verification belongs to Phase 10 op-verification)

### Model transforms

- [x] Extend `models/metabot_conversation.clj` `deftransforms` with
  `:quality_breakdown mi/transform-json`
- [x] Extend `models/metabot_message.clj` `deftransforms` with
  `:quality_attribution mi/transform-json`

### Constants + stub

- [x] Create `src/metabase/metabot/quality/constants.clj`
  - [x] `composite-version` = `"v2.0"`
  - [x] Saturation constants placeholders (`C-substitution`,
    `C-grounding`, `C-rediscovery`, `query-similarity-threshold`,
    `eh-mitigation-floor`, `target-iterations-per-artifact`,
    `target-max-entity-reuse` — values to be set during Phase 5)
- [x] Create `src/metabase/metabot/quality/core.clj` with the stub
  - [x] Public `score-conversation!` that returns `:sentinel` and writes
    `{"version": "v2.0", "unscoreable": "stub"}` to the conversation's
    `quality_breakdown` column. `quality_score` stays NULL.
  - [x] Inner try/catch (log-only) on any throw — no Prometheus /
    Snowplow emit here; telemetry is a follow-up task

### Integration into finalize

- [x] Wire `quality.core/score-conversation!` into
  `persistence.clj/finalize-assistant-turn!`
  - [x] Call site is inside the existing `t2/with-transaction` block
  - [x] Outer try/catch (log-only) around the call is defense-in-depth
    for any throw that escapes the inner guard (e.g. a throw from
    `profile-id-for-conversation`)
  - [x] Confirm a throw inside `score-conversation!` does not roll back
    the user-visible message UPDATE (covered by
    `score-conversation-throw-does-not-roll-back-message-update-test`)

### Terminal-state plumbing

- [x] Extend `src/metabase/metabot/agent/streaming.clj`
  - [x] `terminal-state-type` = `"terminal_state"`
  - [x] `terminal-state-part` constructor producing
    `{:type :data :data-type "terminal_state" :version 1 :data {:reason "..."}}`
- [x] Extend `src/metabase/metabot/agent/core.clj/loop-step`
  - [x] Emit `terminal-state-part` from **both** `:done` branches:
    - Normal completion (`:else` of the inner `cond`) — carry the
      existing `finish-reason` keyword (`:max-iterations` /
      `:final-response` / `:stop`)
    - Empty-parts exit (the `(if (empty? parts) …)` outer branch) —
      carry `:empty-response` for the rare case where the LLM call
      returned zero AISDK parts
  - [x] Each emission goes *before* the existing `final-state-part`
  - [x] Map the agent-loop's exit reasons to the persisted
    categorical (mapping happens **inside `terminal-state-part`**;
    callers pass the raw agent-loop reason):
    - `:max-iterations` → `:iter_cap`
    - `:final-response` → `:final_response`
    - `:stop`           → `:model_signaled_done`
    - `:empty-response` → `:error` (degenerate completion; treated as
      termination failure by concern signal 6)
- [x] Confirm `agent/streaming.clj/persistable-data-part?` returns true
  for the new type (pinned by
  `terminal-state-part-is-persistable-data-part-test`)
- [x] **Deviation from the impl plan** —
  `persistence.clj/convert-content-block` does NOT fall through to `nil`
  for unknown `data-type` values; it actually converts every "data"
  block to a `data_part` chat message. To satisfy the chat-render
  invisibility contract claimed in the impl plan, added an explicit
  exclusion of `streaming/terminal-state-type` in `convert-content-block`
  (pinned by the new `terminal_state` skip case in
  `message->chat-messages-test`).
- [x] Document the orthogonality with `metabot_message.error`: the
  `error` column captures *why a turn failed*; `terminal_state`
  captures *how the loop exited*. The new plumbing does not modify
  the population logic of the `error` column. (Captured as a docstring
  on `streaming/terminal-state-type` and as a comment in
  `persistence.clj` next to the `score-conversation!` call.)

### Tests

- [x] `test/metabase/metabot/quality/core_test.clj`
  - [x] Stub `score-conversation!` writes the sentinel breakdown shape
  - [x] End-to-end finalize integration: a finalized turn writes
    `quality_breakdown` on `metabot_conversation`
  - [x] Throw inside `score-conversation!` doesn't roll back the
    message UPDATE
  - [x] Inner guard returns nil on a throw (covered by
    `score-conversation-inner-guard-swallows-throw-returns-nil-test`)
  - [x] Sentinel breakdown is valid JSON that round-trips through
    `mi/transform-json`
- [x] `test/metabase/metabot/agent/streaming_test.clj` —
  `terminal-state-part` projects each known finish-reason and falls
  through to `error` on unknown reasons (covers the categorical
  mapping at unit level)
- [x] `test/metabase/metabot/agent/core_test.clj`
  - [x] `terminal_state` data part emitted with `model_signaled_done`
    on text-only response (`:stop` branch)
  - [x] `terminal_state` data part emitted with `error` reason when
    the LLM returns zero parts (`:empty-response` branch)
  - [x] Terminal-state precedes the final `state` data part in the
    streamed result
  - **Coverage note**: `:max-iterations` and `:final-response` are
    covered at unit level via `terminal-state-part` (the categorical
    mapping is a single static map). Forcing those branches through
    the full agent loop requires real tool execution, which is more
    plumbing than the wiring proof needs in Phase 1. Phase 4
    (`temporal.clj`) will exercise the read path comprehensively.
- [x] `test/metabase/metabot/persistence_test.clj`
  - [x] `terminal_state` data part is dropped by
    `message->chat-messages` (new sub-testing block in
    `message->chat-messages-test`)
- [x] **Bonus deviations** — two pre-existing tests broke on the new
  data-part-in-stream contract and were updated:
  - `metabase.metabot.agent.core-test/integration-search-query-chart-flow-test`
    expected vector now includes the `terminal_state` part before the
    final `state` part.
  - `metabase.metabot.agent.core-test/run-agent-loop-retries-on-rate-limit-test`
    expected vector updated likewise.
  - `metabase.metabot.api-test/native-agent-streaming-test` expected
    persisted assistant `:data` updated to carry the `terminal_state`
    block alongside the text reply.

### Cleanup

- [x] Kondo clean on every touched file:
  ```bash
  ./bin/mage kondo src/metabase/metabot/quality/ \
                    src/metabase/metabot/persistence.clj \
                    src/metabase/metabot/agent/core.clj \
                    src/metabase/metabot/agent/streaming.clj \
                    src/metabase/metabot/models/metabot_conversation.clj \
                    src/metabase/metabot/models/metabot_message.clj
  ```
  → errors: 0, warnings: 0

### Phase 1 — Summary / key findings

- **All Phase 1 work landed**: schema, transforms, constants, stub,
  finalize integration, terminal-state emission, FE-safety skip in
  `convert-content-block`, and tests covering the sentinel write,
  rollback safety, the inner/outer guard contract, the categorical
  mapping, and stream emission for two of the four agent-loop
  exit branches.

- **Chat-render safety required a real change**, not just a test.
  The impl plan claimed `convert-content-block` "falls through to nil
  for unknown data-type values"; in reality it converts every
  `{:type "data"}` block to a `data_part` chat message. A
  `terminal_state` data part would have surfaced as an unrecognized
  `data_part` to the FE, which uses an exhaustive `ts-pattern.match`
  that logs `"AgentDataPartMessage received an unexpected value"` and
  returns null. Added explicit `(not= terminal-state-type
  (:data-type block))` to the `data`-block branch so the chat stream
  stays unchanged. The persisted data column still carries the part —
  that's what the quality-score temporal layer (Phase 4) will read.

- **Mapping placement decision**: the impl plan was ambiguous about
  whether `temporal.clj` or `terminal-state-part` does the
  finish-reason → categorical projection. I put it inside
  `terminal-state-part` so the persisted data is in its
  consumer-ready form (the data-part's `:data {:reason "iter_cap"}`,
  not `{:reason "max-iterations"}`). Unknown / future reasons fall
  through to `error` — the conservative classification for concern
  signal 6 (Termination).

- **Pre-existing tests needed updates**: three integration tests
  asserted on the streamed-result vector positionally and broke when
  `terminal_state` slid in before `state`. Updated each to include the
  new part. Worth noting because Phase 4's read-side tests will assert
  on the categorical for additional exit reasons.

- **Test-run cost**:
  - `metabase.metabot.quality.core-test` — 4 tests / 8 assertions, ~1 s
  - `metabase.metabot.agent.streaming-test` — 17 tests / 115
    assertions, ~1 s
  - `metabase.metabot.agent.core-test` — 17 tests / 80 assertions,
    ~45 s (existing integration tests dominate)
  - `metabase.metabot.persistence-test` — 27 tests / 166 assertions,
    ~15 s
  - `metabase.metabot.api-test` — 39 tests / 176 assertions, ~30 s
  - EE `metabase-enterprise.metabot-analytics.*-test` — 40 tests /
    155 assertions, ~26 s (smoke confirmation; no EE namespace
    touched in Phase 1)
  - All green.

- **Sample sentinel row written to dev appdb during test runs**:
  `metabot_conversation.quality_breakdown =
  '{"version":"v2.0","unscoreable":"stub"}'`,
  `quality_score = NULL`. Backfill task (Phase 8) will treat these
  as "tried; do not retry tomorrow."

- **Carry-forward for Phase 4**: when temporal.clj reads
  `terminal_state` data parts back out, it should expect the
  *categorical* value (not the raw finish-reason). The fallback chain
  in §D ("data part → error col → finished col → default") still
  applies for pre-Phase-1 rows.

---

## Phase 2 — Layer 1 atoms + sets (§Phase 2)

End state: pure-code extract works against fixture conversations.
`score-conversation!` is still the stub.

- [x] Create `src/metabase/metabot/quality/extract.clj`
- [x] `normalize` builds the struct documented in §B
  - [x] `:messages` — sorted by `created_at, id`
  - [x] `:tool-events` — paired tool-input/tool-output by id, flat stream
  - [x] `:tool-events[*].tool-type` — looked up from registered tool
    metadata in `metabase.metabot.tools`
  - [x] `:tool-events[*].iteration-index` — BOT-1569 iter-count convention
    (maximal run of consecutive text/tool-input parts)
  - [x] `:prompt-context` — union over all user-row `data[1]` blocks
- [x] Set construction:
  - [x] CONV_P — union of `user_is_viewing` + `mentioned_refs` +
    `user_recently_viewed` across user rows (all three sub-channels
    collapse into a single set at the scoring layer)
  - [x] CONV_D — union of `:output` refs from `:tool-type ∈ {:discovery :hybrid}`
  - [x] CONV_Q — union of `:input` refs from `:tool-type = :authoring`,
    with database refs filtered out
  - [x] CONV_I — union of `:input` refs from `:tool-type ∈ {:inspection :hybrid}`
    (hybrid inputs are the agent fetching details about an already-known
    entity — semantically the same as an inspection-typed call)
  - [x] CONV_H — `CONV_Q \ (CONV_P ∪ CONV_D)` by set arithmetic
- [x] Atom-record carries `:type`, `:id`, `:id-str`, `:provenance` (list
  of `{:set :call-id :iteration :metadata}`), `:t-first-seen` (set by
  extract; `:t-first-used` set by temporal.clj)
- [x] Entity key = `[type id-str]`; helper `entity-key` for stable dedup
- [x] Tool-type lookup helper that resolves a tool name to its declared
  `:tool-type` from the registered tools map
- [x] Unit tests in `test/metabase/metabot/quality/extract_test.clj`
  - [x] Fixture: representative `internal`-profile conversation
  - [x] Fixture: `sql`-profile conversation
  - [x] Fixture: `transforms_codegen` conversation
  - [x] Hallucination scenario (authoring ref ∉ P/D ⇒ E ∈ CONV_H)
  - [x] Structural-overlap scenario (field in Q whose parent table is in D)
  - [x] Database ref appearing in an authoring tool's args is filtered out
    of CONV_Q
  - [x] Mixed-type ids (int + string) dedup correctly under `[type id-str]`
  - [x] Pre-foundation conversation (no entity-usage anywhere)
- [x] Kondo clean on `src/metabase/metabot/quality/extract.clj`

### Phase 2 — Summary / key findings

- **All Phase 2 work landed**: `extract.clj` with `normalize` as the
  single public entry point, plus a static `tool-type-for` lookup that
  resolves tool-name strings against `metabase.metabot.tools` var
  metadata. 22 unit tests / 73 assertions cover the contract.

- **Iteration index is monotonic across the whole conversation**, not
  per-row. The impl plan describes the boundary signal in terms of one
  assistant row's `:data` (a `:tool-input` after a streak of
  `:tool-output`s = the LLM was called again), but Phase 4's `:iterations
  = (inc (max iteration-index))` derivation only makes sense if the
  counter doesn't reset across rows. Implementation: every new
  assistant row starts with `:start-phase :output` so the row's first
  `:text` or `:tool-input` triggers an iter++ via the same rule the
  in-row boundary uses, regardless of whether the previous row ended on
  text or tool-output. Documented in the namespace docstring so the
  rationale is discoverable from `extract.clj` alone.

- **JSON round-trip shape**: post-`mi/transform-json`, map *keys* come
  back as keywords but string *values* (the `:type` of a part, the
  `:type` of an entity-usage entry) stay strings. The set-construction
  code branches on those string values throughout. Documented in the ns
  docstring so future contributors don't try to compare against `:text`
  or `:tool-input` keywords.

- **`:tool-type` is `:utility` for `nil` lookups by convention**: tools
  registered after the namespace loaded, or test fixtures that name an
  unregistered tool, get a `nil` tool-type from `tool-type-for`. The
  set-construction code skips them (no `cond->` clause matches), so
  they emit a tool-event with empty `:input`/`:output` and don't
  contribute to any set — the same behavior as a real `:utility` tool
  whose `:entity-usage` is forbidden.

- **`:hybrid` tools land in both `:I` and `:D`**: `read_resource` is the
  only hybrid tool today. Its `:input` URI is the agent fetching details
  about a known entity (→ `:I`); its `:output` is what the dispatch
  surfaced from that URI (→ `:D`). A single `read_resource` call can
  populate both sides simultaneously.

- **Database refs filtered from CONV_Q only**, per anchoring default #5.
  Tests pin both that `{:type "database"}` is dropped from CONV_Q and
  that all other types pass through. The filter is at the
  `accumulate-tool-events` choke point, not in `entity-ref?`, so the
  filter is locally inspectable and easy to relax if we ever want
  "wrong database" attribution.

- **CONV_P entries claim `:iteration` from the *next* assistant row**:
  prompt-context blocks live on user rows but the agent only acts on
  them when the LLM is called next. Implementation: pair each user row
  with the `:first-iter` of the assistant row that follows. For a
  trailing user-row with no assistant turn (in-flight conversation),
  `:iteration` is `nil`.

- **Bug caught during testing**: the first cut of
  `pair-user-rows-with-next-iter` used `(some assistant-row? rest-rows)`
  which returns the boolean predicate result, not the matched row.
  Fixed to `(first (filter assistant-row? rest-rows))`. The unit test
  for "channel provenance recorded on each :P atom" exposed it.

- **Auto-boxing in the loop**: the top-level `loop` in
  `annotate-conversation` triggered an auto-boxing warning because the
  recur value (`next-iter` out of `annotate-iterations`) is Object but
  the initial literal `0` is a primitive long. Fixed by initializing
  with `(Long/valueOf 0)` so the binding is boxed throughout.

- **Test-run cost**:
  - `metabase.metabot.quality.extract-test` — 22 tests / 73 assertions,
    ~0.03 s of test work (6 s find-tests overhead dominates).
  - Re-ran `metabase.metabot.quality.core-test` alongside as a
    regression check — green.

- **Carry-forward for Phase 3 (governance)**: the atom-record's
  `:governance` slot is `nil` after extract; Phase 3 populates it via
  the batched appdb lookups. The `[type id-str]` key is the join key.
  Phase 3 needs the union of all atom keys across all five sets —
  `(mapcat keys (vals (:sets normalized)))`.

- **Carry-forward for Phase 4 (temporal)**: `:t-first-seen` is set by
  extract (min iteration across provenance entries); `:t-first-used` is
  Phase 4's job and is populated from CONV_Q provenance specifically
  (the iteration of the first authoring touch). The `:tool-events`
  stream has everything Phase 4 needs — argument blobs for thrash
  detection, error info from `:tool-output.error`, terminal-state will
  be read from the `terminal_state` data part on the last assistant
  row.

### Phase 2 — follow-ups to address before Phase 6 wiring

Profiling a real 2-message / 4-tool-event conversation
(`52e03ece-cc94-4c6e-9d3e-3d85dd4c2c8e` in
`bot-1569-track-injected-context`) surfaced ~30 KB of intermediate
struct, broken down as `:messages` 17 KB / `:sets` 9 KB
(`:D` 8.5 KB) / `:tool-events` 3.5 KB. Important: this is **JVM heap +
in-tx compute** cost, not DB-size cost — the persisted
`quality_breakdown` is the small JSON in §Storage formats. Still worth
addressing because Phase 6 wires `score-conversation!` inside the
`finalize-assistant-turn!` transaction, and the backfill task
(Phase 8) iterates over the historical corpus.

1. **Slim-project `:messages` in the normalized struct.** Phase 2
   currently passes the full message rows through, including `:data`
   (every tool-input/tool-output/text part). Downstream layers
   (governance, temporal, concern-signals, subscores) read from
   `:tool-events` and `:sets` — both already derived from `:data`. Only
   `attribution.clj` (Phase 7) needs the rows back, and it only needs
   slim metadata (`:id`, `:created_at`, `:role`, the terminal-state
   data-part, `:error`, `:finished`). A `select-keys` projection at the
   end of `normalize` should cut ~50%. Defer the actual keys list to
   when Phase 7 is being written so we keep exactly what attribution
   reads and nothing more.

2. **Decide how `field` participates in concern signals.** In the
   profiled conversation, 30 of 39 CONV_D atoms were fields surfaced
   by `list_available_fields` / `read_resource(table)`. Plugged into
   Discovery-efficiency's `|CONV_D \\ CONV_Q| / |CONV_D|` that reads as
   97% surfaced-but-unused — mostly an artifact of fields enumerating
   under their parent table, not real wasted discovery. Three
   candidates, to be chosen during Phase 5:

   - **Filter fields from Discovery-efficiency's denominator only.**
     Preserves Grounding signal (an authored-against field can still
     land in CONV_H). Minimal — one type filter inside the
     concern-signal function.
   - **Mark child-enumeration provenance with `:enumeration true`** —
     fields surfaced under a `read_resource(metabase://table/N)` or
     `list_available_fields(N)` call get tagged at extract time;
     Discovery-efficiency filters those out. Semantically cleanest:
     distinguishes "I told the LLM about this field" from "this field
     was incidentally enumerated." Requires extract to know which
     parent surfaced each child — feasible because both tools' entity-
     usage outputs always sit under a single parent in `:input`.
   - **Drop `field` from `entity-usage/entity-types` entirely.**
     Simplest, loses field-level Grounding signal. Probably too
     aggressive but listed for completeness.

   Re-open during Phase 5; the choice between (a) and (b) depends on
   how Selection-quality and Grounding actually read CONV_D, which we
   won't know until we're writing them.

---

## Phase 3 — Layer 0 enrichment (§Phase 3)

End state: governance facts batched into the normalized struct. No
score change yet.

- [x] Create `src/metabase/metabot/quality/governance.clj`
- [x] `resolve` returns map keyed by `[type id-str]` (see §C for shape)
- [x] Card query: `report_card` LEFT JOIN `collection` + `moderation_review`
  - [x] Covers card-type entities: `card`, `question`, `model`, `metric`
  - [x] Surfaces `:verified?`, `:lives-in-personal?`, `:name`,
    `:source-card-id`
- [x] Table query: `metabase_table`
  - [x] Surfaces `:schema`, `:db-id`, `:name`
- [x] Minimal lookup for dashboards / databases / transforms (`:name`
  only — used for attribution debugging)
- [x] No `:archived?` / `:deleted?` fact surfaced; metabot search
  hard-codes `:archived false`, so an archived entity in CONV_Q can
  only have entered via a user-provided reference. Not modeled as a
  selection-quality signal. (Anchoring default #11.)
- [x] Source-card ancestry walks memoized per `score-conversation!`
  invocation (local `memoize` inside the call scope, dropped after) —
  `governance.clj` exposes a plain `walk-source-card-ancestry` that
  issues one query per chain hop; the memoization itself lands in
  Phase 6 alongside `compute-conversation-score`.
- [x] Unit tests in `test/metabase/metabot/quality/governance_test.clj`
  - [x] `t2.with-temp` fixtures cover: verified card, unverified card,
    personal-collection card, model-of-card
  - [x] Batched query returns the expected `{[type id-str] → facts}` map
  - [x] Source-card ancestry walk terminates correctly on a root card
  - [x] Source-card ancestry walk handles a cycle defensively (returns
    after first repeat) — covers both A→B→A and the self-cycle A→A
- [x] Kondo clean on `src/metabase/metabot/quality/governance.clj`

### Phase 3 — Summary / key findings

- **All Phase 3 work landed**: `governance.clj` with two public
  functions (`resolve` and `walk-source-card-ancestry`); 16 unit tests
  / 23 assertions cover the contract end-to-end against real H2 + the
  Toucan `with-temp` fixtures.

- **Shadowed `clojure.core/resolve` cleanly**. The impl plan names the
  function `resolve`; rather than rename, the namespace declares
  `(:refer-clojure :exclude [resolve])` so callers see no warning and
  the chosen name matches the impl plan verbatim.

- **Card-type collapse confirmed end-to-end**. The four entity-usage
  card types (`card`, `question`, `model`, `metric`) all live in
  `report_card` and the implementation runs a single `IN` query for
  them — but the returned `{[type id-str] facts}` map carries the type
  *as it appeared in the entity-usage stream*, not the
  `report_card.type` column. That preserves join symmetry with
  `extract.clj`'s set construction, and the
  `resolve-collapses-card-types-to-single-query-test` pins it: the
  same `card-id` requested as four different types yields four keys
  with identical facts.

- **Personal-collection test required initialization step**. Metabase
  auto-creates personal collections for test users, but only lazily —
  the first attempt to query `:personal_owner_id` returned `nil` and
  the temp Card landed in root with `:lives-in-personal? false`.
  Added `(mt/initialize-if-needed! :test-users-personal-collections)`
  to force materialization. `with-temp` on `:model/Collection` with
  `:personal_owner_id` is a non-starter because the teardown step
  hits the `before-delete` guard ("You cannot delete a Personal
  Collection!").

- **Moderation-review dedup is OR-fold, not last-wins**. The
  `most_recent = true` index on `moderation_review` is not unique, so
  pathological app states can produce multiple rows per card. The
  implementation reduces with `(or verified-here? (:verified? existing
  false))` — verified iff *any* most-recent row is verified.
  `resolve-folds-multiple-most-recent-rows-to-single-verified-test`
  pins this against two `most_recent = true` rows (one verified, one
  nil).

- **Ancestry walk API is bare; memoization is the caller's job**.
  `walk-source-card-ancestry` issues one `select-one-fn :source_card_id`
  per hop. The impl plan locates memoization in
  `compute-conversation-score`'s scope (Phase 6) so a shared lineage
  costs one query per *distinct* ancestor across the whole scoring
  invocation, not per walk. Two cycle-defensive paths are pinned: the
  A→B→A loop returns `[B]` (visits B once, refuses to revisit A),
  and the self-loop A→A returns `[]` (the visited-set is seeded with
  the starting card, so the first hop is the repeat).

- **Sparse return map by design**. Card facts always carry all four
  keys (even if `:verified?` is `false` and `:source-card-id` is
  `nil`); table facts carry `{:name :schema :db-id}`; dashboards /
  databases / transforms carry `{:name}` only. Missing-entity rows
  are *absent* from the map, not nil-valued — Phase 5 concern-signal
  code must use `get-in` with care (which is the more natural read in
  Clojure anyway).

- **Entity types outside the governance vocabulary are silently
  dropped**. `field`, `collection`, `document` refs don't reach any
  query — they're filtered by `partition-refs`. This matches the
  impl plan's "Phase 3 only resolves what Phase 5 reads"; the Phase 2
  follow-up about how `field` participates in Discovery-efficiency is
  unaffected by this layer.

- **Smoke test against live appdb** (`bot-1569-track-injected-context`):
  ```
  (governance/resolve [{:type "card" :id 1} {:type "model" :id 1}
                       {:type "table" :id 1} {:type "dashboard" :id 1}
                       {:type "database" :id 1} {:type "transform" :id 1}
                       {:type "field" :id 1} {:type "table" :id "abc"}])
  ;; ⇒ five keys (card/model/table/dashboard/database); field and
  ;;   string-id table refs dropped; transform absent (no row 1).

  (governance/walk-source-card-ancestry 117)  ;; ⇒ [44]
  (governance/walk-source-card-ancestry 44)   ;; ⇒ [] (root)
  ```

- **Test-run cost**:
  - `metabase.metabot.quality.governance-test` — 16 tests / 23
    assertions, ~6.8 s. The first test in the run incurs the
    Toucan/`with-temp` setup cost (~3.6 s); subsequent tests are
    sub-second.
  - Regression check on `quality.core-test` + `quality.extract-test` —
    26 tests / 81 assertions, ~3.7 s, all green.

- **Carry-forward for Phase 5 (concern signals)**:
  - `:source-card-id` on a card facts map is non-nil iff the card is
    layered on top of another card; walk-source-card-ancestry chases
    the chain when substitution detection needs full lineage. The
    walk excludes the starting card, so `(some #{Y-id} (walk-…))`
    answers "is Y an ancestor of X?".
  - `:lives-in-personal?` is a boolean (never nil), and `:verified?`
    is a boolean too — concern signals can compare directly without
    nil-coalescing.

- **Carry-forward for Phase 6 (wire-up)**: `compute-conversation-score`
  needs to (1) collect all entity-refs across `(:sets normalized)` and
  pass them to `governance/resolve` in a single batch, (2) wrap
  `walk-source-card-ancestry` in `(memoize …)` so a deep lineage
  shared across the conversation costs one query per distinct
  ancestor.

---

## Phase 4 — Layer 2 temporality (§Phase 4)

End state: pure-code temporal derivations work against fixture
conversations. Terminal-state can be read from the new data part.

- [x] Create `src/metabase/metabot/quality/temporal.clj`
- [x] `derive` populates `:t-first-used` on each CONV_Q atom record
  (`:t-first-seen` was already set by Phase 2 — extract carries the min
  iteration across all provenance entries; Phase 4 only adds the
  authoring-specific `:t-first-used` for `:Q` atoms)
- [x] Compute the `:temporal` block of the normalized struct (§D):
  - [x] `:iterations` — total. `(inc (max iteration-index))`; defaults
    to `0` on empty `:tool-events` so pre-foundation rows don't crash
    the layer
  - [x] `:thrash-events` — normalized Levenshtein on JSON-serialized
    args, adjacent same-function calls in the flat tool-events stream,
    similarity ≥ `query-similarity-threshold`
  - [x] `:rediscovery-r` — transitive clustering of search-tool query
    strings via union-find (`connected-components`); `r = N_search −
    N_clusters`. Tested: five identical searches → `r = 4`; three
    distinct queries → `r = 0`; three identical → `r = 2`
  - [x] `:errors-resolved-rate` — next-call-to-same-function match;
    rate = resolved / errored; `nil` when no errored events (so Phase
    5's `u`-boost can skip it cleanly rather than treat `u = 1`)
- [x] Terminal-state classification with priority order:
  1. `terminal_state` data part on the last assistant row → projected
     per `known-terminal-states` (`{model_signaled_done, final_response,
     iter_cap, error}`); unknown reasons fall through to `:error`
  2. `metabot_message.error` non-nil → `:error`
  3. `metabot_message.finished = false` → `:aborted` (kept as a
     distinct categorical so Phase 5 / breakdown-context can
     distinguish; concern signal 6 will collapse to error)
  4. Default → `:model_signaled_done`
- [x] Unit tests in `test/metabase/metabot/quality/temporal_test.clj`
  - [x] Productive iteration (`edit_sql_query` error → success) —
    `errors-resolved-rate = 1.0`
  - [x] Thrash flow (two consecutive errors) — `errors-resolved-rate
    = 0.0`
  - [x] Re-discovery: positive (five identical → r=4), negative (three
    distinct → r=0), transitive clustering (three identical → r=2)
  - [x] Terminal-state — fixture per known reason (data part), unknown
    reason → `:error`, error-col fallback, `:finished false` →
    `:aborted`, default `:model_signaled_done`, data-part wins over
    error-col, defensive `:model_signaled_done` on no-assistant-row
- [x] Kondo clean on `src/metabase/metabot/quality/temporal.clj` and
  the test file (`0 errors, 0 warnings`)

### Phase 4 — Summary / key findings

- **All Phase 4 work landed**: pure-compute `temporal.clj` with
  `derive` as the single public entry point, 23 unit tests / 37
  assertions covering each sub-derivation plus an end-to-end shape
  test that runs a synthetic conversation through
  `extract/normalize → temporal/derive`. Regression run across
  `quality.core-test` + `quality.extract-test` +
  `quality.governance-test` + `quality.temporal-test` →
  65 tests / 141 assertions, all green.

- **Errors-resolved-rate target interpretation** (§D ambiguity). The
  impl plan calls for "same-function + same-target" matching but
  doesn't define `target` per tool. MVP rule: **same-function only**.
  The next call to the same function is the next attempt; if it
  succeeded the error is resolved. Defensible (a recovery flow always
  reuses the failing tool) and reversible (Phase 5 calibration can
  tighten this to "same function + args above similarity threshold"
  by reusing `thrash-pair?` if calibration shows over-credit).

- **Re-discovery clustering is transitive** (connected components via
  union-find), not greedy. Distinction matters when A~B~C but A≁C —
  union-find puts all three in one cluster (the agent widened the
  search, which is one "discovery thread"); greedy single-link
  bucketing would create two. Pinned by
  `derive-rediscovery-r-transitive-clustering-test` (three identical
  queries → r=2 rather than r=0).

- **Errors-resolved-rate is nil, not 0.0, on a clean conversation.**
  Phase 5's execution-health uses `u = 1 − errors_resolved_rate` to
  boost the penalty when errors persist. If the rate were `0.0` on a
  no-errors conversation, `u = 1` would over-penalize. Returning
  `nil` lets the consumer skip the `u` boost entirely (and the
  numerator `p = 1 − success_rate = 0` is what dominates the
  signal anyway).

- **`:aborted` is a distinct terminal-state value**, not collapsed to
  `:error` in this layer. §D says aborted is "treated as :error for
  concern signal 6 but surfaced separately in the breakdown context".
  Keeping it distinct in temporal lets Phase 5 do the collapse (or
  not) at its preferred granularity, and lets Phase 6's
  `breakdown.context` show "this conversation was aborted by the
  user, not crashed" without re-deriving from row columns.

- **Terminal-state data part wins over `:error` column**, intentionally.
  A tool can emit a streamed `:error` part that lands in
  `metabot_message.error` while the agent loop still reaches `:done`
  cleanly (the per-tool error didn't escape the loop). The
  `terminal_state` data part captures the loop's *exit condition*,
  which is the right primitive for concern signal 6 (Termination).
  Pinned by `derive-terminal-state-data-part-wins-over-error-col-test`.

- **Reflection warning caught on first compile.** `aset` on an
  `int-array` requires `int` indices and values; `dotimes`/`range`
  produce longs. Fixed by explicit `(int i)` casts and `^long`
  parameter hints on the union-find helpers. Worth noting because
  Phase 5 will likely add another primitive-array hotspot if we
  cluster anything else.

- **Levenshtein implementation reuses
  `org.apache.commons.text.similarity.LevenshteinDistance`** — the
  same class `metabase.metabot.table_utils` uses for fuzzy table
  matching. Singleton (`def` not `defn`) so we don't pay JVM
  allocation per comparison.

- **Test-run cost**:
  - `metabase.metabot.quality.temporal-test` — 23 tests / 37
    assertions, ~0.05 s of pure-compute test work (find-tests
    overhead dominates).
  - Combined regression run (core + extract + governance + temporal)
    — 65 tests / 141 assertions, ~6 s end-to-end (governance
    `with-temp` setup is the dominant cost, as it was in Phase 3).

- **Carry-forward for Phase 5 (concern signals)**:
  - `:temporal :iterations` feeds Conversational-economy's
    `iterations / max(1, |CONV_Q|)` ratio.
  - `:temporal :thrash-events` feeds Conversational-economy's
    thrash component.
  - `:temporal :rediscovery-r` feeds Discovery-efficiency's `r /
    (r + C-rediscovery)` saturation term.
  - `:temporal :errors-resolved-rate` — nil-safe in
    Execution-health: when `nil`, skip the `u`-boost and let `p`
    (failure rate) dominate. The Phase 5 formula already permits
    this with `α + (1 − α) × u`; treating `u = 0` when rate is nil
    is equivalent to "no errors to mitigate."
  - `:temporal :terminal-state` feeds Termination directly. The
    categorical map in §E concern signal 6: `model_signaled_done
    → 0`, `final_response → 0`, `iter_cap → 1`, `error → 1`. Phase
    5 will need to decide `:aborted` — recommend `1` (collapses
    with error) since the user gave up before the agent committed.
  - `:t-first-used` on `:Q` atoms is now populated. Substitution
    detection in Phase 5 can use this for the `conv-distance(E) =
    t-first-used − t-first-seen` derivation the strategy doc
    sketches (currently no concern signal reads it; reserved for
    a future "delayed-use" signal).

---

## Phase 5 — Layer 3 concern signals (§Phase 5)

End state: six concern signal magnitudes in `[0, 1]` against fixture
conversations. Saturation constants calibrated against representative
fixtures.

- [x] Create `src/metabase/metabot/quality/concern_signals.clj`
- [x] Selection-quality signal (§E table)
  - [x] Substitution detection for cards and tables (anchoring default #7)
  - [x] `% CONV_Q in personal-collection`
- [x] Grounding signal — three-bucket variant (§E)
  - [x] CONV_H atoms are directly the `:ambiguous` bucket — the
    bucketing helper is implicit in extract.clj's set arithmetic, no
    standalone `bucket-CONV_Q` function needed
  - [x] Signal computed against `:ambiguous` only:
    `|amb| / (|amb| + C-grounding)`
- [x] Discovery-efficiency signal
  - [x] `surfaced-but-unused-fraction` (`|CONV_D_non_field \ CONV_Q| / |CONV_D_non_field|`)
    — fields filtered (Phase 2 follow-up #2 resolved at signal level
    per user choice)
  - [x] `avg-rank-used` normalized against
    `typical-search-result-length` (= 10)
  - [x] `r` (re-discovery count from temporal layer) saturated as
    `r / (r + C-rediscovery)`
- [x] Execution-health signal — floor-bounded boost (§E):
  ```
  let p = 1 − success_rate
  let u = 1 − errors_resolved_rate
  signal = p × (α + (1 − α) × u)        ; α = eh-mitigation-floor
  ```
- [x] Conversational-economy signal
  - [x] `iterations / max(1, |CONV_Q|)` saturated above target ratio
  - [x] `thrash-events` saturated
  - [x] Max per-entity reuse count saturated above baseline (= 2)
- [x] Termination signal — categorical map
  - [x] `model_signaled_done` → 0
  - [x] `final_response` → 0
  - [x] `iter_cap` → 1
  - [x] `error` → 1
  - [x] `:aborted` → 1 (Phase 4 carry-forward); unknown → 1 (defensive)
- [x] Set saturation constants in `constants.clj` to values that produce
  sensible magnitudes on representative fixtures (these are design-time
  choices, not corpus-derived thresholds). Includes
  `eh-mitigation-floor` (default 0.5), `query-similarity-threshold`
  (default 0.8, shared with thrash detection), and the five new
  Phase 5 constants (`C-thrash`, `C-reuse`, `C-economy-iterations`,
  `typical-search-result-length`, `substitution-name-distance-threshold`)
- [x] Unit tests in `test/metabase/metabot/quality/concern_signals_test.clj`
  - [x] Each signal at 0 on a "healthy" fixture
  - [x] Each signal saturating on a worst-case fixture (note: not
    every signal hits 1.0 — Conversational-economy's mean structure
    caps a single-component fixture at ~0.5)
  - [x] Execution-health: floor is hit when `errors_resolved_rate = 1`
    (signal = 0.25 for p=0.5); full penalty when
    `errors_resolved_rate = 0` (signal = 0.5 for p=0.5)
  - [x] Substitution detection — positive (verified sibling in CONV_D),
    negative (different db-id, X unverified, Y already verified),
    edge case (table with different schema), edge case (model-of-card
    lineage via ancestry-of stub, including deep chain)
  - [x] Three-bucket grounding — empty H = 0, monotonic in |H|,
    half-saturation at |H| = C-grounding
  - [x] Field filtering in Discovery-efficiency's denominator
    (Phase 2 follow-up #2)
- [x] Kondo clean on `src/metabase/metabot/quality/concern_signals.clj`
  (errors: 0, warnings: 0)

### Phase 5 — Summary / key findings

- **All Phase 5 work landed**: `concern_signals.clj` with six pure
  signal functions exposed through one public `compute` entry point;
  five new saturation constants in `constants.clj`; one Phase 3
  extension to `governance.clj` to surface `:db-id` on card facts. 30
  unit tests / 44 assertions cover each signal's healthy/worst-case
  behavior plus the substitution-detection edge cases. Full quality
  regression run (Phase 1–5) — 96 tests / 186 assertions — green.

- **Two blocking design calls resolved up-front via AskUserQuestion**:

  1. **Field handling in Discovery-efficiency** — chose "filter at the
     signal" over "mark enumeration at extract". Implemented as a
     single type filter inside the signal helper (`non-field-atoms`).
     Fields stay in CONV_D for set arithmetic, so authored field refs
     in CONV_Q still resolve correctly against CONV_H for Grounding.
     No Phase 2 backtrack.

  2. **Card db-id for substitution detection** — chose to extend
     `governance.clj`'s card query (one additional column,
     `report_card.database_id` → `:db-id`). Added one test pin
     (`resolve-card-surfaces-db-id-test`) and a docstring note. Cards
     and tables now share the same governance shape for the
     substitution-match predicate.

- **Asymmetric substitution rule** — the §E predicate as written
  requires `Y.governance.verified? = false` AND `X.governance.verified?
  = true`. Tables have no verification concept in Metabase's data model
  (moderation reviews are card-scoped), so a strict reading would
  effectively no-op the table half of anchoring default #7. Resolved
  by dropping the verified? predicates for the table case while keeping
  them for cards. Cards: name + verified-Y + verified-X + same db-id.
  Tables: name + same db-id + same schema (no verification). Documented
  in the ns docstring and at the helper call site.

- **Ancestry-of as a callback, not data** — `compute` takes
  `[normalized governance ancestry-of]`. `ancestry-of` is a function
  from card-id (Long) to a seq of ancestor card-ids. Tests pass
  `(constantly [])` or a fixed-stub map closure. Phase 6's wire-up
  will pass a `(memoize governance/walk-source-card-ancestry)` so a
  deeply-nested shared lineage costs one query per *distinct* ancestor
  across the whole scoring invocation. (The §H sketch only shows
  `(compute normalized governance)`; the third arg is a small
  expansion to support the ancestral-substitute? rule from §E.)

- **Ancestral substitute requires verified X** — the §E "OR (cards/
  models only): X is a model whose `source-card-id` resolves
  ancestrally to Y" clause doesn't explicitly require X to be
  verified, but the canonical-bypass story it captures only makes
  sense if X is actually a more authoritative surface. Without the
  check, every model-of-card relationship would fire as substitution.
  Added `(true? (:verified? (gov governance x)))` as a precondition.
  Documented in the helper docstring.

- **Healthy fixture trick**: in `(normalized)` with no kwargs every
  sub-component computes to 0 — but only because the temporal defaults
  include `:errors-resolved-rate nil`, which the execution-health
  signal short-circuits on. If a future test passes `:tool-events
  [...]` *without* overriding the temporal block, execution-health
  will still read `:errors-resolved-rate nil` and return 0. Document
  by writing tests that explicitly set `:errors-resolved-rate` when
  exercising error-related behavior.

- **Mean-of-three signals cap below 1.0 for single-component fixtures**:
  Discovery-efficiency and Conversational-economy both average three
  ∈ `[0, 1]` sub-components. Maximizing one component alone yields
  signal ≤ ⅓; saturating one to ≈0.5 yields ≈0.167. The
  `compute-all-signals-non-zero-on-pathological-fixture-test` only
  asserts `> 0.5` for Conversational-economy (saturating all three
  via iterations=30, thrash=10, no reuse → ~0.55), not `≈ 1.0`. This
  is the intended dynamic range — geometric mean at Layer 4 (Phase 6)
  amplifies single-component damage by treating each subscore's
  health independently.

- **Half-saturation pinned by `grounding-half-saturation-at-c-grounding-test`**:
  at `|H| = C-grounding = 3`, `grounding = 3 / (3 + 3) = 0.5`. This
  is the load-bearing calibration property — if C-grounding ever
  changes, this test catches it and the impl plan's "half-saturation"
  language stays accurate.

- **No DB hits in Phase 5 tests** — the test file uses literal
  `{[type id-str] facts}` governance maps and `(constantly [])`
  ancestry stubs. ~18 ms total compute time across 30 tests.

- **Test-run cost**:
  - `metabase.metabot.quality.concern-signals-test` — 30 tests / 44
    assertions, ~18 ms of pure-compute test work
  - Combined Phase 1–5 regression (`quality.core-test` +
    `quality.extract-test` + `quality.governance-test` +
    `quality.temporal-test` + `quality.concern-signals-test`) — 96
    tests / 186 assertions, ~7.3 s end-to-end (governance `with-temp`
    dominates as in earlier phases). All green.

- **Carry-forward for Phase 6 (subscores + wire-up)**:
  - Subscore A (input quality) reads `:selection-quality` +
    `:grounding`; N/A iff `|CONV_Q| = 0` AND no `:authoring` event
    ever fired in `:tool-events`.
  - Subscore B (discovery quality) reads `:discovery-efficiency`;
    N/A iff `|CONV_D| = 0`. **Note**: with the field-filtering
    decision, Phase 6 should probably define "no discovery happened"
    as `|CONV_D_non_field| = 0` rather than `|CONV_D| = 0`. Otherwise
    a conversation that only enumerated fields will fail the N/A
    precondition and have Subscore B compute to 0 against an
    effectively empty CONV_D. Decision to revisit when writing
    `subscores.clj`.
  - Subscore C (execution health) reads `:execution-health`; always
    applies.
  - Subscore D (trajectory) reads `:conversational-economy` +
    `:termination`; always applies.
  - `compute-conversation-score` (Phase 6) constructs
    `ancestry-of := (memoize governance/walk-source-card-ancestry)`,
    then calls `(concern-signals/compute normalized governance
    ancestry-of)` — same signature as Phase 5's tests use today.
  - The Phase-1 stub in `quality.core` should be replaced wholesale
    in Phase 6 (not Phase 5).

---

## Phase 6 — Layer 4 subscores + wire-up (§Phase 6)

End state: real scores are written to `metabot_conversation.quality_score`
and `quality_breakdown`. The Phase-1 stub is gone.

- [x] Create `src/metabase/metabot/quality/subscores.clj`
- [x] A/B/C/D subscores per §F:
  - [x] Subscore A = `1 − mean(selection-quality, grounding)`,
    N/A iff `|CONV_Q| = 0` AND no authoring tool was ever called
  - [x] Subscore B = `1 − discovery-efficiency`,
    **N/A iff `|CONV_D_non_field| = 0`** (decision: user opted into the
    field-aware precondition rather than the literal `|CONV_D| = 0`
    from §F so the N/A semantics match Discovery-efficiency's
    field-filtering)
  - [x] Subscore C = `1 − execution-health`, always applicable
  - [x] Subscore D = `1 − mean(conversational-economy, termination)`,
    always applicable
  - [x] Composite = geometric mean over non-N/A subscores
  - [x] `artifact-intended?` derived from `:tool-events` (presence of
    any `:authoring` event) OR a non-empty CONV_Q, not from the profile
- [x] Replace the Phase-1 stub in `quality/core.clj`:
  - [x] `compute-conversation-score` wires extract → governance →
    temporal → concern signals → subscores
  - [x] Build the `quality_breakdown` JSON per the §Storage formats shape
  - [x] Persist `quality_score` and `quality_breakdown` on the
    conversation (single UPDATE)
  - [x] `pre-foundation?` detection (§H) writes the `pre-foundation`
    sentinel — implemented as: no tool-event carries non-empty
    `:input`/`:output` (= no `:entity-usage` block populated upstream)
    AND `(:prompt-context :P)` is empty (= no user row had a
    `prompt-context` block). Both negatives must hold; either signal
    present routes to the real pipeline.
  - [x] `extract-error` sentinel written if extract throws — a
    `try/catch` inside `compute-conversation-score` wraps the
    `extract/normalize` call and returns the sentinel shape; the outer
    `score-conversation!` guard is preserved for any throw that
    escapes the pipeline below extract
- [x] Unit tests in `test/metabase/metabot/quality/subscores_test.clj`
  - [x] Geometric-mean composite over non-N/A subscores
  - [x] Subscore A N/A when no authoring tool was called
  - [x] Subscore B N/A when no non-field discovery happened (and the
    additional case where only fields were enumerated)
  - [x] Weakest-link domination (one bad subscore craters the composite)
  - [x] Plus: composite zeroing on any zero subscore (geometric-mean
    property), deterministic `(sort (:na out))` ordering for the
    breakdown's `subscore_na` slot
- [x] End-to-end test in `quality/core_test.clj`:
  - [x] Seed a scoreable conversation via direct Toucan inserts; call
    `score-conversation!`; assert `quality_score = 1.0`, full
    breakdown shape (every key from §Storage formats), Subscore B is
    N/A, `set_cardinalities = {P 1, D 0, Q 1, I 0, H 0}`
  - [x] Pre-foundation conversation → `quality_score = NULL`,
    `quality_breakdown.unscoreable = "pre-foundation"`
  - [x] Extract-error conversation → `quality_score = NULL`,
    `quality_breakdown.unscoreable = "extract-error"`
- [x] Kondo clean on `src/metabase/metabot/quality/subscores.clj`,
  `quality/core.clj`, both new/updated test files
  (errors: 0, warnings: 0)

### Phase 6 — Summary / key findings

- **All Phase 6 work landed**: `subscores.clj` with `compose` as the
  single public entry point, the Phase-1 stub in `core.clj` replaced
  with the full extract → governance → temporal → concern-signals →
  subscores pipeline, plus pre-foundation and extract-error sentinels.
  18 new subscores unit tests / 45 assertions; the core_test.clj was
  expanded from 4 tests to 6 (pre-foundation + extract-error sentinels,
  end-to-end pipeline). Full Phase 1–6 regression: 116 tests / 244
  assertions, all green.

- **Subscore B N/A precondition resolved up-front via
  AskUserQuestion**: chose `|CONV_D_non_field| = 0` per Phase 5's
  carry-forward note. Without this, a conversation that only
  enumerated fields under a known table would have a non-empty CONV_D
  yet Discovery-efficiency would compute against an effectively empty
  set (0 → Subscore B = 1.0), which would falsely advertise "perfect
  discovery". The field-aware precondition mirrors the signal's
  field-filter and yields the semantically correct N/A.

- **Two sentinel paths, not one.** §H sketches a single
  pre-foundation check but the impl plan separately specifies an
  `extract-error` sentinel (defense in depth for malformed
  post-BOT-1569 rows). Implemented as a `try/catch` wrapping
  `extract/normalize` *inside* `compute-conversation-score` — returns
  `::extract-failed` sentinel from the catch and dispatches to the
  appropriate breakdown. The outer `score-conversation!` `try/catch`
  remains for any throw downstream of extract (governance / temporal
  / concern-signals / subscores) and is the path tested by
  `score-conversation-inner-guard-swallows-throw-returns-nil-test`.

- **Existing Phase 1 tests required reason-string updates, not logic
  changes.** The Phase 1 stub wrote `"stub"`; Phase 6 writes
  `"pre-foundation"` for the same no-context conversation
  (`finalize-once!` doesn't pass `:context` to `start-turn!`, so the
  user row has no prompt-context block, and the assistant row has no
  tool calls — both pre-foundation criteria hold). Renamed the test
  to `score-conversation-pre-foundation-writes-sentinel-test` and
  updated the asserted reason.

- **Geometric-mean weakest-link bound test missed by 2e-3.** First
  draft asserted `< 0.315 (:composite out) 0.317` for the
  `A=B=C=0.99, D=0.01` fixture; the actual value is
  `0.3138530807138197` ≈ `(0.99³ × 0.01)^¼`. Tightened to
  `< 0.313 (:composite out) 0.315`. Worth noting because the
  geometric-mean math always lands a hair below the back-of-envelope
  arithmetic; future calibration tests should compute the exact
  expected value rather than estimate.

- **Memoization placement matched §H sketch.** `compute-conversation-score`
  constructs `ancestry-of := (memoize governance/walk-source-card-ancestry)`
  inside its local `let` scope. The memoized walker is dropped when
  the scoring call returns, so deep model lineages shared across
  multiple atoms only pay one query per *distinct* ancestor per
  scoring invocation. Phase 5's
  `concern-signals/compute` signature already accepted `ancestry-of`
  as a callback, so the wire-up was a single line.

- **Persistence layer untouched.** `persistence.clj`'s
  `finalize-assistant-turn!` already calls
  `quality.core/score-conversation!` from inside its transaction with
  an outer try/catch (added in Phase 1). The Phase 6 return contract
  (number / `:sentinel` / nil) is unchanged, so no integration site
  needed re-wiring. Verified by re-running
  `metabase.metabot.persistence-test` + `metabase.metabot.api-test`:
  66 tests / 342 assertions, all green.

- **JSON shape verified end-to-end.** The end-to-end pipeline test
  asserts the full breakdown shape after `mi/transform-json` round
  trip — every key (`subscores`, `subscore_na`, `concern_signals`,
  `set_cardinalities`, `termination`, `context`) lands in the
  expected form. N/A subscores serialize as JSON `null`
  (Subscore B in the test fixture) and the `subscore_na` slot lists
  the letter codes as strings (`["B"]`).

- **Test-run cost**:
  - `metabase.metabot.quality.subscores-test` — 18 tests / 45
    assertions, ~14 ms of pure-compute work
  - `metabase.metabot.quality.core-test` — 6 tests / 21 assertions,
    ~4 s (governance `with-temp` setup dominates as in earlier phases)
  - Full quality regression (Phase 1–6) — 116 tests / 244 assertions,
    ~7 s end-to-end
  - Downstream regression (`metabase.metabot.persistence-test` +
    `metabase.metabot.api-test`) — 66 tests / 342 assertions, ~12 s,
    all green

- **Smoke check against live appdb deferred to Phase 10.** Did not
  exercise `score-conversation!` against
  `bot-1569-track-injected-context` in this phase — that's where
  Phase 10 (operational verification) eyeballs scores against real
  conversations. Phase 6 work is gated on unit + integration tests
  only.

- **Carry-forward for Phase 7 (attribution)**:
  - `compute-conversation-score`'s return shape today is
    `{:quality_score :quality_breakdown}`. Phase 7 extends it with
    `:quality_attribution` (a `{message-id → attribution-map}` map)
    and the `write-result!` helper grows a per-message UPDATE loop
    (or bulk UPDATE).
  - `prefix_subscores` per turn — the same
    `subscores/compose` machinery is reusable; Phase 7 restricts
    `:tool-events` and `:sets` to events with `:iteration-index ≤
    end-iteration-of-turn-N` and re-invokes compose on the restricted
    struct. The composition machinery I wrote is pure and stateless,
    so this is mechanical.
  - The breakdown's `:set_cardinalities` block (and `:context`) are
    already shaped for prefix-projection — Phase 7 can re-emit
    per-turn versions of the same fields by passing the restricted
    normalized struct through `build-breakdown` (or a slimmer
    attribution-shape builder).

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
