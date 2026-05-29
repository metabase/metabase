(ns metabase.metabot.quality.core
  "Public surface for the Metabot conversation quality-score pipeline.

  Owns the I/O wrapper called from
  `metabase.metabot.persistence/finalize-assistant-turn!` and the pure
  pipeline composition (extract → governance → temporal → metrics →
  subscores) that produces the per-conversation breakdown.

  Conversations that carry neither prompt context nor any tool
  entity-usage get a `pre-foundation` sentinel; conversations that throw
  inside extract get an `extract-error` sentinel."
  (:require
   [metabase.metabot.quality.attribution :as attribution]
   [metabase.metabot.quality.constants :as quality.constants]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.governance :as governance]
   [metabase.metabot.quality.metrics :as metrics]
   [metabase.metabot.quality.schema :as quality.schema]
   [metabase.metabot.quality.subscores :as subscores]
   [metabase.metabot.quality.temporal :as temporal]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Sentinel breakdowns
;;; ---------------------------------------------------------------------------

(mu/defn- sentinel-breakdown :- ::quality.schema/sentinel-breakdown
  "JSON-encodable map persisted as `metabot_conversation.quality_breakdown`
  for conversations the pipeline declines to score. `quality_score` stays
  NULL. `reason` is one of [[quality.constants/unscoreable-reasons]].

  Writing a sentinel is what stops a backfill from re-discovering the row
  later (discovery is `WHERE quality_breakdown IS NULL`)."
  [reason :- :string]
  {:version     quality.constants/quality-score-version
   :unscoreable reason})

;;; ---------------------------------------------------------------------------
;;; Pre-foundation detection
;;; ---------------------------------------------------------------------------

(defn- has-entity-usage?
  "True iff any tool-event in the normalized stream carries a non-empty
  input or output ref list — i.e. the persisted `:entity-usage` block
  populated either side."
  [normalized]
  (boolean
   (some (fn [e] (or (seq (:input e)) (seq (:output e))))
         (:tool-events normalized))))

(defn- has-prompt-context?
  "True iff any user row contributed prompt-context entries."
  [normalized]
  (boolean (seq (get-in normalized [:prompt-context :P]))))

(defn- pre-foundation?
  "A conversation is pre-foundation iff it shows no sign of having run the
  instrumented agent loop — no `:entity-usage` populated by any tool call,
  no `prompt-context` block on any user row, and no `terminal_state` data
  part on any assistant row."
  [normalized]
  (and (not (has-entity-usage? normalized))
       (not (has-prompt-context? normalized))
       (not (temporal/instrumented? normalized))))

;;; ---------------------------------------------------------------------------
;;; Entity-ref harvesting (for the batched governance lookup)
;;; ---------------------------------------------------------------------------

(defn- all-entity-refs
  "Project every atom across every set down to the `{:type :id}` shape
  governance/resolve expects. Dedup by `[type id]` so a card that lives
  in both P and Q only contributes one ref."
  [normalized]
  (->> (vals (:sets normalized))
       (mapcat vals)
       (map (fn [a] {:type (:type a) :id (:id a)}))
       distinct))

;;; ---------------------------------------------------------------------------
;;; Breakdown shape
;;; ---------------------------------------------------------------------------

(mu/defn- build-breakdown :- ::quality.schema/full-breakdown
  "Build the JSON-encodable `quality_breakdown` map persisted on the
  conversation row. Metric values read `1 = good`; `:na` serializes as
  null. `:subscores` nests each subscore's `:value` and member `:metrics`
  (the shared [[subscores/project-json]] projection); `:diagnostics`
  carries the run-level iteration/tool/termination counts and the
  entity-set sizes."
  [normalized metrics subscores]
  (merge
   {:version quality.constants/quality-score-version}
   ;; `:quality_score` (the composite) + a nested `:subscores` map —
   ;; the same projection the per-message attribution writes.
   (subscores/project-json metrics subscores)
   {:diagnostics
    {:n_iterations  (get-in normalized [:temporal :iterations] 0)
     :n_tool_calls  (count (:tool-events normalized))
     :n_errors      (count (filter :error (:tool-events normalized)))
     :termination   (some-> (get-in normalized [:temporal :terminal-state]) name)
     :entity_counts {:prompt_context (count (get-in normalized [:sets :P]))
                     :discovered     (count (get-in normalized [:sets :D]))
                     :authored       (count (get-in normalized [:sets :Q]))
                     :inspected      (count (get-in normalized [:sets :I]))
                     :hallucinated   (count (get-in normalized [:sets :H]))}}}))

;;; ---------------------------------------------------------------------------
;;; Pipeline composition
;;; ---------------------------------------------------------------------------

(defn- run-pipeline
  "Run the pure pipeline — extract has already succeeded by the time we
  get here, and `pre-foundation?` has already returned false. Returns a
  map carrying the conversation-level fields to persist plus a
  per-assistant-message `:quality_attribution` map keyed by message id."
  [normalized]
  (let [library-cids (governance/library-collection-ids)
        governance  (governance/resolve (all-entity-refs normalized) library-cids)
        normalized' (temporal/derive normalized)
        metrics     (metrics/compute normalized' governance)
        subs        (subscores/compose metrics)
        attribution (attribution/project normalized' governance)]
    {:quality_score       (:composite subs)
     :quality_breakdown   (build-breakdown normalized' metrics subs)
     :quality_attribution attribution}))

(defn compute-conversation-score
  "Pure entry point: given a seq of `MetabotMessage` rows, return the
  values to persist. Three result shapes:

  - **Pre-foundation** — sentinel breakdown, `quality_score = nil`,
    no `:quality_attribution` (assistant rows stay NULL).
  - **Extract error** — sentinel breakdown, `quality_score = nil`,
    no `:quality_attribution`.
  - **Real score** — composite `:quality_score`, full
    `:quality_breakdown`, and `:quality_attribution` keyed by assistant
    message id."
  [messages]
  (let [normalized (try (extract/normalize messages)
                        (catch Throwable t
                          (log/error t "extract/normalize threw — writing extract-error sentinel")
                          ::extract-failed))]
    (cond
      (= ::extract-failed normalized)
      {:quality_score     nil
       :quality_breakdown (sentinel-breakdown (:extract-error quality.constants/unscoreable-reasons))}

      (pre-foundation? normalized)
      {:quality_score     nil
       :quality_breakdown (sentinel-breakdown (:pre-foundation quality.constants/unscoreable-reasons))}

      :else
      (run-pipeline normalized))))

;;; ---------------------------------------------------------------------------
;;; Persistence wrapper
;;; ---------------------------------------------------------------------------

(defn- conversation-messages
  [conversation-id]
  (t2/select :model/MetabotMessage :conversation_id conversation-id))

(defn- write-result!
  "Persist a pipeline result. Always updates the conversation row;
  per-assistant-row attribution is updated separately (and only on the
  real-score path — sentinel paths leave `quality_attribution` NULL).

  One UPDATE per assistant row."
  [conversation-id result]
  (t2/update! :model/MetabotConversation conversation-id
              {:quality_score     (:quality_score result)
               :quality_breakdown (:quality_breakdown result)})
  (doseq [[msg-id payload] (:quality_attribution result)]
    (t2/update! :model/MetabotMessage msg-id
                {:quality_attribution payload})))

(defn score-conversation!
  "Compute and persist the quality score for `conversation-id`.

  Return contract:

    number    — clean composite score in `[0, 1]`
    :sentinel — sentinel breakdown written; `quality_score` stays NULL
    nil       — throw caught by the inner safety guard, no UPDATE fired.

  The inner try/catch is log-only.
  Callers in `metabase.metabot.persistence/finalize-assistant-turn!` add
  an outer try/catch as defense in depth."
  [conversation-id]
  (try
    (let [messages (conversation-messages conversation-id)
          result   (compute-conversation-score messages)]
      (write-result! conversation-id result)
      (if (some? (:quality_score result))
        (:quality_score result)
        :sentinel))
    (catch Throwable t
      (log/error t "score-conversation! threw"
                 {:conversation-id conversation-id})
      nil)))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Run the pipeline against a real conversation in the dev appdb.
  ;; Substitute a conversation_id from the appdb:
  (score-conversation! "52e03ece-cc94-4c6e-9d3e-3d85dd4c2c8e")

  ;; Inspect the breakdown shape without writing:
  (-> (conversation-messages "52e03ece-cc94-4c6e-9d3e-3d85dd4c2c8e")
      compute-conversation-score
      :quality_breakdown))
