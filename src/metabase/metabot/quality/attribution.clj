(ns metabase.metabot.quality.attribution
  "Per-turn attribution projection of the conversation-quality analysis
  back onto each assistant turn. The conversation-level breakdown
  (`metabot_conversation.quality_breakdown`) summarizes the whole
  conversation; each turn's `metabot_message.quality_attribution`
  carries which problems landed on *this* turn (observables) plus the
  composite score *as of the end of this turn* (prefix subscores).

  See `notes/bot-1569/quality-score-impl.md` §G for the contract. Pure
  given the normalized struct, governance map, and `ancestry-of`
  callback — performs no I/O. The conversation-level signals and
  subscores are not parameters: observables are derived directly from
  the normalized struct + governance, and prefix subscores are
  independently computed by re-running the pure pipeline on each
  message prefix.

  Observable kinds emitted, indexed by concern signal:

  | Concern signal          | Observable kind             | Attributed to                                                  |
  |-------------------------|-----------------------------|----------------------------------------------------------------|
  | selection-quality       | `canonical-bypass`          | Turn of the bypass authoring call (back-ref to surfacing turn) |
  | selection-quality       | `personal-collection-pick`  | Turn of the authoring call                                     |
  | grounding               | `hallucinated-ref`          | Turn where the hallucinated ref entered CONV_Q                 |
  | discovery-efficiency    | `unused-surfacing`          | Turn of the discovery call (first if multiple)                 |
  | discovery-efficiency    | `rediscovery`               | Turn of the duplicate search call                              |
  | execution-health        | `tool-error`                | Turn of the errored call                                       |
  | conversational-economy  | `thrash-event`              | Turn of the second-in-pair                                     |
  | termination             | `iter-cap`                  | Last assistant turn                                            |
  | termination             | `error-termination`         | Last assistant turn                                            |

  Storage shape per assistant message:

  ```clojure
  {:version          \"v2.0\"
   :observables      [{:concern_signal \"...\" :kind \"...\" :entity {...} :context {...}}
                      ...]
   :prefix_subscores {:A 0.84 :B nil :C 1.0 :D 0.96 :composite 0.93}}
  ```"
  (:require
   [metabase.metabot.quality.concern-signals :as concern-signals]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.extract :as extract]
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

(def ^:private card-types
  "Card-flavored entity types — collapse to the same `report_card` row in
  governance and share the same facts shape."
  #{"card" "question" "model" "metric"})

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
  "For each Y ∈ CONV_Q that has a canonical substitute X ∈ CONV_D, emit a
  `canonical-bypass` observable on the turn where Y was authored. The
  context carries the surfacing iteration of X plus the canonical entity
  itself so a reviewer can see *which* canonical surface was bypassed."
  [normalized governance ancestry-of call-id->msg]
  (let [d-atoms (vals (get-in normalized [:sets :D]))]
    (for [y       (vals (get-in normalized [:sets :Q]))
          :let    [x (concern-signals/find-substitute y d-atoms governance ancestry-of)]
          :when   x
          :let    [q-prov (first-provenance-in-set y :Q)
                   d-prov (first-provenance-in-set x :D)
                   msg-id (get call-id->msg (:call-id q-prov))]
          :when   msg-id]
      [msg-id
       (observable
        "selection-quality"
        "canonical-bypass"
        {:entity  (entity-ref-of y)
         :context {:canonical-surfacing-turn (:iteration d-prov)
                   :canonical-entity         (entity-ref-of x)
                   :tool-call                (:call-id q-prov)}})])))

(defn- personal-collection-observables
  "For each Y ∈ CONV_Q card-type atom whose governance flags it as
  living in a personal collection, emit `personal-collection-pick` on
  the turn where Y was authored. Cards-only by construction — tables
  have no personal-collection placement."
  [normalized governance call-id->msg]
  (for [y       (vals (get-in normalized [:sets :Q]))
        :when   (contains? card-types (:type y))
        :let    [g (get governance [(:type y) (:id-str y)])]
        :when   (and g (true? (:lives-in-personal? g)))
        :let    [q-prov (first-provenance-in-set y :Q)
                 msg-id (get call-id->msg (:call-id q-prov))]
        :when   msg-id]
    [msg-id
     (observable
      "selection-quality"
      "personal-collection-pick"
      {:entity  (entity-ref-of y)
       :context {:tool-call (:call-id q-prov)}})]))

(defn- hallucinated-ref-observables
  "For each Y ∈ CONV_H (the ambiguous bucket), emit `hallucinated-ref`
  on the turn where Y entered CONV_Q. H atoms inherit Q-provenance by
  extract's set arithmetic, so the lookup is straightforward."
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

(defn- unused-surfacing-observables
  "For each non-field atom in CONV_D that is not also in CONV_Q, emit
  `unused-surfacing` on the turn where the surfacing first happened.
  Mirrors Discovery-efficiency's `non-field-atoms` filter — fields
  enumerated under a parent table aren't real waste."
  [normalized call-id->msg]
  (let [d-atoms (->> (vals (get-in normalized [:sets :D]))
                     (remove (fn [a] (= "field" (:type a)))))
        q-keys  (set (keys (get-in normalized [:sets :Q])))]
    (for [x       d-atoms
          :let    [k [(:type x) (:id-str x)]]
          :when   (not (contains? q-keys k))
          :let    [d-prov (first-provenance-in-set x :D)
                   msg-id (when d-prov (get call-id->msg (:call-id d-prov)))]
          :when   msg-id]
      [msg-id
       (observable
        "discovery-efficiency"
        "unused-surfacing"
        {:entity  (entity-ref-of x)
         :context {:tool-call (:call-id d-prov)}})])))

(defn- rediscovery-observables
  "Cluster search-tool calls by transitive query-similarity (the same
  union-find clustering the rediscovery signal uses). For each cluster
  with more than one member, sort by iteration-index and emit
  `rediscovery` on every non-first member. The context back-references
  the originating call so a reviewer can compare query strings."
  [normalized call-id->msg]
  (let [search-events (->> (:tool-events normalized)
                           (filter #(contains? temporal/search-tools-set (:function %)))
                           vec)
        queries       (mapv (comp temporal/search-query-string :arguments) search-events)
        clusters      (temporal/connected-components queries temporal/similar?)]
    (for [cluster        clusters
          :when          (< 1 (count cluster))
          :let           [sorted-indices (sort-by (fn [i] (or (:iteration-index (nth search-events i))
                                                              Long/MAX_VALUE))
                                                  cluster)
                          originator     (nth search-events (first sorted-indices))]
          dup-idx        (rest sorted-indices)
          :let           [dup    (nth search-events dup-idx)
                          msg-id (get call-id->msg (:call-id dup))]
          :when          msg-id]
      [msg-id
       (observable
        "discovery-efficiency"
        "rediscovery"
        {:context {:tool-call        (:call-id dup)
                   :originating-turn (:iteration-index originator)
                   :originating-call (:call-id originator)}})])))

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

(defn- thrash-event-observables
  "For each adjacent same-function-similar-args pair in the flat
  tool-event stream, emit `thrash-event` on the second-in-pair (the
  visibility moment per §G — the first call wasn't a thrash yet)."
  [normalized call-id->msg]
  (for [[a b]   (partition 2 1 (:tool-events normalized))
        :when   (temporal/thrash-pair? a b)
        :let    [msg-id (get call-id->msg (:call-id b))]
        :when   msg-id]
    [msg-id
     (observable
      "conversational-economy"
      "thrash-event"
      {:context {:tool-call       (:call-id b)
                 :prior-tool-call (:call-id a)
                 :function        (:function b)}})]))

(defn- termination-observables
  "Emit at most one termination observable on the last assistant turn.
  `:iter_cap` produces `iter-cap`; `:error` and `:aborted` both produce
  `error-termination` (per Phase 4's collapse). Clean terminations
  (`:final_response`, `:model_signaled_done`) yield no observable —
  there's nothing to attribute."
  [normalized last-msg-id]
  (let [state (get-in normalized [:temporal :terminal-state])]
    (cond
      (nil? last-msg-id) []
      (= state :iter_cap)
      [[last-msg-id (observable "termination" "iter-cap"
                                {:context {:terminal-state "iter_cap"}})]]
      (= state :error)
      [[last-msg-id (observable "termination" "error-termination"
                                {:context {:terminal-state "error"}})]]
      (= state :aborted)
      [[last-msg-id (observable "termination" "error-termination"
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
  "Run the pure pipeline (extract → temporal → signals → subscores) on
  the message prefix ending at `assistant-row` and return the
  conversation-level subscore vector restricted to that prefix.

  Shares `governance` + `ancestry-of` with the full-conversation
  computation so the L0 enrichment cost is paid once (not per turn).
  The slice tightens CONV_P / CONV_D / CONV_Q / CONV_H to entities
  *known* by the end of the prefix, which is what `prefix_subscores`
  is supposed to reflect."
  [messages governance ancestry-of assistant-row]
  (let [prefix-msgs (prefix-up-to-row messages assistant-row)
        normalized  (-> prefix-msgs
                        extract/normalize
                        temporal/derive)
        signals     (concern-signals/compute normalized governance ancestry-of)
        subs        (subscores/compose normalized signals)]
    (select-keys subs [:A :B :C :D :composite])))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(defn project
  "Project the per-conversation analysis back onto each assistant turn.
  Returns `{message-id → attribution-map}` keyed by assistant message id;
  user rows are absent (their `quality_attribution` stays NULL).

  Each attribution map carries:

  - `:version` — the composite version stamp ([[constants/composite-version]]).
  - `:observables` — vector of `{:concern_signal :kind :entity? :context}`
    maps for the problems attributable to this turn.
  - `:prefix_subscores` — the subscore vector as of the end of this
    turn. The last assistant row's `:prefix_subscores` matches the
    conversation-level subscores by construction.

  Pure — no I/O. Performance is `O(N²)` in the number of assistant
  turns (each per-turn prefix re-extracts from scratch); acceptable
  for typical conversations and revisited if Phase 10 surfaces a
  bottleneck."
  [normalized governance ancestry-of]
  (let [messages       (vec (:messages normalized))
        call-id->msg   (build-call-id->msg-id normalized)
        last-msg-id    (last-assistant-msg-id normalized)
        observable-seq (concat
                        (canonical-bypass-observables   normalized governance ancestry-of call-id->msg)
                        (personal-collection-observables normalized governance call-id->msg)
                        (hallucinated-ref-observables   normalized call-id->msg)
                        (unused-surfacing-observables   normalized call-id->msg)
                        (rediscovery-observables        normalized call-id->msg)
                        (tool-error-observables         normalized call-id->msg)
                        (thrash-event-observables       normalized call-id->msg)
                        (termination-observables        normalized last-msg-id))
        by-msg         (group-by first observable-seq)]
    (into {}
          (for [row   (assistant-rows normalized)
                :let  [msg-id (:id row)]]
            [msg-id {:version          constants/composite-version
                     :observables      (mapv second (get by-msg msg-id []))
                     :prefix_subscores (prefix-subscores messages governance ancestry-of row)}]))))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Pure exercise — empty conversation, no observables, no assistant rows.
  (project {:messages [] :tool-events [] :sets {:P {} :D {} :Q {} :I {} :H {}}
            :temporal {:terminal-state :final_response}}
           {}
           (constantly [])))
