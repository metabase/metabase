(ns metabase.metabot.quality.core
  "Public surface for the Metabot conversation quality-score pipeline.

  See `notes/bot-1569/quality-score-impl.md` for the full design. This
  namespace owns the I/O wrapper called from
  `metabase.metabot.persistence/finalize-assistant-turn!` and the pure
  pipeline composition (extract → governance → temporal → concern-signals
  → subscores) that produces the per-conversation breakdown.

  Phase 6: real scores land here. The Phase-1 stub is replaced by the
  full pipeline; conversations that lack BOT-1569 layer-0 atoms get a
  `pre-foundation` sentinel, conversations that throw inside extract
  get an `extract-error` sentinel."
  (:require
   [metabase.metabot.quality.concern-signals :as concern-signals]
   [metabase.metabot.quality.constants :as quality.constants]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.governance :as governance]
   [metabase.metabot.quality.subscores :as subscores]
   [metabase.metabot.quality.temporal :as temporal]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Sentinel breakdowns
;;; ---------------------------------------------------------------------------

(defn- sentinel-breakdown
  "JSON-encodable map persisted as `metabot_conversation.quality_breakdown`
  for conversations the pipeline declines to score. `quality_score` stays
  NULL. Reasons in MVP: `pre-foundation`, `extract-error` (documented in
  `notes/bot-1569/quality-score-impl.md` §Sentinel breakdowns).

  Writing a sentinel is what stops the backfill task from re-discovering
  the row tomorrow (discovery is `WHERE quality_breakdown IS NULL`)."
  [reason]
  {:version     quality.constants/composite-version
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
  "A conversation is pre-foundation iff neither layer-0 signal is present
  in the normalized struct — no `:entity-usage` populated by any tool
  call AND no `prompt-context` block on any user row. Either signal's
  presence is enough to run the pipeline."
  [normalized]
  (and (not (has-entity-usage? normalized))
       (not (has-prompt-context? normalized))))

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

(defn- build-breakdown
  "Compose the `quality_breakdown` map per §Storage formats. Keys are
  intentionally a mix of kebab- and snake-case to match the impl plan's
  documented JSON shape."
  [normalized concern-signals subscores]
  {:version           quality.constants/composite-version
   :subscores         {:A         (:A subscores)
                       :B         (:B subscores)
                       :C         (:C subscores)
                       :D         (:D subscores)
                       :composite (:composite subscores)}
   :subscore_na       (mapv name (sort (:na subscores)))
   :concern_signals   concern-signals
   :set_cardinalities {:P (count (get-in normalized [:sets :P]))
                       :D (count (get-in normalized [:sets :D]))
                       :Q (count (get-in normalized [:sets :Q]))
                       :I (count (get-in normalized [:sets :I]))
                       :H (count (get-in normalized [:sets :H]))}
   :termination       (some-> (get-in normalized [:temporal :terminal-state]) name)
   :context           {:iterations (get-in normalized [:temporal :iterations] 0)
                       :tool_calls (count (:tool-events normalized))
                       :errors     (count (filter :error (:tool-events normalized)))}})

;;; ---------------------------------------------------------------------------
;;; Pipeline composition
;;; ---------------------------------------------------------------------------

(defn- run-pipeline
  "Run the pure pipeline — extract has already succeeded by the time we
  get here, and `pre-foundation?` has already returned false. Returns a
  map carrying the conversation-level fields to persist."
  [normalized]
  (let [governance     (governance/resolve (all-entity-refs normalized))
        ancestry-of    (memoize governance/walk-source-card-ancestry)
        normalized'    (temporal/derive normalized)
        signals        (concern-signals/compute normalized' governance ancestry-of)
        subs           (subscores/compose normalized' signals)]
    {:quality_score     (:composite subs)
     :quality_breakdown (build-breakdown normalized' signals subs)}))

(defn compute-conversation-score
  "Pure entry point: given a seq of `MetabotMessage` rows, return the
  values to persist on `metabot_conversation`. Three result shapes:

  - **Pre-foundation** — sentinel breakdown, `quality_score = nil`.
  - **Extract error** — sentinel breakdown, `quality_score = nil`.
  - **Real score** — composite `:quality_score`, full `:quality_breakdown`.

  Phase 7 will extend this to also return `:quality_attribution` per
  assistant message; today the contract is conversation-level only."
  [messages]
  (let [normalized (try (extract/normalize messages)
                        (catch Throwable t
                          (log/error t "extract/normalize threw — writing extract-error sentinel")
                          ::extract-failed))]
    (cond
      (= ::extract-failed normalized)
      {:quality_score     nil
       :quality_breakdown (sentinel-breakdown "extract-error")}

      (pre-foundation? normalized)
      {:quality_score     nil
       :quality_breakdown (sentinel-breakdown "pre-foundation")}

      :else
      (run-pipeline normalized))))

;;; ---------------------------------------------------------------------------
;;; Persistence wrapper
;;; ---------------------------------------------------------------------------

(defn- conversation-messages
  [conversation-id]
  (t2/select :model/MetabotMessage :conversation_id conversation-id))

(defn- write-result!
  [conversation-id result]
  (t2/update! :model/MetabotConversation conversation-id
              {:quality_score     (:quality_score result)
               :quality_breakdown (:quality_breakdown result)}))

(defn score-conversation!
  "Compute and persist the quality score for `conversation-id`.

  Return contract (stable across phases):

    number    — clean composite score in `[0, 1]`
    :sentinel — sentinel breakdown written; `quality_score` stays NULL
    nil       — throw caught by the inner safety guard, no UPDATE fired.

  The inner try/catch is log-only at MVP — Prometheus / Snowplow
  instrumentation is a follow-up task (see §Out of scope in the impl
  plan). Callers in `metabase.metabot.persistence/finalize-assistant-turn!`
  add an outer try/catch as defense in depth."
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
