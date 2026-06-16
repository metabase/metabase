(ns metabase.metabot.quality.attribution
  "Per-turn attribution of the conversation-quality analysis back onto each
  assistant turn. The conversation-level breakdown summarizes the whole
  conversation; each turn's `metabot_message.quality_attribution` carries
  which problems landed on *this* turn (observables) plus the subscores as
  of the end of this turn (the prefix score).

  Pure. A turn's observables and its prefix score both come from the same
  per-turn prefix-normalized struct, so they can't disagree about what the
  agent knew by the end of the turn.

  Storage shape per assistant message:

  ```clojure
  {:version       \"...\"
   :observables   [{:observation \"...\" :metric \"...\" :entity {...} :context {...}}
                   ...]
   :quality_score 0.91
   :subscores     {:data_source_quality {:value 0.84 :metrics {...}}
                   :execution_health    {:value 1.0  :metrics {...}}}}
  ```

  Each observable's `:metric` names the metric it is evidence for
  (`grounded_source_share`, `search_efficiency`, `tool_call_failure_rate`,
  `termination_health`, `artifact_validity_share`), so a reviewer can join an
  observable straight onto
  the nested `subscores → metrics` value it explains."
  (:require
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.metrics :as metrics]
   [metabase.metabot.quality.schema :as quality.schema]
   [metabase.metabot.quality.subscores :as subscores]
   [metabase.metabot.quality.temporal :as temporal]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Conversation walkers
;;; ---------------------------------------------------------------------------

(defn- assistant-row? [row] (= :assistant (:role row)))

(defn- assistant-rows
  "Assistant rows in chronological order. `:messages` is sorted by extract."
  [normalized]
  (filter assistant-row? (:messages normalized)))

(defn- last-assistant-msg-id
  "Message id of the last assistant row, or nil if no assistant rows exist."
  [normalized]
  (:id (last (assistant-rows normalized))))

(defn- build-call-id->msg-id
  "Walk assistant rows and build `{call-id → message-id}` from each row's
  `:tool-input` parts. Empty for conversations with no tool calls."
  [normalized]
  (into {}
        (for [row     (assistant-rows normalized)
              part    (:data row)
              :when   (= "tool-input" (:type part))
              :let    [call-id (:id part)]
              :when   call-id]
          [call-id (:id row)])))

;;; ---------------------------------------------------------------------------
;;; Atom-record helpers
;;; ---------------------------------------------------------------------------

(defn- first-provenance-in-set
  "First provenance entry on an atom-record whose `:set` matches
  `set-tag`, sorted by iteration ascending. Returns nil if no such
  entry exists. Used to anchor observables to the turn where the
  referenced touch first happened."
  [atom-rec set-tag]
  (->> (:provenance atom-rec)
       (filter #(= set-tag (:set %)))
       (sort-by (fn [p] (or (:iteration p) Long/MAX_VALUE)))
       first))

(defn- entity-ref-of
  "Project an atom-record down to the `{:type :id}` ref shape stored in
  observables. `:id` keeps its original type (int or string) so the
  shape matches what the LLM authored."
  [atom-rec]
  {:type (:type atom-rec) :id (:id atom-rec)})

;;; ---------------------------------------------------------------------------
;;; Observable constructor
;;; ---------------------------------------------------------------------------

(defn- observable
  "Common observable map. `:metric` is derived from `observation` via the
  registry ([[constants/observable->metric]]), so the metric an observable
  references can't drift from the one it is evidence for. `extras` is merged
  after the discriminating `:observation` + `:metric` keys for the
  observation-specific fields."
  [observation extras]
  (merge {:observation observation
          :metric      (constants/metric-json-name (constants/observable->metric observation))}
         extras))

;;; ---------------------------------------------------------------------------
;;; Observable producers
;;; ---------------------------------------------------------------------------

;; Each producer returns a seq of `[message-id observable-map]` pairs. The
;; public `project` function groups by message-id at the end. Pairs whose
;; `message-id` lookup fails (e.g. an orphan tool-event with no matching
;; tool-input part) are filtered out — attribution requires an anchor row.

(defn- unproductive-search-observables
  "For each search call that rediscovered an earlier call's results, emit
  `unproductive-search` on that call's turn. Reuses the metric's per-call
  determination and back-references the earlier call(s) it overlapped."
  [normalized call-id->msg]
  (for [{:keys [event overlapping]} (metrics/unproductive-search-marks
                                     (metrics/search-events normalized))
        :when   (seq overlapping)
        :let    [msg-id (get call-id->msg (:call-id event))]
        :when   msg-id]
    [msg-id
     (observable
      "unproductive_search"
      {:context {:tool_call         (:call-id event)
                 :overlapping_calls (mapv :call-id overlapping)}})]))

(defn- hallucinated-ref-observables
  "For each entity the agent authored against but never saw surfaced, emit
  `hallucinated-ref` on the turn where it entered the authored set. Such
  entities inherit authored-set provenance by extract's set arithmetic, so
  the lookup is straightforward."
  [normalized call-id->msg]
  (for [atom-rec (vals (get-in normalized [:sets :hallucinated]))
        :let     [authored-prov (first-provenance-in-set atom-rec :authored)
                  msg-id        (when authored-prov
                                  (get call-id->msg (:call-id authored-prov)))]
        :when    msg-id]
    [msg-id
     (observable
      "hallucinated_ref"
      {:entity  (entity-ref-of atom-rec)
       :context {:tool_call (:call-id authored-prov)}})]))

(defn- tool-error-observables
  "For each errored tool-event, emit `tool-error` on the turn where the
  error occurred. Evidence for `tool_call_failure_rate`. Preserves the raw
  `:error` value so reviewers can see what the tool reported back to the
  agent."
  [normalized call-id->msg]
  (for [e       (:tool-events normalized)
        :when   (some? (:error e))
        :let    [msg-id (get call-id->msg (:call-id e))]
        :when   msg-id]
    [msg-id
     (observable
      "tool_error"
      {:context {:tool_call (:call-id e)
                 :function  (:function e)
                 :error     (:error e)}})]))

(defn- invalid-artifact-observables
  "For each authoring call that produced an invalid artifact (`:artifact-valid`
  stamped `false`), emit `invalid-artifact` on that call's turn. Evidence for
  `artifact_validity_share`, distinct from `tool_error` (a tool crash) — here the
  tool ran fine but the artifact the LLM asked it to author was invalid."
  [normalized call-id->msg]
  (for [e       (:tool-events normalized)
        :when   (and (= :authoring (:tool-type e)) (false? (:artifact-valid e)))
        :let    [msg-id (get call-id->msg (:call-id e))]
        :when   msg-id]
    [msg-id
     (observable
      "invalid_artifact"
      {:context {:tool_call (:call-id e)
                 :function  (:function e)}})]))

(defn- termination-observables
  "Emit at most one termination observable on the last assistant turn.
  `:iter_cap` produces `iter_cap`; `:error` and `:aborted` both produce
  `error_termination`. Clean terminations (`:final_response`,
  `:model_signaled_done`) yield no observable — there's nothing to
  attribute. Both kinds are evidence for `termination_health`."
  [normalized last-msg-id]
  (let [state (get-in normalized [:temporal :terminal-state])]
    (cond
      (nil? last-msg-id) []
      (= state :iter_cap)
      [[last-msg-id (observable "iter_cap"
                                {:context {:terminal_state "iter_cap"}})]]
      (= state :error)
      [[last-msg-id (observable "error_termination"
                                {:context {:terminal_state "error"}})]]
      (= state :aborted)
      [[last-msg-id (observable "error_termination"
                                {:context {:terminal_state "aborted"}})]]
      :else [])))

;;; ---------------------------------------------------------------------------
;;; Prefix subscores
;;; ---------------------------------------------------------------------------

(defn- sort-key
  "Match extract's row ordering — `(created_at, id)`. Re-derived here
  rather than imported because the messages list is already sorted by
  the time it reaches us; we only need this for the take-while in
  [[prefix-up-to-row]]."
  [row]
  [(:created_at row) (:id row)])

(defn- prefix-up-to-row
  "Return the chronological prefix of `messages` ending at (and
  including) `row`. `messages` must be in `(created_at, id)` order; the
  prefix is everything whose sort key is ≤ row's."
  [messages row]
  (let [target (sort-key row)]
    (vec (take-while (fn [r] (not (pos? (compare (sort-key r) target))))
                     messages))))

(defn- prefix-observables
  "Observables attributable to the last assistant turn of `prefix`. Producers
  run over the prefix (judging against only what was known by then, matching
  the prefix subscores); the result is narrowed to that turn — earlier turns'
  observables belong to their own prefixes."
  [prefix]
  (let [call-id->msg (build-call-id->msg-id prefix)
        last-msg-id  (last-assistant-msg-id prefix)
        produced     (concat
                      (unproductive-search-observables prefix call-id->msg)
                      (hallucinated-ref-observables    prefix call-id->msg)
                      (tool-error-observables          prefix call-id->msg)
                      (invalid-artifact-observables    prefix call-id->msg)
                      (termination-observables         prefix last-msg-id))]
    (into []
          (comp (filter (fn [[msg-id _]] (= msg-id last-msg-id)))
                (map second))
          produced)))

(defn- prefix-attribution
  "Attribution payload for `assistant-row`. Runs the pipeline once on the
  prefix ending at this row; that one struct feeds both the observables and
  the subscores. Shares `governance` so its lookup is paid once."
  [messages governance assistant-row]
  (let [prefix  (-> (prefix-up-to-row messages assistant-row)
                    extract/normalize
                    temporal/derive)
        metrics (metrics/compute prefix governance)
        subs    (subscores/compose metrics)]
    (merge
     {:version     constants/quality-score-version
      :observables (prefix-observables prefix)}
     (subscores/project-json metrics subs))))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(mu/defn project :- ::quality.schema/attributions
  "Project the per-conversation analysis onto each assistant turn. Returns
  `{message-id → attribution-map}` for assistant rows only; user rows have
  no entry (their `quality_attribution` stays NULL).

  Each attribution map carries the version stamp, the turn's observables, and
  its score (`quality_score` + `subscores`) as of the end of the turn. The
  last assistant row's prefix score matches the conversation-level score by
  construction.

  Pure. Quadratic in the number of assistant turns (each prefix re-extracts)."
  [normalized governance]
  (let [messages (vec (:messages normalized))]
    (into {}
          (for [row  (assistant-rows normalized)
                :let [msg-id (:id row)]]
            [msg-id (prefix-attribution messages governance row)]))))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Pure exercise — empty conversation, no observables, no assistant rows.
  (project {:messages [] :tool-events []
            :sets {:prompt-context {} :discovered {} :authored {}
                   :inspected {} :hallucinated {}}
            :temporal {:terminal-state :final_response}}
           {}))
