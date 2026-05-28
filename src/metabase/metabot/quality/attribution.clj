(ns metabase.metabot.quality.attribution
  "Per-turn attribution of the conversation-quality analysis back onto each
  assistant turn. The conversation-level breakdown summarizes the whole
  conversation; each turn's `metabot_message.quality_attribution` carries
  which problems landed on *this* turn (observables) plus the subscore
  vector as of the end of this turn (prefix subscores).

  Pure given the normalized struct and governance map. Observables are
  derived directly from the normalized struct and governance; prefix
  subscores re-run the pure pipeline on each message prefix.

  Storage shape per assistant message:

  ```clojure
  {:version          \"...\"
   :observables      [{:concern_signal \"...\" :kind \"...\" :entity {...} :context {...}}
                      ...]
   :prefix_subscores {:data-source-quality 0.84 :execution-health 1.0 :composite 0.91}}
  ```"
  (:require
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.governance :as governance]
   [metabase.metabot.quality.metrics :as metrics]
   [metabase.metabot.quality.subscores :as subscores]
   [metabase.metabot.quality.temporal :as temporal]))

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
  "Common observable map. `extras` is merged after the discriminating
  `:concern_signal` + `:kind` keys for the kind-specific fields."
  [concern-signal kind extras]
  (merge {:concern_signal concern-signal :kind kind} extras))

;;; ---------------------------------------------------------------------------
;;; Observable producers
;;; ---------------------------------------------------------------------------

;; Each producer returns a seq of `[message-id observable-map]` pairs. The
;; public `project` function groups by message-id at the end. Pairs whose
;; `message-id` lookup fails (e.g. an orphan tool-event with no matching
;; tool-input part) are filtered out — attribution requires an anchor row.

(defn- canonical-bypass-observables
  "For each canonical surface the agent saw but neither inspected nor
  authored against, emit `canonical-bypass` on the turn it was first
  surfaced. A surface is bypassed purely because it was shown and then
  ignored — no name or relationship matching."
  [normalized governance call-id->msg]
  (let [used (into (set (keys (get-in normalized [:sets :I])))
                   (keys (get-in normalized [:sets :Q])))]
    (for [[k x]   (get-in normalized [:sets :D])
          :when   (and (governance/canonical? (get governance k))
                       (not (contains? used k)))
          :let    [d-prov (first-provenance-in-set x :D)
                   msg-id (when d-prov (get call-id->msg (:call-id d-prov)))]
          :when   msg-id]
      [msg-id
       (observable
        "canonical-bypass-rate"
        "canonical-bypass"
        {:entity  (entity-ref-of x)
         :context {:tool-call (:call-id d-prov)}})])))

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
      "unproductive-search-rate"
      "unproductive-search"
      {:context {:tool-call         (:call-id event)
                 :overlapping-calls (mapv :call-id overlapping)}})]))

(defn- hallucinated-ref-observables
  "For each entity the agent authored against but never saw surfaced, emit
  `hallucinated-ref` on the turn where it entered the authored set. Such
  entities inherit authored-set provenance by extract's set arithmetic, so
  the lookup is straightforward."
  [normalized call-id->msg]
  (for [y       (vals (get-in normalized [:sets :H]))
        :let    [q-prov (first-provenance-in-set y :Q)
                 msg-id (when q-prov (get call-id->msg (:call-id q-prov)))]
        :when   msg-id]
    [msg-id
     (observable
      "grounding"
      "hallucinated-ref"
      {:entity  (entity-ref-of y)
       :context {:tool-call (:call-id q-prov)}})]))

(defn- tool-error-observables
  "For each errored tool-event, emit `tool-error` on the turn where the
  error occurred. Preserves the raw `:error` value so reviewers can see
  what the tool reported back to the agent."
  [normalized call-id->msg]
  (for [e       (:tool-events normalized)
        :when   (some? (:error e))
        :let    [msg-id (get call-id->msg (:call-id e))]
        :when   msg-id]
    [msg-id
     (observable
      "execution-health"
      "tool-error"
      {:context {:tool-call (:call-id e)
                 :function  (:function e)
                 :error     (:error e)}})]))

(defn- termination-observables
  "Emit at most one termination observable on the last assistant turn.
  `:iter_cap` produces `iter-cap`; `:error` and `:aborted` both produce
  `error-termination`. Clean terminations (`:final_response`,
  `:model_signaled_done`) yield no observable — there's nothing to
  attribute. Both kinds trace to execution health."
  [normalized last-msg-id]
  (let [state (get-in normalized [:temporal :terminal-state])]
    (cond
      (nil? last-msg-id) []
      (= state :iter_cap)
      [[last-msg-id (observable "execution-health" "iter-cap"
                                {:context {:terminal-state "iter_cap"}})]]
      (= state :error)
      [[last-msg-id (observable "execution-health" "error-termination"
                                {:context {:terminal-state "error"}})]]
      (= state :aborted)
      [[last-msg-id (observable "execution-health" "error-termination"
                                {:context {:terminal-state "aborted"}})]]
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

(defn- prefix-subscores
  "Run the pure pipeline on the message prefix ending at `assistant-row`
  and return the subscore vector restricted to that prefix.

  Shares `governance` with the full-conversation computation so its
  lookup cost is paid once. The slice tightens the entity sets to what is
  *known* by the end of the prefix, which is what the prefix subscores are
  meant to reflect."
  [messages governance assistant-row]
  (let [prefix-msgs (prefix-up-to-row messages assistant-row)
        normalized  (-> prefix-msgs
                        extract/normalize
                        temporal/derive)
        metrics     (metrics/compute normalized governance)
        subs        (subscores/compose metrics)]
    (select-keys subs [:data-source-quality :execution-health :composite])))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(defn project
  "Project the per-conversation analysis onto each assistant turn. Returns
  `{message-id → attribution-map}` for assistant rows only; user rows have
  no entry (their `quality_attribution` stays NULL).

  Each attribution map carries the composite version stamp, the
  observables attributable to the turn, and the subscore vector as of the
  end of the turn. The last assistant row's prefix subscores match the
  conversation-level subscores by construction.

  Pure. Cost is quadratic in the number of assistant turns (each prefix
  re-extracts from scratch)."
  [normalized governance]
  (let [messages       (vec (:messages normalized))
        call-id->msg   (build-call-id->msg-id normalized)
        last-msg-id    (last-assistant-msg-id normalized)
        observable-seq (concat
                        (canonical-bypass-observables    normalized governance call-id->msg)
                        (unproductive-search-observables normalized call-id->msg)
                        (hallucinated-ref-observables    normalized call-id->msg)
                        (tool-error-observables          normalized call-id->msg)
                        (termination-observables         normalized last-msg-id))
        by-msg         (group-by first observable-seq)]
    (into {}
          (for [row   (assistant-rows normalized)
                :let  [msg-id (:id row)]]
            [msg-id {:version          constants/composite-version
                     :observables      (mapv second (get by-msg msg-id []))
                     :prefix_subscores (prefix-subscores messages governance row)}]))))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Pure exercise — empty conversation, no observables, no assistant rows.
  (project {:messages [] :tool-events [] :sets {:P {} :D {} :Q {} :I {} :H {}}
            :temporal {:terminal-state :final_response}}
           {}))
