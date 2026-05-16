(ns metabase.metabot.quality.constants
  "Static constants for the BOT-1515 conversation quality composite.

  Single source of truth for the v1 panel's per-signal `k` values, baselines,
  the composite soft-saturation constant, profile iteration caps, and tool-set
  partitions. A re-tune of the composite (e.g. `1.0.0` → `1.0.1`) is one PR:
  bump `composite-version`, tweak the values below, and queue a backfill.

  Cross-reference:
    - signal panel: notes/bot-1515-conversation-score/strategy-v3-signals-ref-v2.md §4.1
    - tool partitions: same doc §1.4
    - baselines: same doc §2.5")

(def composite-version
  "Version string embedded in every `quality_breakdown` JSON payload. Bump when
  any of the values in this namespace change in a way that affects the score.

  1.0.1 — replaced the fixed-baseline `expensive-search-turn` /
  `expensive-tool-turn` pair with the corpus-relative `n-expensive-turn`
  outlier signal. See notes/bot-1515-conversation-score/impl-phase-1-testing-notes.md."
  "1.0.1")

(def saturation-C
  "Composite soft-saturation constant. `concern = raw / (raw + C)`.
  v1.0.0 starting value; expected to retune in 1.0.1 after the first
  distribution check (strategy-v3 §\"Open decisions\")."
  10)

(def turn-broken-available-from
  "Date from which `metabot_message.finished` / `error` are reliable signals.
  Embedded in every breakdown so consumers can distinguish 'zero broken turns
  because the conversation was healthy' from 'zero broken turns because the
  columns were silent at that point in time' (PR 74056 — no backfill)."
  "2026-05-13")

;; ---------------------------------------------------------------------------
;; Per-signal parameters
;; ---------------------------------------------------------------------------

(def signal-params
  "Per-signal `k` and `:kind` (plus `:baseline` for `:excess` signals).

    :event-count → contribution = k × magnitude
    :excess      → contribution = k × max(0, magnitude − baseline)

  Tier-H magnitude (k = 3.0): one event = Tier-H raw concern.
  Tier-M magnitude (k = 2.0): one event = Tier-M raw concern.
  search-ignored (k = 1.5): per-event lower than canonical-ignored.
  Efficiency / per-turn signals carry their own `k` and `:baseline`."
  {:canonical-bypass       {:k 3.0    :kind :event-count}
   :iter-cap-burned        {:k 3.0    :kind :event-count}
   :tool-error-magnitude   {:k 3.0    :kind :event-count}
   :turn-broken            {:k 3.0    :kind :event-count}
   :n-expensive-turn       {:k 3.0    :kind :event-count}

   :canonical-ignored      {:k 2.0    :kind :event-count}
   :author-without-inspect {:k 2.0    :kind :event-count}

   :search-ignored         {:k 1.5    :kind :event-count}

   ;; Pre-aggregated excess: magnitude is Σ per-turn max(0, n_data_retrieval - 5).
   :turn-thrash            {:k 0.3    :kind :event-count}

   ;; Raw metric magnitude: baseline subtraction happens in `signal-contribution`.
   :query-thrash           {:k 1.0    :kind :excess :baseline 2}})

(def signal-keys
  "Ordered vector of signal keys. Used by `quality.compose` to iterate the panel
  deterministically and by the breakdown jsonb to ensure a stable shape across
  conversations (every signal key is always present, even when its magnitude is 0)."
  [:canonical-bypass
   :canonical-ignored
   :search-ignored
   :author-without-inspect
   :iter-cap-burned
   :tool-error-magnitude
   :turn-broken
   :turn-thrash
   :n-expensive-turn
   :query-thrash])

;; ---------------------------------------------------------------------------
;; Per-turn baselines (also embedded in `signal-params` where applied;
;; exposed here as named constants so signal-extraction code reads literally)
;; ---------------------------------------------------------------------------

(def turn-thrash-baseline
  "Data-retrieval calls per assistant turn before excess accrues toward
  `turn-thrash`. Five is a non-pathological upper limit (one of each of search,
  read_resource, list_available_fields, get_field_values,
  list_available_data_sources); the sixth call onward accrues excess."
  5)

(def query-thrash-baseline
  "Authoring calls per (user-turn, query-id) before excess accrues toward
  `query-thrash`. Two matches the 'create + immediate fix is normal corrective
  behavior' intuition; the third authoring is the inflection from 'fix' to
  'thrash'."
  2)

;; ---------------------------------------------------------------------------
;; Corpus-relative outlier threshold (n-expensive-turn) — 1.0.1
;; ---------------------------------------------------------------------------
;;
;; The `n-expensive-turn` signal counts assistant turns whose `total_tokens`
;; exceeds a corpus-relative outlier threshold computed via modified Z-score
;; over a rolling window of recent assistant turns. The constants below
;; calibrate the threshold and the cache that surfaces it to the scorer
;; (`quality.corpus-stats`).

(def outlier-z-threshold
  "Modified-Z cutoff for `n-expensive-turn`. A turn is an outlier iff
  `(total_tokens - median) / (mad-scale × MAD) > outlier-z-threshold`,
  equivalently `total_tokens > median + (outlier-z-threshold / mad-scale) × MAD`.
  3.5 follows the conventional MAD-Z3.5 outlier convention (Iglewicz & Hoaglin)."
  3.5)

(def mad-scale
  "Consistency constant that scales MAD to an estimate of σ for normally
  distributed data: `σ ≈ MAD / 0.6745`. Used so that `outlier-z-threshold`
  expresses the cutoff in units comparable to a standard Z-score."
  0.6745)

(def min-corpus-size
  "Minimum number of qualifying assistant turns (within
  `corpus-window-months`) before `quality.corpus-stats/outlier-threshold`
  returns a usable value. Below this, the signal contributes 0 — keeps a
  fresh deployment quiet until the threshold is meaningful."
  100)

(def corpus-window-months
  "Rolling window (in months) over which the outlier threshold's corpus is
  drawn. Bounds the threshold to recent agent behavior so old-format /
  retired-model traffic ages out naturally."
  6)

(def corpus-stats-ttl-ms
  "TTL (milliseconds) on the in-process cache of the outlier threshold.
  Mirrors `metabase.search.appdb.scoring/view-count-percentiles` (1 hr).
  Tradeoff: one slow request per node per hour on cache miss, against
  responsiveness to corpus drift."
  3600000)

;; ---------------------------------------------------------------------------
;; Per-profile iteration caps (signals-ref §2.5)
;; ---------------------------------------------------------------------------

(def profile-max-iterations
  "Mirrors `metabase.metabot.agent.profiles`. Used by the iter-cap-burned signal
  to compare per-message `iter_count` against the cap the row was allowed.
  A row whose `profile_id` is missing from this map contributes 0 to
  iter-cap-burned (permissive fallback) and the score is still computed."
  {"internal"                  10
   "sql"                       10
   "nlq"                       10
   "embedding_next"            10
   "slackbot"                  10
   "transforms_codegen"        30
   "document-generate-content" 10})

;; ---------------------------------------------------------------------------
;; Tool-set partitions (signals-ref §1.4)
;; ---------------------------------------------------------------------------
;;
;; The string values are exact `:tool-name` strings as registered by tool vars
;; in `metabase.metabot.tools`. They are duplicated here as a static snapshot
;; (v1.0.0) rather than derived from the tool registry: keeping the constants
;; namespace pure avoids loading the full tool tree (and its tool-namespace
;; tree) just to score a conversation, and makes the v1.0.0 panel auditable
;; against this file alone.

(def search-tools
  "Search-family tool names. A turn is 'search-dominant' iff ≥ 50% of its tool
  calls fall in this set."
  #{"search"
    "sql_search"
    "nlq_search"
    "transform_search"})

(def data-retrieval-tools
  "Tool names counted toward `turn-thrash`. Includes every search tool plus
  metadata-inspection tools that drive retrieval-style activity."
  (into search-tools
        ["list_available_data_sources"
         "list_available_fields"
         "get_field_values"
         "read_resource"]))

(def authoring-tools
  "Tool names that author or modify a query. Used for `query_modified` /
  `query_count` per-message stats and for the canonical-bypass / query-thrash
  signals.

  The slackbot variant of `construct_notebook_query` registers under the same
  `:tool-name` as the in-app variant, so a single entry covers both."
  #{"create_sql_query"
    "edit_sql_query"
    "replace_sql_query"
    "construct_notebook_query"
    "write_transform_sql"
    "write_transform_python"
    "document_construct_sql_chart"
    "document_construct_model_chart"})

(def inspect-tools
  "Tool names that count as an 'inspect' for the author-without-inspect signal."
  #{"read_resource"
    "list_available_fields"
    "get_field_values"})

(defn non-search-tool?
  "True iff `tool-name` is not a search-family tool. This is the predicate form
  of the conceptual `NON_SEARCH_TOOLS = (all registered tool names) \\ SEARCH_TOOLS`
  set — we never materialize the complement because the compute paths only ask
  'is this a search tool?' and bucket accordingly."
  [tool-name]
  (not (contains? search-tools tool-name)))
