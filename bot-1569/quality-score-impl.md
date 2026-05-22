# BOT-1515 — Quality Score Implementation Plan

Strategy doc: `notes/bot-1515-v2/new-first-principles-strategy.md`
Refined primitive list: `notes/bot-1515-v2/new-first-principles-strategy-refined.md`
Approach guide: `notes/bot-1569/bot-1515-impl-approach.md`
BOT-1569 foundation (what's persisted today): `notes/bot-1569/impl-plan-v2.md`

This plan operationalizes the approach guide. It builds the conversation
quality score on top of the per-turn observability foundation BOT-1569
shipped. Score lives at `[0, 1]`, 1 = healthy; derived exclusively from
already-persisted primitives plus a small batched governance lookup. The
BOT-1569 contracts — `:entity-usage` on every tool result, a
`prompt-context` block on each user row — are stable inputs; this work
does not rewrite tool internals or persistence shapes.

---

## What we're building

A scoring pipeline keyed off the closed entity-set construction from the
refined strategy doc:

```
CONV_P   prompt-context (user_is_viewing + mentioned_refs + user_recently_viewed)
CONV_D   discovery-surfaced (search hits + read_resource listings)
CONV_Q   query/authored inputs (authoring-tool entity refs, db refs excluded)
CONV_I   inspected (entity refs from inspection-tool calls)
CONV_H   hallucinated, derived: CONV_Q \ (CONV_P ∪ CONV_D)
```

> **Note on CONV_P collapse.** The refined strategy doc split prompt-channel
> entities into `CONV_S` (structured-supplied: `user_is_viewing` +
> `mentioned_refs`) and `CONV_M` (passively-injected menu:
> `user_recently_viewed`). For the scoring layer that distinction is not
> load-bearing — both channels are observable evidence the agent saw the
> entity before authoring, and the Grounding concern treats them
> identically. We collapse to a single `CONV_P` here and revisit only if
> a downstream consumer needs the sub-channel attribution. The
> sub-channels remain individually addressable in `prompt-context.data`
> if we ever need to split them back out.

Layered exactly as the strategy doc lays it out:

- **Layer 0** — per-entity facts (already persisted by BOT-1569;
  governance fields enriched via two batched appdb queries).
- **Layer 1** — set construction + per-set summaries.
- **Layer 2** — temporal facts (timelines, chain shapes, error trajectory,
  terminal-state).
- **Layer 3** — six concern signal magnitudes in `[0, 1]`.
- **Layer 4** — four subscores grouped by concern-signal family;
  geometric-mean composite over the non-N/A subscores.
- **Per-turn attribution** — projection of the final analysis back onto
  individual turn rows, recomputed each finalize.

---

## Anchoring defaults locked in for this plan

The approach doc's "Open design calls" are committed here as **defaults**
for MVP; each is either reversible cheaply or explicitly named as
revisitable.

| # | Decision | Default |
|---|----------|---------|
| 1 | Compute placement | In-transaction within `finalize-assistant-turn!`, guarded by try/catch (log-only) so a scoring throw cannot roll back the user-visible UPDATE. Telemetry instrumentation lives in a follow-up task |
| 2 | Per-message attribution storage | New `quality_attribution` column on `metabot_message`; overwritten every turn so the last row's value reflects the canonical projection |
| 3 | Conversation storage | New `quality_score` (double) + `quality_breakdown` (JSON text) columns on `metabot_conversation`, recomputed each turn |
| 4 | Score range | `[0, 1]`, 1 = healthy |
| 5 | Database refs in CONV_Q | Excluded (databases are framing, not artifact content) |
| 6 | CONV_I as first-class set | Modeled as a sibling set alongside P/D/Q. No MVP concern signal reads it — kept so inspection touches retain clean provenance labels in attribution observables, and a future chain-shape concern signal can be added without re-tagging tools or back-filling sets |
| 7 | Substitution detection scope | Cards and tables only for MVP; other types contribute to set-construction but not to selection-quality's substitution component |
| 8 | Grounding under unknown prompt-text refs | Three-bucket variant: `grounded_via_P` / `grounded_via_D` / `ambiguous` (= CONV_H). Concern signal computed against ambiguous bucket only. Haiku-style extraction over free-form prompt text deferred — would expand CONV_P membership, not the set vocabulary |
| 9 | Terminal-state source | Agent loop emits a `terminal_state` typed data part at loop exit; persists via the standard streaming path; `temporal.clj` reads it back |
| 10 | Sidecar `ai_tool_usage` table | Deferred to Layer 5; JSON-on-message is the right grain for Layer 4 |
| 11 | Archived/deleted entities in selection-quality | Not modeled. Metabot search hard-codes `:archived false`, so an archived entity can only enter CONV_Q via a user-provided reference (CONV_P) — not an agent-attributable bad pick. Re-add a term and observable if a future authoring path bypasses search |

---

## Namespace layout

All scoring code lives under `src/metabase/metabot/quality/`. Pure-compute
namespaces (extract / temporal / concern-signals / subscores / attribution)
are free of I/O; the I/O surface is concentrated in `core.clj` and
`governance.clj`.

```
src/metabase/metabot/quality/
├── core.clj          Public API. Two entry points:
│                       - score-conversation! (I/O wrapper called from
│                         finalize-assistant-turn!; in-tx; try/catch,
│                         log-only at MVP)
│                       - compute-conversation-score (pure, given normalized
│                         struct + governance map)
│
├── extract.clj       Layer 1: read MetabotMessage rows, flatten tool-events,
│                     read prompt-context blocks, build CONV_P/D/Q/I/H
│                     atoms with provenance + iteration-index.
│
├── governance.clj    Layer 0 enrichment. Batched appdb queries (cards,
│                     tables). Source-card ancestry walks memoized per
│                     scoring invocation.
│
├── temporal.clj      Layer 2: timelines, thrash, re-discovery, error
│                     trajectory, terminal-state.
│
├── concern_signals.clj  Layer 3: six closed-form concern signal magnitudes.
│
├── subscores.clj     Layer 4: group concern signals into A/B/C/D;
│                     geometric-mean composite over non-N/A;
│                     artifact-intended? gating.
│
├── attribution.clj   Per-turn projection of the conversation analysis
│                     back onto each turn's `quality_attribution`.
│
└── constants.clj     Composite version string ("v2.0"), saturation Cs,
                      normalization constants, target ratios.
```

Task and EE additions:

```
src/metabase/metabot/task/
└── quality_score_backfill.clj      Daily Quartz job, newest-first,
                                     skip-set per run, sentinel breakdown
                                     for unscoreable rows.

enterprise/backend/src/metabase_enterprise/metabot_analytics/
└── conversations.clj                Extend the EE conversation-detail
                                     response shape to surface
                                     quality_breakdown + per-turn
                                     attribution.
```

---

## Schema additions

Single Liquibase changelog under `resources/migrations/062/` named
`YYYYMMDD_metabot_quality_score.yaml`. Four changesets, all additive,
all nullable.

### `metabot_conversation`

```yaml
- addColumn:
    tableName: metabot_conversation
    columns:
      - column:
          name: quality_score
          type: double
          constraints: { nullable: true }
          remarks: Quality score composite in [0, 1], 1 = healthy. NULL = not yet scored.

- addColumn:
    tableName: metabot_conversation
    columns:
      - column:
          name: quality_breakdown
          type: ${text.type}
          constraints: { nullable: true }
          remarks: >
            JSON-encoded breakdown of the composite — version, subscore
            vector (incl. N/A markers), per-concern-signal magnitudes,
            set cardinalities, termination, context. Shape defined in
            notes/bot-1569/quality-score-impl.md §Storage formats.
```

### `metabot_message`

```yaml
- addColumn:
    tableName: metabot_message
    columns:
      - column:
          name: quality_attribution
          type: ${text.type}
          constraints: { nullable: true }
          remarks: >
            JSON-encoded per-turn attribution of the conversation
            breakdown back onto this row. Overwritten on each
            finalize-assistant-turn!; the conversation's last assistant
            row's value is canonical.
```

### Model transforms

`models/metabot_conversation.clj` and `models/metabot_message.clj` gain
`mi/transform-json` entries for the new JSON columns so reads decode
into Clojure maps automatically:

```clojure
(t2/deftransforms :model/MetabotConversation
  {:state             mi/transform-json
   :quality_breakdown mi/transform-json})

(t2/deftransforms :model/MetabotMessage
  {:usage              mi/transform-json
   :data               mi/transform-json
   :role               mi/transform-keyword
   :quality_attribution mi/transform-json})
```

---

## Storage formats

### `metabot_conversation.quality_breakdown`

```jsonc
{
  "version":           "v2.0",
  "subscores":         {"A": 0.8, "B": 0.6, "C": 1.0, "D": 0.9, "composite": 0.81},
  "subscore_na":       [],                    // subscores that did not apply (A or B may be N/A)
  "concern_signals":   {"selection-quality":      0.10,
                        "grounding":              0.00,
                        "discovery-efficiency":   0.40,
                        "execution-health":       0.00,
                        "conversational-economy": 0.05,
                        "termination":            0.00},
  "set_cardinalities": {"P": 15, "D": 47, "Q": 5, "H": 1, "I": 2},
  "termination":       "final_response",      // model_signaled_done | final_response | iter_cap | error
  "context":           {"iterations": 6, "tool_calls": 11, "errors": 1}
}
```

### Sentinel breakdowns

For conversations the pipeline declines to score (no Layer 0 atoms
present; extract throws; Phase 1 stub), `quality_breakdown` holds a
minimal JSON shape and `quality_score` stays NULL:

```jsonc
{"version": "v2.0", "unscoreable": "pre-foundation"}
{"version": "v2.0", "unscoreable": "extract-error"}
{"version": "v2.0", "unscoreable": "stub"}
```

Reasons used:

- `pre-foundation` — conversation predates the BOT-1569 persisted
  primitives (no `:entity-usage` on any tool result, no
  `prompt-context` block on any user row). Scoring would produce
  misleadingly clean numbers against empty sets.
- `extract-error` — extract step threw on a post-BOT-1569 row
  (malformed `entity-usage` shape, etc.). Defense in depth.
- `stub` — Phase 1 placeholder so the integration is proven end-to-end
  before any real compute lands.

The sentinel is load-bearing for the backfill task: its discovery query
is `WHERE quality_breakdown IS NULL`, so writing a sentinel marks the
row "we tried; don't retry tomorrow."

### `metabot_message.quality_attribution`

```jsonc
{
  "version":     "v2.0",
  "observables": [
    {"concern_signal": "selection-quality",
     "kind":           "canonical-bypass",
     "entity":         {"type": "card", "id": 99},
     "context":        {"canonical-surfacing-turn": 6, "tool-call": "toolu_..."}},

    {"concern_signal": "execution-health",
     "kind":           "tool-error",
     "tool-call":      "toolu_...",
     "error":          "..."}
  ],
  "prefix_subscores": {"A": 0.84, "B": null, "C": 1.0, "D": 0.96, "composite": 0.93}
}
```

`prefix_subscores` is the score *as of the end of this turn*; the
conversation's last assistant row's `prefix_subscores` matches the
conversation-level numbers.

---

## §A — Layer 0 atoms (already persisted; no new code)

BOT-1569 closed the per-turn observability gap. For scoring we read:

- **User-row `data[1]`** — `{:type "prompt-context" :user_is_viewing [...]
  :user_recently_viewed [...] :mentioned_refs [...]}` (§B of BOT-1569 plan).
- **Assistant-row `data[*]`** — `:tool-input` parts paired with
  `:tool-output` parts whose `:result.structured-output.entity-usage`
  carries `:input` and `:output` ref lists (§A of BOT-1569 plan).
- **Outcome** — `:tool-output.error` per call.
- **Iteration anchor** — LLM-emission-group index within an assistant row.
- **Tool-type lookup** — `(:tool-type (meta tool-var))` from
  `metabase.metabot.tools` (closed Phase 3e); known at runtime by tool
  name → tool var.

The strip whitelist (`persisted-structured-output-keys`) already includes
`:entity-usage`. No persistence changes needed.

---

## §B — Layer 1 extract (`extract.clj`)

Public surface: one function, one return shape.

```clojure
(defn normalize
  "Read MetabotMessage rows for a conversation and produce the normalized
   atom struct used by every other Layer-2+ namespace. Pure given rows."
  [messages]
  ;; → {:conversation-id :profile-id :user-id :messages :tool-events
  ;;    :prompt-context :sets :terminal-state}
  )
```

### Normalized struct shape

```clojure
{:conversation-id  Long
 :profile-id       String
 :user-id          Long
 :messages         [{:id :role :iteration-index :created-at :data ...}]
 :tool-events      [{:call-id        String
                     :function       String
                     :tool-type      Keyword   ; :discovery :authoring :inspection :hybrid :utility
                     :arguments      Map       ; tool-input arguments
                     :iteration-index Long
                     :input          [entity-ref ...]
                     :output         [entity-ref ...]
                     :error          {...}    ; nil if call succeeded
                     :duration-ms    Long}]
 :prompt-context   {:P [entity-ref ...]}     ; user_is_viewing +
                                             ; mentioned_refs +
                                             ; user_recently_viewed unioned
 :sets             {:P {[type id-str] atom-record}
                    :D {[type id-str] atom-record}
                    :Q {[type id-str] atom-record}
                    :I {[type id-str] atom-record}
                    :H {[type id-str] atom-record}}   ; derived
 :terminal-state   :model_signaled_done | :final_response | :iter_cap | :error}
```

### Atom record

```clojure
{:type           "table"
 :id             35567
 :id-str         "35567"          ; coerced for stable dedup
 :provenance     [{:set       :D
                   :call-id   "toolu_..."
                   :iteration 3
                   :metadata  {:rank 0}}
                  {:set       :I
                   :call-id   "toolu_..."
                   :iteration 4}]
 :t-first-seen   3
 :t-first-used   nil              ; nil if E ∉ CONV_Q (populated by temporal.clj)
 :governance     nil}             ; populated by governance.clj
```

### Set construction rules

- **Entity key** — `[type id-str]` where `id-str = (str id)`. Stable dedup
  across int and string ids (some inspection tools record string ids for
  aggregation aliases).
- **CONV_P** — union of `user_is_viewing`, `mentioned_refs`, and
  `user_recently_viewed` across every user row's prompt-context block.
  Filter to known entity types (the closed `entity-types` enum from
  `metabase.metabot.tools.entity-usage`). All three sub-channels collapse
  into a single set at the scoring layer — see §"Future direction —
  free-form prompt-text extraction" below.
- **CONV_D** — union of `:output` refs from tool-events where
  `:tool-type ∈ {:discovery :hybrid}`. `:hybrid` is `read_resource`,
  whose listing dispatches surface entities to the LLM the same way
  search does, and whose single-entity dispatches surface child
  entities (e.g. fields of a table).
- **CONV_Q** — union of `:input` refs from tool-events where
  `:tool-type = :authoring`. Filter rules:
  - Drop refs with `:type "database"` (framing, not content; see
    anchoring default #5).
  - Memory-only refs (`query_id`, `chart_id`) are already excluded
    upstream — BOT-1569 enforces this at tool authorship time.
- **CONV_I** — union of `:input` refs from tool-events where
  `:tool-type ∈ {:inspection :hybrid}`. Hybrid inputs land here too
  because a `read_resource(metabase://table/123)` call is the agent
  fetching details about a known entity — semantically the same as an
  inspection-typed call.
- **CONV_H** — `CONV_Q \ (CONV_P ∪ CONV_D)` by set arithmetic.

### Future direction — free-form prompt-text extraction

CONV_P today only captures entities the agent saw through *structured*
prompt-context channels: `user_is_viewing`, `mentioned_refs` (parsed
`metabase://` URIs), and `user_recently_viewed`. Free-form user text —
e.g. *"use the orders_2023 table"* — can name an entity without it
appearing on any of those channels, which today lands the entity in
`CONV_H` even though the user did mention it.

The intended follow-up experiment is a **targeted Haiku extraction pass
over user message text** that resolves free-form entity references
against a candidate menu (recently-viewed entities, conversation-so-far
references, plus name-similarity candidates from appdb). Resolved
references would expand CONV_P's membership without changing the set
vocabulary — they simply move CONV_H members into CONV_P, naturally
tightening the Grounding concern signal with no other code path change.

Out of scope for this PR; see anchoring default #8 and the cross-check
at the bottom of this doc.

### Iteration-index assignment

Each assistant row's `:data` is a flat sequence of parts. An iteration is
a maximal run of `(:text | :tool-input | :tool-output | :data)` parts
emitted by a single LLM call. The boundary signal is the next `:tool-input`
after a streak of `:tool-output`s — i.e., the LLM was called again.

---

## §C — Layer 0 enrichment (`governance.clj`)

Public surface: one function, batched.

```clojure
(defn resolve
  "Given a seq of entity refs (across all sets), batch-query the appdb for
   the Layer-0 governance facts each needs and return a map keyed by
   [type id-str]."
  [entity-refs]
  ;; → {[type id-str] {:verified?           Boolean  ; cards only
  ;;                   :lives-in-personal?  Boolean  ; cards only
  ;;                   :name                String
  ;;                   :db-id               Long     ; tables only
  ;;                   :schema              String   ; tables only
  ;;                   :source-card-id      Long}}   ; cards only
  )
```

### Queries

Two batched queries pull just what concern signals actually consume —
no surface beyond it, to keep the breakdown payload small and the
appdb cost bounded:

```clojure
;; Cards (covers question/model/metric/card)
{:select    [:c.id :c.type :c.name :c.source_card_id
             :col.personal_owner_id :mr.status]
 :from      [[:report_card :c]]
 :left-join [[:collection :col] [:= :col.id :c.collection_id]
             [:moderation_review :mr]
              [:and [:= :mr.moderated_item_id :c.id]
                    [:= :mr.moderated_item_type "card"]
                    [:= :mr.most_recent true]]]
 :where     [:in :c.id <card-ids>]}

;; Tables
{:select [:t.id :t.name :t.schema :t.db_id]
 :from   [[:metabase_table :t]]
 :where  [:in :t.id <table-ids>]}
```

Surfaced facts per resolved entity:

- Cards: `:verified?`, `:lives-in-personal?`, `:name`, `:source-card-id`
- Tables: `:schema`, `:db-id`, `:name`

Dashboards, transforms, and databases need only `:name` for per-turn
attribution debugging; one tiny lookup each. No fact is surfaced unless
a concern signal reads it (see anchoring default #11 on
archived/deleted exclusion).

### Ancestry walks

For cards-via-source-card chains (deeply nested model layering), memoize
within a single scoring call so an N-deep walk doesn't issue N queries.
Implemented as a local `(memoize ...)` inside `compute-conversation-score`'s
scope, dropped after the score completes.

---

## §D — Layer 2 temporality (`temporal.clj`)

Pure functions over the normalized struct's `:tool-events` and `:sets`.

```clojure
(defn derive
  "Layer-2 derivations: per-entity timelines, conversation rhythms,
   thrash, re-discovery, error trajectory, terminal state."
  [normalized]
  ;; → normalized with :sets enriched (t-first-* populated) and
  ;;   :temporal {:iterations Long :thrash-events Long
  ;;              :rediscovery-pairs Long :errors-resolved-rate Double
  ;;              :terminal-state Keyword}
  )
```

### Derivations

- **`t-first-seen(E)`** — `min(iteration-index)` over all provenance
  entries of E.
- **`t-first-used(E)`** — `min(iteration-index)` over E's authoring
  provenance entries. `nil` if E ∉ CONV_Q.
- **`conv-distance(E)`** — `t-first-used − t-first-seen` for E ∈ CONV_Q.
- **Total iterations** — `(inc (apply max (map :iteration-index events)))`.
- **Thrash signature** — for adjacent same-function tool-events in the
  same iteration window, normalized Levenshtein on serialized
  arguments; flag pairs above `query-similarity-threshold` (default
  0.8 = 1 − 0.2 distance ratio, defined in `constants.clj`); count
  flagged pairs.
- **Re-discovery** — for the sequence of search-tool calls (`:function`
  in `search-tools-set`), cluster their query-string arguments by
  normalized-Levenshtein similarity above `query-similarity-threshold`
  (same constant as thrash). Define `r = N_search − N_clusters`, where
  `N_search` is the count of search calls and `N_clusters` is the
  count of distinct similarity-clusters. Reading: `r` counts each
  search call that duplicates an earlier one; five identical searches
  yield `r = 4`. `r ∈ [0, N_search − 1]`.
- **Errors-resolved-on-next-attempt rate** — for each errored call,
  scan the next call with same `:function` and same target argument(s);
  count `(error_n → ok_{n+1})` pairs. Rate = resolved / total errored.
  Computed directly from `:tool-events[*].error`.

### Terminal-state classification

Read from the persisted assistant row in priority order:

1. If the row's `:data` contains a `{:type "data" :data-type "terminal_state"}`
   block, use its `:reason`. (Plumbing added in Phase 1.)
2. Else if `metabot_message.error` is non-nil → `:error`.
3. Else if `metabot_message.finished = false` → `:aborted` (treated as
   `:error` for concern purposes; surfaced separately in the breakdown
   context block).
4. Else fall back to `:model_signaled_done`.

The agent loop's `finish-reason` enum (`:max-iterations`,
`:final-response`, `:stop`) maps to:

```
:max-iterations → :iter_cap
:final-response → :final_response
:stop           → :model_signaled_done
```

---

## §E — Layer 3 concern signals (`concern_signals.clj`)

Six closed-form magnitudes ∈ `[0, 1]`. Each is a pure function of the
normalized struct (with governance + temporal already populated).
Saturation constants live in `constants.clj`.

```clojure
(defn compute
  "Six concern signal magnitudes — each in [0, 1], 0 = no signal, 1 = max."
  [normalized governance]
  ;; → {:selection-quality       Double
  ;;    :grounding               Double
  ;;    :discovery-efficiency    Double
  ;;    :execution-health        Double
  ;;    :conversational-economy  Double
  ;;    :termination             Double}
  )
```

### The six

| # | Concern signal | Formula (sketch) |
|---|----------------|------------------|
| 1 | Selection quality | Weighted mean of (substitution count saturated as `s/(s+C-substitution)`, % CONV_Q in personal-collection). Substitution detection scoped to cards+tables only |
| 2 | Grounding | `\|CONV_H_ambiguous\| / (\|CONV_H_ambiguous\| + C-grounding)` — three-bucket variant (see anchoring default #8) |
| 3 | Discovery efficiency | Weighted mean of (surfaced-but-unused fraction `\|CONV_D \ CONV_Q\| / \|CONV_D\|`, avg-rank-used normalized, re-discovery count saturated as `r/(r + C-rediscovery)`) |
| 4 | Execution health | Floor-bounded boost (see formula below) so persistent errors hurt more than transient ones |
| 5 | Conversational economy | Weighted mean of (iterations / max(1, \|CONV_Q\|) saturated above target ratio, thrash count saturated, max per-entity reuse saturated above baseline) |
| 6 | Termination | Categorical: `model_signaled_done` → 0, `final_response` → 0, `iter_cap` → 1, `error` → 1 |

### Substitution detection (Concern signal 1)

For each `Y ∈ CONV_Q` of `:type "table"` or `:type` ∈ {`"card"`,
`"question"`, `"model"`, `"metric"`}, where `Y.governance.verified?` is
false:

- Search CONV_D for an X with:
  - Same `:type`
  - `X.governance.verified?` = true
  - `X.governance.db-id = Y.governance.db-id`
  - `X.governance.schema = Y.governance.schema` (tables only)
  - Normalized Levenshtein(`X.name`, `Y.name`) ≤ 0.3
- OR (cards/models only): X is a model whose `source-card-id` resolves
  ancestrally to Y.

Count matches. Saturate as `s / (s + C-substitution)`.

### Execution health (Concern signal 4)

```
let p = 1 − success_rate          ; fraction of tool calls that errored
let u = 1 − errors_resolved_rate  ; fraction of errors NOT resolved on next attempt
let α = eh-mitigation-floor       ; constants.clj; default 0.5

execution_health_signal = p × (α + (1 − α) × u)
```

Reading:

- `p` is the raw failure rate.
- `u ∈ [0, 1]` boosts the penalty when errors persist — at `u = 1` the
  signal is the full `p`; at `u = 0` it drops to `α · p`.
- `α` is the floor: even fully-mitigated errors still contribute some
  signal, because a clean conversation should not error at all.
- Output stays in `[0, 1]`.

Defaults to land on representative fixtures during Phase 5
calibration.

### Three-bucket grounding (Concern signal 2)

For each E ∈ CONV_Q, classify into:

- `grounded_via_P` — E ∈ CONV_P (prompt-context channel)
- `grounded_via_D` — E ∈ CONV_D (discovery channel)
- `ambiguous` — E ∈ CONV_H by set construction; could be hallucinated or
  a free-form prompt-text reference we cannot detect

`CONV_H_ambiguous = CONV_H`. The concern signal is computed against the
ambiguous bucket only.

A future Haiku extraction over user message text (deferred per
anchoring default #8) would resolve free-form prompt-text references
to additional CONV_P members. The signal formula does not change —
the additional entities move from CONV_H into CONV_P, naturally
tightening Grounding without any new code path.

---

## §F — Layer 4 subscores (`subscores.clj`)

```clojure
(defn compose
  "Group concern signals into A/B/C/D; composite via geometric mean over non-N/A."
  [normalized concern-signals]
  ;; → {:A Double-or-nil
  ;;    :B Double-or-nil
  ;;    :C Double
  ;;    :D Double
  ;;    :composite Double
  ;;    :na #{:A :B}}
  )
```

| Subscore | Combines | N/A precondition |
|----------|----------|------------------|
| A — Input quality | selection-quality + grounding | `\|CONV_Q\| = 0` AND no authoring tool ever called |
| B — Discovery quality | discovery-efficiency | `\|CONV_D\| = 0` |
| C — Execution health | execution-health | (always applicable) |
| D — Trajectory | conversational-economy + termination | (always applicable) |

### Within-subscore composition

Arithmetic mean of `(1 − signal_i)` across the concern signals in that
subscore. Each subscore ∈ `[0, 1]`, 1 = healthy.

### Across-subscore composition

Geometric mean over non-N/A subscores: `(∏ Sᵢ)^(1/n)` where `n` is the
count of non-N/A subscores. Weakest-link dominates.

### artifact-intended? gating

Subscore A is N/A iff:
- `|CONV_Q| = 0`, AND
- no tool-event in the conversation has `:tool-type = :authoring`.

Derived from the trajectory, not from the profile (per the strategy doc).
A conversation that called an authoring tool with bad args (no CONV_Q
populated) still wanted an artifact — Subscore A applies and the
concern signals will reflect the failure.

---

## §G — Per-turn attribution (`attribution.clj`)

```clojure
(defn project
  "Project the conversation-level analysis back onto each assistant turn.
   Returns a map keyed by message-id → quality_attribution JSON shape."
  [normalized concern-signals subscores]
  ;; → {message-id {:version "v2.0"
  ;;                :observables [...]
  ;;                :prefix_subscores {...}}}
  )
```

### Observables fired per turn

| Concern signal | Observable kind | Attributed to |
|----------------|-----------------|---------------|
| selection-quality | `canonical-bypass` | Turn where the bypass authoring call happened (back-reference to the turn that surfaced the canonical version) |
| selection-quality | `personal-collection-pick` | Turn of the authoring call |
| grounding | `hallucinated-ref` | Turn where the hallucinated ref entered CONV_Q |
| discovery-efficiency | `unused-surfacing` | Turn of the discovery call |
| discovery-efficiency | `rediscovery` | Turn of the redundant search call (the duplicate of an earlier search) |
| execution-health | `tool-error` | Turn of the errored call |
| conversational-economy | `thrash-event` | Turn of the second-in-pair (visibility moment) |
| termination | `iter-cap` | Last assistant turn |
| termination | `error-termination` | Last assistant turn |

### `prefix_subscores`

For each turn N, recompute the subscore vector over the
conversation-up-to-turn-N. Use the same `subscores/compose` machinery,
restricting `:tool-events` and `:sets` to events with `:iteration-index
≤ end-iteration-of-turn-N`. The N=last turn's `prefix_subscores`
matches the conversation-level numbers; verified by an end-to-end test.

---

## §H — Persistence integration (`core.clj`)

```clojure
(defn score-conversation!
  "Compute and persist the quality score + per-turn attribution for a
   conversation. Returns:
     number    — clean score
     :sentinel — pre-foundation / extract-error sentinel breakdown written
     nil       — exception caught by the safety guard, no UPDATE fired.

   Safety guard is log-only at MVP; observability instrumentation is a
   follow-up task."
  [conversation-id]
  (try
    (let [messages (conversation-messages conversation-id)
          result   (compute-conversation-score messages)]
      (write-result! conversation-id result)
      (:quality_score result))
    (catch Throwable t
      (log/error t "score-conversation! threw"
                 {:conversation-id conversation-id})
      nil)))

(defn compute-conversation-score
  "Pure given rows. The full Layer 1 → Layer 4 pipeline."
  [messages]
  (let [normalized (extract/normalize messages)]
    (if (pre-foundation? normalized)
      {:quality_score nil
       :quality_breakdown (sentinel "pre-foundation")
       :quality_attribution {}}
      (let [governance      (governance/resolve (all-entity-refs normalized))
            normalized      (-> normalized
                                (assoc-governance governance)
                                (temporal/derive))
            concern-signals (concern-signals/compute normalized governance)
            subscores       (subscores/compose normalized concern-signals)
            attribution     (attribution/project normalized concern-signals subscores)]
        {:quality_score        (:composite subscores)
         :quality_breakdown    (build-breakdown subscores concern-signals normalized)
         :quality_attribution  attribution}))))
```

### Integration in `finalize-assistant-turn!`

```clojure
(defn finalize-assistant-turn!
  [conversation-id assistant-msg-id parts & {:as opts}]
  (let [...]
    (t2/with-transaction [_conn]
      (when state-part ...)
      (t2/update! :model/MetabotMessage assistant-msg-id ...)
      ;; New: scoring runs in the same tx, guarded so a scoring
      ;; throw can never roll back the user-visible UPDATE.
      (try
        (quality.core/score-conversation! conversation-id)
        (catch Throwable t
          (log/error t "score-conversation! escaped the inner guard"
                     {:conversation-id conversation-id}))))))
```

The double try/catch (inner in `score-conversation!`, outer here) is
intentional: the inner is the canonical catch boundary that emits the
structured log; the outer is defense in depth for any throw that
escapes the inner (e.g., a throw inside `profile-id-for-conversation`).

### `pre-foundation?` detection

A conversation has pre-foundation rows iff any assistant message row
has `:data` parts where:

- No `:tool-input` parts carry a `:tool-output` whose
  `:structured-output.entity-usage` is populated, AND
- No user row has a `data[1] {:type "prompt-context"}` block.

In other words: this conversation predates BOT-1569. Score lands as
`nil` with a `pre-foundation` sentinel breakdown so the backfill job
doesn't re-try the row tomorrow.

---

## §I — Terminal-state plumbing

The agent loop's `finish-reason` (`agent/core.clj:192`) is currently
log-only. The scoring temporal layer needs it persisted on the
assistant row.

### Orthogonality with `metabot_message.error`

`metabot_message.error` and the new `terminal_state` data part record
different things and do not conflict:

- `metabot_message.error` — *why* a turn failed. Populated by `api.clj`
  with precedence `aborted > thrown > streamed :error part`. Set only
  when the turn errored.
- `terminal_state` data part — *how* the agent loop exited. Emitted on
  every successful loop exit, regardless of whether tools errored
  individually within the loop.

So:

- Clean completion → terminal_state present, error null → temporal uses
  the data part's `:reason`.
- Throw escaped the loop → no terminal_state (the `:done` branch was
  never reached), error non-null → temporal classifies as `:error`.
- Tool errored but loop still completed → terminal_state present, error
  may also be non-null (a streamed `:error` part can land in the column).
  Temporal uses the data part's `:reason` for termination; the per-tool
  errors are independently visible to execution-health via
  `:tool-events[*].error`.

This work does **not** change the population logic of
`metabot_message.error` — `terminal_state` is purely additive.

### Approach: emit a typed `terminal_state` data part

Add a new data-part type alongside `state` / `navigate_to` / `code_edit`:

```clojure
;; src/metabase/metabot/agent/streaming.clj
(def terminal-state-type "AI-SDK data type for agent loop terminal state."
  "terminal_state")

(defn terminal-state-part
  [reason]
  {:type :data, :data-type terminal-state-type, :version 1,
   :data {:reason (name reason)}})
```

Emit from `loop-step` whenever the loop transitions to `:done`. There
are **two** `:done` branches today and both must emit the part:

1. **Normal completion** (`agent/core.clj:519`, the `:else` of the
   inner cond) — the LLM produced parts and `should-continue?` returned
   false. Use `(finish-reason iteration max-iter parts)`, which yields
   `:max-iterations | :final-response | :stop`.
2. **Empty-parts exit** (`agent/core.clj:503`) — the LLM call returned
   no AISDK parts at all. Rare; effectively a degenerate completion.
   Emit `terminal-state-part :empty-response`.

```clojure
;; agent/core.clj loop-step
(if (empty? parts)
  (let [r (rf result (streaming/terminal-state-part :empty-response))
        r (rf r (final-state-part @memory-atom))]
    (assoc loop-state :status :done :result r))
  (do
    ...
    (cond
      ...
      :else
      (let [reason (finish-reason iteration max-iter parts)]
        (assoc loop-state
               :status :done
               :result (-> result'
                           (rf (streaming/terminal-state-part reason))
                           (rf (final-state-part @memory-atom))))))))
```

Persisted-categorical mapping (used by `temporal.clj` and concern
signal 6):

| `finish-reason` keyword | Persisted categorical |
|---|---|
| `:max-iterations` | `:iter_cap` |
| `:final-response` | `:final_response` |
| `:stop`           | `:model_signaled_done` |
| `:empty-response` | `:error` (degenerate completion; concern signal 6 treats as termination failure) |

`persistable-data-part?` returns true for `terminal_state` (it's not a
`state` part), so it lands in `metabot_message.data` via the normal
streaming path. `temporal.clj` reads `data` for the part and projects
the `:reason` keyword.

### Chat-render safety

`convert-content-block` in `persistence.clj` falls through to `nil` for
unknown `data-type` values, and `keep` filters nils. So a
`terminal_state` data part produces no visible chat message — identical
to today's behavior for `state` data parts.

Pin with `terminal-state-data-part-is-not-rendered-as-chat-message-test`
in the persistence test ns.

### Fallback when the part is missing

For pre-Phase-1 rows and any row whose stream got cut before the
terminal-state part was emitted, `temporal.clj` falls back through the
priority order in §D (error → aborted → model_signaled_done).

---

## §J — Backfill task

Daily Quartz job that scores rows whose `quality_breakdown` is NULL.
Discovery is newest-first so freshly-finalized conversations get scored
before historical backlog; a per-run skip-set prevents a row whose
`score-conversation!` returned `nil` (caught throw, no UPDATE) from
being re-discovered within the same run.

```clojure
;; src/metabase/metabot/task/quality_score_backfill.clj
(ns metabase.metabot.task.quality-score-backfill
  ...
  (:require
   [clojurewerkz.quartzite ...]
   [metabase.metabot.quality.core :as quality.core]
   [metabase.task.core :as task]
   [toucan2.core :as t2]))

(def ^:private batch-size 500)

(defn- unprocessed-conversation-ids []
  (->> (t2/query {:select [:id]
                  :from [:metabot_conversation]
                  :where [:= :quality_breakdown nil]
                  :order-by [[:created_at :desc]]
                  :limit batch-size})
       (map :id)))

(defn- backfill-quality-scores! []
  (loop [iteration 1 attempted #{} scored 0 sentinel 0 errored 0]
    (let [discovered (unprocessed-conversation-ids)
          ids        (vec (remove attempted discovered))]
      (if (empty? ids)
        (log/infof "Backfill complete: scored %d sentinel %d errored %d"
                   scored sentinel errored)
        (let [results (mapv (fn [id] [id (quality.core/score-conversation! id)]) ids)
              this-scored   (count (filter (comp number?      second) results))
              this-sentinel (count (filter (comp #{:sentinel} second) results))
              this-errored  (count (filter (comp nil?         second) results))]
          (recur (inc iteration)
                 (into attempted (map first) results)
                 (+ scored this-scored)
                 (+ sentinel this-sentinel)
                 (+ errored this-errored)))))))
```

Quartz schedule: daily at `02:17:43` — off-the-hour, in the low-traffic
overnight window.

---

## §K — EE analytics surface

### New analytics-view version

Add `resources/migrations/instance_analytics_views/metabot_conversations/v4/`
with postgres / mysql / h2 variants of the view, extending v3 by:

```sql
-- additional projected columns
c.quality_score                                                    AS quality_score,
c.quality_breakdown                                                AS quality_breakdown,
```

Migration changeset under `062/<date>_metabot_quality_score.yaml`
following the prior-version pattern (`runOnChange: true`,
`DROP VIEW IF EXISTS v_metabot_conversations` rollback).

### EE conversation-detail response shape

`enterprise/.../metabot_analytics/conversations.clj` defines
`fetch-conversation-detail`, the function that backs the EE admin
Metabot Analytics → individual-conversation drill-down page. It returns
a single map combining conversation-level metadata, hydrated user info,
the frontend-ready flattened `chat_messages` stream, the queries the
bot generated, and any user-submitted feedback.

Extend that response shape (no new endpoint — the existing detail
endpoint just returns the additional fields) to surface:

- `quality_score`, `quality_breakdown` at the conversation level
- `quality_attribution` per assistant message (carried alongside each
  assistant `chat_messages` entry, or as a parallel
  `{message-external-id → attribution}` map at the conversation level —
  pick whichever ergonomics the admin UI consumes more cleanly)

Aggregate analytics endpoints (score distributions, per-concern-signal
rollups) are intentionally out of scope here; they are a follow-up
once the in-tx scoring pipeline has produced enough rows for the
shapes to be designed against real data. The per-entity rollup view
from the strategy doc's Layer 5 is similarly out of scope and is the
natural home for the deferred `ai_tool_usage` sidecar table.

---

## Phase plan

Ten phases. Each phase ends in a green build with a verifiable property
the user can eyeball. **Pause between phases** for the user to redirect
or approve before the next starts (matches BOT-1569 working agreement).

### Phase 1 — Schema, scaffold, terminal-state plumbing

End state: every new conversation gets a `quality_breakdown` row with a
stub value at finalize time. The integration point is wired and proven
not to roll back the user-visible UPDATE on a scoring throw. The
terminal-state data part is being emitted by the agent loop and
persisted.

- Liquibase migration `062/YYYYMMDD_metabot_quality_score.yaml`
  - `metabot_conversation.quality_score` (double, nullable)
  - `metabot_conversation.quality_breakdown` (text, nullable)
  - `metabot_message.quality_attribution` (text, nullable)
- Update `models/metabot_conversation.clj` `deftransforms`:
  `:quality_breakdown mi/transform-json`
- Update `models/metabot_message.clj` `deftransforms`:
  `:quality_attribution mi/transform-json`
- Create `src/metabase/metabot/quality/constants.clj`
  - `composite-version` = `"v2.0"`
  - Saturation constants (placeholders; tuned during MVP calibration)
- Create `src/metabase/metabot/quality/core.clj` with a **stub**:
  - `score-conversation!` returns `:sentinel` and writes the
    sentinel breakdown shape (`{"version":"v2.0","unscoreable":"stub"}`)
  - Sentinel handling proven end-to-end before any real compute lands
- Wire `quality.core/score-conversation!` into
  `finalize-assistant-turn!` inside the same transaction, with inner
  try/catch in `score-conversation!` (log-only) and outer try/catch
  at the integration site (log-only)
- **Terminal-state plumbing**:
  - `agent/streaming.clj`: add `terminal-state-type`,
    `terminal-state-part`
  - `agent/core.clj`: emit the part in *both* `loop-step` `:done`
    branches (empty-parts at line 503; normal `should-continue?`-false
    at line 519). Map the agent loop's `finish-reason` keyword to the
    persisted categorical; the empty-parts branch — rare; LLM call
    returned nothing — uses a distinct `empty_response` reason that
    `temporal.clj` projects to `:error` for concern-signal purposes.
  - `persistence.clj`: confirm `convert-content-block` skips the new
    type (chat-render invisibility test)
- Unit tests in `test/metabase/metabot/quality/core_test.clj`
  - Stub score-conversation! writes the sentinel breakdown
  - Integration: a turn finalize writes the breakdown column
  - Throw in `score-conversation!` doesn't roll back the message UPDATE
  - Outer guard catches throws that escape the inner guard
- Unit tests in `test/metabase/metabot/agent/core_test.clj`
  - `terminal_state` data part is emitted on `:final-response`,
    `:max-iterations`, `:stop` branches
  - Part is invisible in chat-detail
- Kondo clean on every touched file

### Phase 2 — Layer 1 atoms + sets (`extract.clj`)

Pure-code phase. No user-visible change. `score-conversation!` remains
the stub.

- Create `src/metabase/metabot/quality/extract.clj`
- `normalize` returns the full struct documented in §B
- Build `:tool-events` from paired tool-input/tool-output parts
- Build `:prompt-context` from user-row `data[1]` blocks
- Set construction: CONV_P/D/Q/I, then CONV_H by set arithmetic
- Database refs filtered from CONV_Q (anchoring default #5)
- Iteration-index assignment via the BOT-1569 iter-count convention
- Pure unit tests with fixture conversations
  - representative `internal` profile conversation (search → notebook → chart)
  - `sql` profile (sql_search → create_sql_query → edit_sql_query → clarification)
  - `transforms_codegen` (transform_search → details → fields → write)
  - hallucination scenario (authoring ref ∉ P/D)
  - structural-overlap scenario (field in Q with table in D)
- Kondo clean

### Phase 3 — Layer 0 enrichment (`governance.clj`)

Pure-with-DB phase. No score change yet.

- Create `src/metabase/metabot/quality/governance.clj`
- `resolve` returns governance facts keyed by `[type id-str]`
- Two batched queries: cards (with collection + moderation_review join),
  tables. Minimal `:name`-only lookup for dashboards / databases /
  transforms (used for per-turn attribution debugging)
- No `:archived?` / `:deleted?` fact surfaced (anchoring default #11)
- Source-card ancestry walks memoized per `score-conversation!` invocation
- Unit tests in `test/metabase/metabot/quality/governance_test.clj`
  - `t2.with-temp` fixtures: verified card, unverified card,
    personal-collection card, model-of-card
  - Source-card ancestry walk terminates correctly on root cards
- Kondo clean

### Phase 4 — Layer 2 temporality (`temporal.clj`)

Pure-code phase. No score change yet.

- Create `src/metabase/metabot/quality/temporal.clj`
- `derive` populates `:t-first-seen` / `:t-first-used` on each set's
  atom records
- Compute `:temporal {:iterations :thrash-events :rediscovery-pairs
  :errors-resolved-rate :terminal-state}`
- Thrash detection uses normalized Levenshtein on serialized args
  (string-distance via existing `metabase.util` helper if available;
  otherwise a small impl in `temporal.clj`)
- Re-discovery uses the same Levenshtein on search-tool query-string
  arguments
- Errors-resolved-on-next-attempt — same-function + same-target
  matching; computed directly from `:tool-events[*].error`
- Terminal-state read from the new data part with fallback chain
  (data-part → error col → finished col → default)
- Unit tests in `test/metabase/metabot/quality/temporal_test.clj`
  - Productive-iteration (errors decreasing) vs. thrash (errors flat)
  - Re-discovery detection across similar search queries
  - Terminal-state for all four categories
- Kondo clean

### Phase 5 — Layer 3 concern signals (`concern_signals.clj`)

Pure-code phase. No score change yet.

- Create `src/metabase/metabot/quality/concern_signals.clj`
- Six concern signal functions (§E table)
- Selection-quality substitution detection scoped to cards+tables
  (anchoring default #7); name similarity via normalized Levenshtein
- Three-bucket grounding variant (§E)
- Execution health uses the floor-bounded boost formula (§E)
- Saturation constants and `eh-mitigation-floor` pulled from `constants.clj`
- Unit tests in `test/metabase/metabot/quality/concern_signals_test.clj`
  - Each concern signal at 0 (healthy fixture), at 1 (worst-case fixture),
    and at a calibrated mid-value
  - Substitution detection: positive case (verified sibling found),
    negative case (no sibling), edge case (similar name but different
    schema)
- Kondo clean

### Phase 6 — Layer 4 subscores + wire-up (`subscores.clj`)

End state: real scores are now being written. The stub in
`score-conversation!` is replaced.

- Create `src/metabase/metabot/quality/subscores.clj`
- A/B/C/D subscores with N/A semantics
- Geometric-mean composite over non-N/A
- `artifact-intended?` gating derived from `:tool-events`
- Replace the Phase-1 stub in `core.clj`:
  - `compute-conversation-score` wires extract → governance → temporal
    → concern signals → subscores
  - Build the `quality_breakdown` JSON per the §Storage formats shape
  - Persist `quality_score` and `quality_breakdown` on the conversation
  - `pre-foundation?` detection (§H) writes the `pre-foundation`
    sentinel instead of running the pipeline against rows with no
    Layer-0 atoms to score from
- Unit tests in `test/metabase/metabot/quality/subscores_test.clj`
  - Geometric mean over non-N/A subscores
  - Subscore A N/A when no authoring tool was called
  - Subscore B N/A when no discovery happened
  - Worst-link domination (one bad subscore craters the composite)
- End-to-end test in `core_test.clj`:
  - Seed a conversation; run finalize; read back
    `quality_score` and `quality_breakdown`; assert shape and approximate
    value
- Kondo clean

### Phase 7 — Per-turn attribution (`attribution.clj`)

End state: every assistant row carries a `quality_attribution` JSON
shape with observables + prefix-subscores.

- Create `src/metabase/metabot/quality/attribution.clj`
- `project` returns `{message-id → attribution-map}`
- Observable kinds per §G's table
- `prefix_subscores` computed per turn by restricting the input to
  events with `:iteration-index ≤ end-iteration-of-turn-N` and re-using
  `subscores/compose`
- Extend `core.clj/compute-conversation-score` to return
  `:quality_attribution`; extend the persist step to UPDATE every
  assistant row's column
- Unit tests in `test/metabase/metabot/quality/attribution_test.clj`
  - Canonical-bypass attribution lands on the bypass turn with a
    back-reference to the canonical-surfacing turn
  - Tool-error attribution lands on the errored turn
  - Last-turn `prefix_subscores` matches the conversation-level
    breakdown
- Migration smoke: 10-turn fixture conversation → 10 attribution
  blocks, each with `prefix_subscores`
- Kondo clean

### Phase 8 — Backfill task

End state: pre-foundation conversations get marked with the sentinel
on a daily cron.

- Create `src/metabase/metabot/task/quality_score_backfill.clj`
- Quartz schedule: daily `02:17:43` (off-the-hour, low-traffic
  overnight window)
- Skip-set per run; newest-first discovery order
- Unit tests
  - Job discovery query returns ids of conversations where
    `quality_breakdown IS NULL`
  - Per-id loop tolerates throws and continues
  - Sentinel breakdown is written for pre-foundation conversations so
    they're not re-discovered tomorrow
- Wire-up via `defmethod task/init! ::QualityScoreBackfill`
- Kondo clean

### Phase 9 — EE analytics surface

End state: EE admin pages surface the quality breakdown + per-turn
attribution via the existing conversation-detail endpoint and the
analytics view.

- Add `resources/migrations/instance_analytics_views/metabot_conversations/v4/`
  with postgres/mysql/h2 SQL variants, extending v3 by selecting
  `c.quality_score` and `c.quality_breakdown`
- Add changeset in `062/<date>_metabot_quality_score.yaml`
  installing the v4 view, following the prior-version
  `runOnChange: true` pattern
- Extend `fetch-conversation-detail` in
  `enterprise/.../metabot_analytics/conversations.clj` to surface:
  - `quality_score`, `quality_breakdown` at the conversation level
  - `quality_attribution` per assistant message
- EE-only tests covering the extended response shape
- Kondo clean

### Phase 10 — Operational verification

End state: every profile exercised end-to-end against the dev appdb;
representative conversations spot-checked for sensible scores; backfill
job exercised on the historical corpus; ready to merge.

- Exercise each profile against `bot-1569-track-injected-context` (the
  branch's dev appdb) plus a representative production-shape snapshot
  - `internal`: search → construct → chart → navigate → score lands
  - `sql`: sql_search → create → edit → clarification → score lands
  - `transforms_codegen`: search → details → write → score lands
  - `embedding_next`: nlq_search → construct → chart → score lands
- Eyeball 5–10 conversations of each profile:
  - Are the subscores defensible to a reviewer reading the transcript?
  - Are observables in `quality_attribution` attributed to the right
    turn?
  - Is `pre-foundation` correctly applied to pre-BOT-1569 rows?
- Exercise the backfill task against the dev appdb:
  - Confirm sentinel rows are not re-discovered on the next run
  - Confirm scoreable rows get scored cleanly
- Confirm no `score-conversation!` errors in the app log after a
  representative session
- Confirm row-size impact:
  - `quality_breakdown` ≈ a few hundred bytes per conversation
  - `quality_attribution` ≈ low-KB per assistant row
- Kondo + test suite green:
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

End state: ready to merge.

---

## Deferred — primitives no MVP concern signal consumes

These were initially scoped as Layer 0–2 facts but cut from MVP because
no Layer 3 concern signal reads them. Listed here as the natural
re-entry points if a future concern signal or Layer 5 consumer wants
them. Re-adding any of these is mechanical.

**Atom record**
- `:t-last-used` — last-use iteration per entity. Only `t-first-used`
  feeds `conv-distance` today. Re-add if a "stale-use" or "long-lived
  entity" signal lands in a concern signal.

**Governance** (`governance.clj` query columns and derived map keys)
- `:archived?` / `:deleted?` — cut per anchoring default #11; metabot
  search filters archived out, so the signal isn't agent-attributable.
  Re-add if a future authoring path bypasses search.
- `:authority-level` — `:verified?` already covers the canonical-rank
  signal end-to-end. Re-add if a future concern signal wants to
  distinguish "official" from "verified" without merging the two.
- `:view-count`, `:view-count-percentile`, and the
  `metabase.search.appdb.scoring/view-count-percentiles` cache pattern
  — strategy doc lists "% popular" as a per-set fact; no MVP concern
  signal uses it. Re-add together if Selection quality grows a
  popularity component.
- `:collection-location` — surfaced for context only. Re-add if
  Selection quality wants to score collection-tree placement (e.g.
  trash, draft folders).
- `:creator-id` — surfaced for context only.
- `:source-table-id` — only `:source-card-id` is needed for the
  substitution-detection lineage walk. Re-add if substitution detection
  wants to follow direct table-source chains as well.

**Temporal**
- `:tool-calls-per-iteration` — per-iteration call distribution. No
  concern signal consumes it; Conversational economy uses the
  iteration total instead. Re-add for finer-grained density observables.
- `:error-sequence` — full ordered `[(call-id, ok|error)]` list. Only
  `:errors-resolved-rate` is read, and both that and the success-rate
  input to Execution health can be computed directly from
  `:tool-events[*].error`. Re-add as a pre-derived list if a future
  observable wants the temporal shape pre-extracted.
- `:chain-shapes` (per E) and `:chain-histogram` — per-entity
  `:direct/:inspected/:orphan` classification. Strategy doc calls
  this "useful as an observable in its own right" but no MVP concern
  signal reads it. Re-add for `quality_attribution` debugging or for
  a future "discovery → use trajectory" concern signal.

**Provenance metadata**
- D-provenance: `:uri`, `:verified`, `:database_id` — debug context;
  superseded by the `:governance` enrichment block on each atom.
- Q-provenance: `:arg_slot` — informational. §G attribution observables
  don't reference it; re-add if a future observable wants to attribute
  by argument position.

---

## Out of scope (referenced for cross-check)

- **Sidecar `ai_tool_usage` table.** Promotion is mechanical when admin
  per-entity rollups become product (one
  `INSERT INTO ai_tool_usage SELECT … jsonb_path_query …`).
- **Layer 5 — admin rollups and recommendations.** Per-entity, per-pattern,
  per-region clustering on top of `quality_attribution`. Atom grain in
  the per-turn shape is preserved so this can be added without
  re-extracting from raw rows.
- **Backfill of historical entity-usage data.** Forward-only — historical
  conversations carry the `pre-foundation` sentinel and `quality_score
  = NULL`.
- **Free-form prompt-text entity extraction (Option-2 Haiku).** The
  three-bucket Grounding variant is the MVP stance. Worth running an
  empirical pass against the existing corpus to measure the size of
  the `ambiguous` bucket before deciding whether to invest.
- **Async-tail compute.** Default is in-tx for simplicity. If governance
  queries or per-conversation compute push the in-tx cost above ~50 ms,
  detach `score-conversation!` to a fire-and-forget job. **No primitives
  change** to enable this — only the entry point's synchronous contract
  flips.
- **Substitution detection for non-card / non-table types.** Dashboards,
  databases, transforms contribute to set-construction and grounding
  but not to selection-quality's substitution component.
- **Archived / deleted entity modeling.** Metabot search hard-codes
  `:archived false`, so archived entities cannot land in CONV_D and
  any archived entity in CONV_Q originates from a user-provided
  reference. Not modeled as a selection-quality signal — see anchoring
  default #11. Re-add if a future authoring path bypasses search.
- **Aggregate analytics endpoints.** Score-distribution histograms,
  per-concern-signal rollups, and any other admin-page aggregate
  shapes are deliberately not in this PR. The EE conversation-detail
  endpoint carries the data; aggregate surfaces are a follow-up after
  the in-tx pipeline has produced enough rows for shapes to be
  designed against real data.
- **Operational telemetry for the scoring guard.** The inner / outer
  `score-conversation!` try/catch is log-only at MVP. A follow-up task
  adds Prometheus / Snowplow instrumentation once the guard is proven
  in production.
- **Calibration of saturation constants against a real corpus.**
  Constants are chosen at design time and held fixed in `constants.clj`.
  Re-tuning is a follow-up — by intent, this scoring framework is
  defensible without corpus stats.

---

## Key file references

| Area | File |
|---|---|
| Public API + integration | `src/metabase/metabot/quality/core.clj` (new) |
| Layer 1 extract | `src/metabase/metabot/quality/extract.clj` (new) |
| Layer 0 enrichment | `src/metabase/metabot/quality/governance.clj` (new) |
| Layer 2 temporality | `src/metabase/metabot/quality/temporal.clj` (new) |
| Layer 3 concern signals | `src/metabase/metabot/quality/concern_signals.clj` (new) |
| Layer 4 subscores | `src/metabase/metabot/quality/subscores.clj` (new) |
| Per-turn attribution | `src/metabase/metabot/quality/attribution.clj` (new) |
| Constants | `src/metabase/metabot/quality/constants.clj` (new) |
| Backfill task | `src/metabase/metabot/task/quality_score_backfill.clj` (new) |
| Finalize integration | `src/metabase/metabot/persistence.clj` |
| Terminal-state emission | `src/metabase/metabot/agent/core.clj`, `src/metabase/metabot/agent/streaming.clj` |
| Conversation/message models | `src/metabase/metabot/models/metabot_conversation.clj`, `.../metabot_message.clj` |
| Tool-type metadata source | `src/metabase/metabot/tools/entity_usage.clj`, `src/metabase/metabot/tools.clj` |
| Liquibase migration | `resources/migrations/062/<date>_metabot_quality_score.yaml` |
| Analytics view v4 | `resources/migrations/instance_analytics_views/metabot_conversations/v4/{postgres,mysql,h2}-metabot_conversations.sql` |
| EE conversation-detail response | `enterprise/backend/src/metabase_enterprise/metabot_analytics/conversations.clj` |
