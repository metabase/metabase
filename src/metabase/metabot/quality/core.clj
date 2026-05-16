(ns metabase.metabot.quality.core
  "Public API for the BOT-1515 conversation quality score.

  Two entry points:

    `compute-conversation-score` — pure compute. Given a chronological seq of
    `MetabotMessage` maps for one conversation, returns
    `{:quality_score ... :quality_breakdown ...}`. Returns the pair of nils
    when the conversation is out of scope (any assistant row is old-format).

    `score-conversation!` — I/O wrapper. Reads the conversation's messages
    from the appdb, runs `compute-conversation-score`, and persists the
    result back onto `metabot_conversation`. Catches and logs any throw so a
    scoring failure cannot break the user-visible persistence path.

  Cross-reference:
    - signal panel: notes/bot-1515-conversation-score/strategy-v3-signals-ref-v2.md
    - design: notes/bot-1515-conversation-score/impl-phase-1-conversation-composites.md §3, §4, §5"
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.metabot.quality.compose :as compose]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.corpus-stats :as corpus-stats]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.governance :as governance]
   [metabase.metabot.quality.signals :as signals]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def composite-version
  "Re-exported from `quality.constants` so callers don't reach into the
  constants namespace just for the version string. A bump here (equivalently:
  there) signals a retune of any of the values in `quality.constants` and
  downstream consumers that scores should be recomputed."
  constants/composite-version)

;; ---------------------------------------------------------------------------
;; Format-era guard
;; ---------------------------------------------------------------------------

(defn new-format-message?
  "True if `msg` is either (a) not an assistant row (user rows are uniform
  across format eras), (b) an assistant row with no parts (placeholder /
  errored turn — nothing to scope-guard against), or (c) an assistant row
  whose every part carries a `:type` discriminator.

  Old-format assistant rows are historical and rare; they lack the per-part
  `:type` field and disqualify the whole conversation from scoring per
  signals-ref §1.3."
  [msg]
  (or (not= :assistant (:role msg))
      (empty? (:data msg))
      (every? :type (:data msg))))

;; ---------------------------------------------------------------------------
;; Per-message sanitization
;; ---------------------------------------------------------------------------

(defn- safe-message
  "Pre-sanitize a message before normalization. Coerces `:data` to a vector if
  it isn't already, so per-message walks downstream (`pair-tool-calls`,
  `iter-count`) never crash on an unexpected shape. Per impl-plan §5.4 — a
  single malformed row should degrade to 'no parts contributed' rather than
  failing the whole conversation score."
  [msg]
  (cond-> msg
    (not (sequential? (:data msg))) (assoc :data [])))

;; ---------------------------------------------------------------------------
;; Compute (pure)
;; ---------------------------------------------------------------------------

(defn- collect-signal-magnitudes
  "Run all ten signal predicates against a normalized conversation,
  returning a `{signal-key → magnitude}` map suitable for
  `compose/compose-score`. The canonical-rank map is consulted only by the
  four retrieval-discipline signals; `outlier-threshold` is consulted only by
  `n-expensive-turn`; the others ignore both."
  [normalized canonical-map outlier-threshold]
  {:canonical-bypass       (signals/canonical-bypass-magnitude       normalized canonical-map)
   :canonical-ignored      (signals/canonical-ignored-magnitude      normalized canonical-map)
   :search-ignored         (signals/search-ignored-magnitude         normalized canonical-map)
   :author-without-inspect (signals/author-without-inspect-magnitude normalized canonical-map)
   :iter-cap-burned        (signals/iter-cap-burned-magnitude        normalized)
   :tool-error-magnitude   (signals/tool-error-magnitude             normalized)
   :turn-broken            (signals/turn-broken-magnitude            normalized)
   :turn-thrash            (signals/turn-thrash-magnitude            normalized)
   :n-expensive-turn       (signals/n-expensive-turn-magnitude       normalized outlier-threshold)
   :query-thrash           (signals/query-thrash-magnitude           normalized)})

(defn- had-artifact?
  "True iff any assistant row in `messages` has `query_count > 0`. Relies on
  `query_count` having been UPDATEd by `finalize-assistant-turn!` on the
  just-finalized assistant row before `score-conversation!` reads — which
  holds because both writes share a transaction (§3.3)."
  [messages]
  (boolean
   (some (fn [m]
           (and (= :assistant (:role m))
                (pos? (or (:query_count m) 0))))
         messages)))

(defn compute-conversation-score
  "Pure compute. Input: a seq of `MetabotMessage` maps for one conversation,
  in chronological order (extract.clj re-sorts defensively). Output:

    {:quality_score    <double in (-1, 0] or nil>
     :quality_breakdown <map ready to JSON-encode, or nil>}

  Returns the pair of nils when any assistant row is old-format (signals-ref
  §1.3). This is distinct from 'scored, no signal fired' — that path produces
  `:quality_score 0.0` with a populated breakdown.

  Calls `corpus-stats/outlier-threshold` once per invocation to fetch (or
  reuse the cached) corpus-relative outlier threshold for `n-expensive-turn`.
  Tests inject a deterministic value via `with-redefs`. The function is the
  entry point a future backfill job will call against historical rows; no
  other database access happens here beyond the cached threshold lookup."
  [messages]
  (let [safe-messages  (mapv safe-message messages)
        assistant-rows (filter #(= :assistant (:role %)) safe-messages)]
    (if (some (complement new-format-message?) assistant-rows)
      {:quality_score nil :quality_breakdown nil}
      (let [normalized    (extract/normalize safe-messages)
            er            (:entity-refs normalized)
            canonical-map (governance/resolve-canonical-rank
                           (concat (:search-hits er) (:author-refs er)))
            threshold-info (corpus-stats/outlier-threshold)
            outlier-threshold (:threshold threshold-info)
            magnitudes    (collect-signal-magnitudes normalized canonical-map outlier-threshold)
            composed      (compose/compose-score magnitudes)
            breakdown     {:composite_version          composite-version
                           :computed_at                (str (Instant/now))
                           :turn_broken_available_from constants/turn-broken-available-from
                           :raw                        (:raw composed)
                           :concern                    (:concern composed)
                           :signals                    magnitudes
                           :contributions              (:contributions composed)
                           :context                    {:profile_id                       (:profile-id normalized)
                                                        :had_artifact                     (had-artifact? safe-messages)
                                                        :n_messages                       (count safe-messages)
                                                        :n_tool_calls                     (count (:tool-events normalized))
                                                        :outlier_threshold                outlier-threshold
                                                        :outlier_threshold_corpus_size    (:corpus-size threshold-info)}}]
        {:quality_score     (:quality_score composed)
         :quality_breakdown breakdown}))))

;; ---------------------------------------------------------------------------
;; Persist (I/O)
;; ---------------------------------------------------------------------------

(defn- conversation-messages
  "Read non-deleted messages for `conversation-id`, ordered by `(:created_at,
  :id)` per PR 74056's tiebreak convention — the placeholder assistant row
  pinned at turn start shares `:created_at` with the paired user row, so a
  pure-`created_at` sort is non-deterministic."
  [conversation-id]
  (t2/select :model/MetabotMessage
             {:where    [:and
                         [:= :conversation_id conversation-id]
                         [:= :deleted_at nil]]
              :order-by [[:created_at :asc] [:id :asc]]}))

(defn score-conversation!
  "Compute and persist the v1 conversation quality score.

  Reads non-deleted messages for `conversation-id`, runs
  `compute-conversation-score`, and UPDATEs `:quality_score` /
  `:quality_breakdown` on `metabot_conversation`.

  Belt-and-suspenders: any throw inside is caught, logged at `warn`, and
  counted on `:metabase-metabot/quality-score-errors`. A scoring failure must
  never roll back the assistant-row UPDATE that the user-visible response
  depends on (impl plan §5.4, §9.1).

  Idempotent: safe to call repeatedly. Each call overwrites the existing
  `quality_score` / `quality_breakdown` based on the current message state,
  so subsequent turns of a conversation cleanly replace earlier turns'
  scores."
  [conversation-id]
  (try
    (let [messages (conversation-messages conversation-id)
          {:keys [quality_score quality_breakdown]}
          (compute-conversation-score messages)]
      (t2/update! :model/MetabotConversation conversation-id
                  {:quality_score     quality_score
                   :quality_breakdown quality_breakdown}))
    (catch Throwable t
      (analytics/inc! :metabase-metabot/quality-score-errors)
      (log/warnf t "Failed to score metabot conversation %s" conversation-id)
      nil)))

;; ---------------------------------------------------------------------------
;; REPL dev helpers — strip before final submission
;; ---------------------------------------------------------------------------

(comment
  ;; Requires for ad-hoc evaluation from any ns. If you `(in-ns
  ;; 'metabase.metabot.quality.core)` first the aliases below collapse to
  ;; bare symbols.
  (require '[metabase.metabot.quality.core :as quality]
           '[metabase.metabot.quality.compose :as compose]
           '[metabase.metabot.quality.extract :as extract]
           '[metabase.metabot.quality.governance :as governance]
           '[metabase.metabot.quality.signals :as signals]
           '[toucan2.core :as t2])

  ;; ---- Pick a conversation to inspect -------------------------------------

  ;; Find a recent conversation to play with — surfaces id, created_at, and
  ;; whether the score has been computed yet.
  (t2/select [:model/MetabotConversation :id :created_at :quality_score]
             {:order-by [[:created_at :desc]]
              :limit    10})

  (def conv-id "e8cceb65-05a2-4685-947d-d392be8d1a2b")

  ;; ---- Pure compute (no DB write) -----------------------------------------

  ;; Most useful path: read the rows yourself, run the pure function, inspect
  ;; the return value. This is the same entry point a future backfill job
  ;; will call, so the shape here previews the persisted shape exactly.
  (def messages
    (t2/select :model/MetabotMessage
               {:where    [:and
                           [:= :conversation_id conv-id]
                           [:= :deleted_at nil]]
                :order-by [[:created_at :asc] [:id :asc]]}))

  (def result (quality/compute-conversation-score messages))

  ;; Full return shape:
  (:quality_score     result)  ; double in (-1, 0], or nil for old-format
  (:quality_breakdown result)  ; full breakdown map, or nil for old-format

  ;; Drill into the breakdown:
  (get-in result [:quality_breakdown :raw])           ; pre-saturation concern sum
  (get-in result [:quality_breakdown :concern])       ; raw / (raw + C)  ∈ [0, 1)
  (get-in result [:quality_breakdown :signals])       ; raw magnitudes per signal
  (get-in result [:quality_breakdown :contributions]) ; k × m per signal (sums to :raw)
  (get-in result [:quality_breakdown :context])       ; profile_id, had_artifact, n_messages, n_tool_calls

  ;; ---- With persistence (writes the row) ----------------------------------

  ;; Same compute, but the I/O wrapper: catches throws, increments the
  ;; Prometheus counter on failure, and UPDATEs metabot_conversation.
  ;; Idempotent — safe to call repeatedly.
  (quality/score-conversation! conv-id)

  ;; Confirm what landed:
  (t2/select-one [:model/MetabotConversation :quality_score :quality_breakdown]
                 :id conv-id)

  ;; ---- Intermediate inspection (debug why a score came out that way) ------

  ;; If a score surprises you, peek between extract → governance → signals
  ;; to see which step diverges from your mental model.
  (def normalized (extract/normalize messages))

  (:profile-id        normalized)       ; modal profile across rows
  (:user-turn-windows normalized)       ; [{:user-msg-id ... :start [ts id] :end [ts id]} ...]
  (count (:tool-events normalized))     ; total tool-call count
  (:entity-refs       normalized)       ; {:search-hits :author-refs :inspect-refs :navigate-refs}

  ;; Resolve canonical-rank for the entities the agent actually touched —
  ;; this is what the four retrieval-discipline signals consult.
  (def gov
    (governance/resolve-canonical-rank
     (concat (-> normalized :entity-refs :search-hits)
             (-> normalized :entity-refs :author-refs))))

  ;; Run each signal individually. Magnitudes match the :signals map above,
  ;; so this is the right place to bisect a disagreement.
  (signals/canonical-bypass-magnitude       normalized gov)
  (signals/canonical-ignored-magnitude      normalized gov)
  (signals/search-ignored-magnitude         normalized gov)
  (signals/author-without-inspect-magnitude normalized gov)
  (signals/iter-cap-burned-magnitude        normalized)
  (signals/tool-error-magnitude             normalized)
  (signals/turn-broken-magnitude            normalized)
  (signals/turn-thrash-magnitude            normalized)
  (signals/n-expensive-turn-magnitude       normalized 251020)  ; corpus threshold from corpus-stats
  (signals/query-thrash-magnitude           normalized)

  ;; Recompose by hand if you want to verify the math:
  (compose/compose-score
   {:canonical-bypass       0  :canonical-ignored      0
    :search-ignored         0  :author-without-inspect 0
    :iter-cap-burned        0  :tool-error-magnitude   1   ; e.g. one tool error
    :turn-broken            0  :turn-thrash            0
    :n-expensive-turn       0  :query-thrash           0})
  ;; => {:quality_score -0.231 :concern 0.231 :raw 3.0 :contributions {...}}

  ;; ---- Gotchas ------------------------------------------------------------

  ;; - Old-format conversations return {:quality_score nil :quality_breakdown nil}
  ;;   from compute-conversation-score. That's the format-era guard from §4.2,
  ;;   not a bug. Distinct from "scored, nothing fired" → 0.0 with a breakdown.
  ;; - Zero-signal conversations display as -0.0 (because compose does
  ;;   `(- concern)` and concern = 0.0). Functionally equivalent to 0.0.
  ;; - score-conversation! is idempotent — two back-to-back calls produce
  ;;   bit-identical results modulo :computed_at.
  )
