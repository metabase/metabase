(ns metabase.metabot.quality.extract
  "Layer 1 of the conversation-quality pipeline. Pure: given the
  `MetabotMessage` rows for a conversation, produces the normalized struct
  every later layer (governance / temporal / metrics / subscores /
  attribution) consumes.

  See `notes/bot-1569/quality-score-impl.md` §B for the contract. The
  high-level shape returned by [[normalize]]:

  ```clojure
  {:conversation-id Long
   :profile-id      String
   :user-id         Long
   :messages        [<row>...]
   :tool-events     [{:call-id :function :tool-type :arguments
                      :iteration-index :input :output :error :duration-ms} ...]
   :prompt-context  {:P [<entity-ref>...]}
   :sets            {:P {[type id-str] <atom>} :D ... :Q ... :I ... :H ...}}
  ```

  Two conventions to keep in mind when reading this namespace:

  - **JSON round-trip.** Message rows come back through
    `mi/transform-json`, so map *keys* are keyworded but string *values*
    stay strings. A persisted `{:type :tool-input}` reads back as
    `{:type \"tool-input\"}`; an entity-usage entry's `:type` is the
    literal string `\"table\"` (etc.) per `entity-usage/entity-types`.

  - **Iteration index is monotonic across the whole conversation.** The
    impl plan describes the boundary signal in terms of a single
    assistant row's `:data` (a `:tool-input` after a streak of
    `:tool-output`s = the LLM was called again). The natural extension
    across rows is: the first part of each new assistant row is also a
    new LLM call. The total-iterations derivation in §D
    (`(inc (max iteration-index))`) only makes sense under that monotonic
    reading."
  (:require
   [clojure.set :as set]
   [metabase.metabot.tools]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Tool-type lookup
;;; ---------------------------------------------------------------------------

(defn- collect-tool-type-map
  "Walk the public vars of `metabase.metabot.tools` and build a static
  `{tool-name → tool-type}` map. Multiple vars can register under the
  same `:tool-name` (e.g. the four `search` variants, the two
  `construct_notebook_query` variants) — they share a tool-type by
  construction. If a discrepancy ever appears, log it once and keep the
  first declaration so the lookup stays deterministic."
  []
  (reduce
   (fn [acc v]
     (let [{tool-name :tool-name tool-type :tool-type} (meta v)]
       (if (and tool-name tool-type)
         (if-let [existing (get acc tool-name)]
           (if (= existing tool-type)
             acc
             (do (log/warnf "Tool %s has inconsistent :tool-type declarations (%s vs %s); keeping %s"
                            tool-name existing tool-type existing)
                 acc))
           (assoc acc tool-name tool-type))
         acc)))
   {}
   (vals (ns-publics 'metabase.metabot.tools))))

(def ^:private tool-type-map
  "Static `{tool-name → tool-type}` map built at namespace load. Stable
  across the JVM's lifetime — tool registration is itself static."
  (delay (collect-tool-type-map)))

(defn tool-type-for
  "Return the declared `:tool-type` keyword for `tool-name`, or `nil` when
  no registered tool advertises that name. `nil` callers should treat
  the tool as `:utility` for set-construction purposes (i.e. ignore its
  inputs/outputs), since `:utility` is the only tool-type that legally
  carries no `:entity-usage`."
  [tool-name]
  (get @tool-type-map tool-name))

;;; ---------------------------------------------------------------------------
;;; Entity references
;;; ---------------------------------------------------------------------------

(defn entity-key
  "Stable dedup key `[type id-str]` for an entity-ref. Coerces `:id` to its
  string form so `{:id 1}` and `{:id \"1\"}` dedup to the same atom — some
  inspection tools record string ids for aggregation aliases. Card-family
  subtypes fold to `\"card\"` so the same `report_card` row surfaced under
  one subtype and authored against under another dedup to one atom; the
  atom keeps its first-seen `:type` for display."
  [{:keys [type id]}]
  [(entity-usage/canonical-type type) (str id)])

(defn- entity-ref?
  "True for an entity-usage entry whose `:type` is in the closed
  `entity-types` enum and whose `:id` is non-nil."
  [{:keys [type id]}]
  (and (some? id)
       (string? type)
       (contains? entity-usage/entity-types type)))

(defn- atom-record
  "Initial atom-record shell for an entity. Provenance starts empty and is
  populated by [[merge-provenance]]; `:t-first-seen`/`:t-first-used` and
  `:governance` are populated by downstream layers."
  [{:keys [type id]}]
  {:type         type
   :id           id
   :id-str       (str id)
   :provenance   []
   :t-first-seen nil
   :t-first-used nil
   :governance   nil})

(defn- merge-provenance
  "Add a provenance entry to an atom-record. `:t-first-seen` is updated to
  the minimum iteration across all entries so the field stays correct
  even when provenance arrives out of order."
  [atom-rec entry]
  (let [iter (:iteration entry)]
    (-> atom-rec
        (update :provenance conj entry)
        (assoc :t-first-seen
               (let [prev (:t-first-seen atom-rec)]
                 (cond
                   (nil? prev) iter
                   (nil? iter) prev
                   :else       (min prev iter)))))))

(defn- conj-entity
  "Insert an entity-ref into a set-keyed map, attaching the supplied
  provenance entry. Creates the atom-record on first insert; merges
  provenance on subsequent inserts of the same `[type id-str]`."
  [set-map ref provenance-entry]
  (let [k (entity-key ref)]
    (update set-map k
            (fn [existing]
              (-> (or existing (atom-record ref))
                  (merge-provenance provenance-entry))))))

;;; ---------------------------------------------------------------------------
;;; Iteration index
;;; ---------------------------------------------------------------------------

(defn- llm-emitted?
  "Parts emitted by the LLM that *start* an iteration. `:text` and
  `:tool-input` are the only AISDK part types produced by the LLM call
  itself; everything else (tool-output, data, terminal-state, state) is
  agent-loop machinery that appears within an iteration but never opens
  a new one."
  [part]
  (#{"text" "tool-input"} (:type part)))

(defn- after-output?
  "Parts whose appearance after an LLM emission marks that the agent loop
  has executed tools and is about to call the LLM again. Combined with
  [[llm-emitted?]] this gives the impl plan's boundary signal: a
  `:tool-input` (or `:text`) following a `:tool-output` opens a new
  iteration."
  [part]
  (#{"tool-output" "data"} (:type part)))

(defn- iter-stepper
  "Reducer state for iteration-index assignment. `:phase` tracks whether
  we last saw an LLM emission (`:input`) or agent machinery (`:output`);
  transitions from `:output` → `:input` advance the iteration counter."
  [{:keys [iter phase parts]} part]
  (let [phase' (cond
                 (llm-emitted? part)  :input
                 (after-output? part) :output
                 :else                phase)
        iter'  (if (and (= phase' :input) (= phase :output))
                 (inc iter)
                 iter)]
    {:iter  iter'
     :phase phase'
     :parts (conj parts (assoc part ::iteration iter'))}))

(defn- annotate-iterations
  "Walk a flat parts sequence in order, annotating each with `::iteration`
  (the iteration-index assigned per the convention in the ns docstring).
  Returns `{:parts [<annotated>...] :next-iter Long :phase Keyword}` so
  multi-row callers can thread state across assistant rows."
  [parts {:keys [start-iter start-phase] :or {start-iter 0 start-phase :input}}]
  (-> (reduce iter-stepper
              {:iter start-iter :phase start-phase :parts []}
              parts)
      (set/rename-keys {:iter :next-iter})))

;;; ---------------------------------------------------------------------------
;;; Tool-event extraction
;;; ---------------------------------------------------------------------------

(defn- structured-output
  "Pull the trimmed `:structured-output` map off a persisted `:tool-output`
  part. Tolerates both kebab and snake-case spellings — the persistence
  trim preserves whichever shape the tool emitted."
  [tool-output-part]
  (or (get-in tool-output-part [:result :structured-output])
      (get-in tool-output-part [:result :structured_output])))

(defn- entity-usage-of
  "Pull the `:entity-usage` block off a tool-output part's structured
  output. Returns `{:input [...] :output [...]}` (possibly empty) or
  `nil` if the tool was `:utility` (which forbids the field)."
  [tool-output-part]
  (:entity-usage (structured-output tool-output-part)))

(defn- pair-events
  "Pair `:tool-input` parts with their matching `:tool-output` parts by
  `:id`. Inputs without a matching output (in-flight or crashed turn)
  yield an event with `:output nil :error nil`. Outputs without a
  matching input (rare; would indicate a corruption) are dropped with a
  warn log."
  [annotated-parts]
  (let [outputs-by-id (->> annotated-parts
                           (filter #(= "tool-output" (:type %)))
                           (group-by :id))
        inputs        (->> annotated-parts
                           (filter #(= "tool-input" (:type %))))]
    (doseq [[id outs] outputs-by-id
            :when (> (count outs) 1)]
      (log/warnf "tool-output id %s appears %d times; using the last one" id (count outs)))
    (let [unmatched (set/difference
                     (set (keys outputs-by-id))
                     (set (map :id inputs)))]
      (doseq [id unmatched]
        (log/warnf "tool-output id %s has no matching tool-input; dropping" id)))
    (mapv (fn [{:keys [id function arguments] :as input-part}]
            (let [output-part (last (get outputs-by-id id))
                  eu          (when output-part (entity-usage-of output-part))]
              {:call-id         id
               :function        function
               :tool-type       (tool-type-for function)
               :arguments       (or arguments {})
               :iteration-index (::iteration input-part)
               :input           (vec (filter entity-ref? (:input eu)))
               :output          (vec (filter entity-ref? (:output eu)))
               :error           (:error output-part)
               :duration-ms     (:duration-ms output-part)}))
          inputs)))

;;; ---------------------------------------------------------------------------
;;; Message walking
;;; ---------------------------------------------------------------------------

(defn- sort-messages
  "Order messages by `(created_at, id)` so the conversation reads in
  causal order even when `created_at` ties (the placeholder assistant
  row and its user message share a created_at by design — see
  `persistence/start-turn!`)."
  [messages]
  (sort-by (juxt :created_at :id) messages))

(defn- assistant-row? [row] (= :assistant (:role row)))
(defn- user-row?      [row] (= :user      (:role row)))

(defn- assistant-data
  "Persisted `:data` for an assistant row, defaulting to an empty vector
  so downstream callers don't have to nil-check."
  [row]
  (or (:data row) []))

(defn- annotate-conversation
  "Walk assistant rows in order, threading iteration state through each
  one's `:data`. Returns `[{row :annotated-parts :first-iter} ...]`.
  `:first-iter` is the iteration assigned to the first LLM-emitted part
  of that row — what CONV_P entities from the *preceding* user row
  should claim as their iteration-index.

  Cross-row boundary: every new assistant row is itself a new LLM call,
  so the second row onward starts with `:start-phase :output`. That way
  the row's first `:text` or `:tool-input` triggers an iter++ via the
  same rule the in-row boundary uses, regardless of whether the
  previous row ended on text or tool-output."
  [messages]
  (let [assistants (filter assistant-row? messages)]
    (loop [[row & rest-rows] assistants
           ;; Boxed Long so recur with the Object value out of
           ;; `annotate-iterations` doesn't trigger an auto-box warning.
           start-iter        (Long/valueOf 0)
           start-phase       :input
           acc               []]
      (if (nil? row)
        acc
        (let [{annotated :parts
               next-iter :next-iter} (annotate-iterations
                                      (assistant-data row)
                                      {:start-iter  start-iter
                                       :start-phase start-phase})
              first-llm-part         (first (filter llm-emitted? annotated))
              first-iter             (or (::iteration first-llm-part) start-iter)]
          (recur rest-rows
                 next-iter
                 :output
                 (conj acc {:row             row
                            :annotated-parts annotated
                            :first-iter      first-iter})))))))

;;; ---------------------------------------------------------------------------
;;; Prompt-context union
;;; ---------------------------------------------------------------------------

(defn- prompt-context-block
  "Locate the `{:type \"prompt-context\" ...}` block on a persisted user
  row's `:data`. Per the BOT-1569 contract it lives at `data[1]`, but
  scan the whole vector so we degrade gracefully if a future shape
  change moves it."
  [user-row]
  (some (fn [block]
          (when (and (map? block) (= "prompt-context" (:type block)))
            block))
        (:data user-row)))

(defn- normalize-ref
  "Project a user-row prompt-context entry down to the `{:type :id}`
  shape every other layer expects. Returns `nil` for entries that don't
  resolve to a known entity type."
  [{:keys [type id]}]
  (when (and (some? id) (some? type))
    (let [t (cond
              (keyword? type) (name type)
              (string? type)  type
              :else           (str type))]
      (when (contains? entity-usage/entity-types t)
        {:type t :id id}))))

(defn- channel-entries
  "Project + filter one prompt-context sub-channel's entries to the
  canonical entity-ref shape."
  [block channel-key]
  (->> (get block channel-key [])
       (keep normalize-ref)))

(defn- build-prompt-context
  "Union the three sub-channels across all user rows in the conversation
  into a single `:P` list. Each entry carries `::channel` and
  `::iteration` (the *following* assistant row's first iteration — the
  LLM saw the prompt-context at the start of that row's first LLM
  call); both are stripped from the public `:prompt-context` projection
  but the set-construction reducer reads them when populating CONV_P."
  [user-rows->next-iter]
  (vec
   (for [[user-row next-iter] user-rows->next-iter
         :let                  [block (prompt-context-block user-row)]
         :when                 block
         [channel-key sub]     [[:user_is_viewing      :user_is_viewing]
                                [:user_recently_viewed :user_recently_viewed]
                                [:mentioned_refs       :mentioned_refs]]
         entry                 (channel-entries block channel-key)]
     (assoc entry ::channel sub ::iteration next-iter))))

(defn- pair-user-rows-with-next-iter
  "Walk the (chronologically-sorted) message list and pair each user row
  with the `:first-iter` of the assistant row that follows it. Rows
  without a subsequent assistant turn (in-flight last turn) get `nil`."
  [messages assistant-rows]
  (let [next-iter-for-row-id
        (reduce (fn [acc {row :row first-iter :first-iter}]
                  (assoc acc (:id row) first-iter))
                {}
                assistant-rows)
        ordered                (sort-messages messages)]
    (loop [[row & rest-rows] ordered
           pairs              []]
      (cond
        (nil? row)      pairs
        (user-row? row) (let [next-asst (first (filter assistant-row? rest-rows))
                              next-iter (when next-asst
                                          (get next-iter-for-row-id (:id next-asst)))]
                          (recur rest-rows (conj pairs [row next-iter])))
        :else           (recur rest-rows pairs)))))

;;; ---------------------------------------------------------------------------
;;; Set construction
;;; ---------------------------------------------------------------------------

(defn- entity-usage-meta
  "Lift the per-tool `:metadata` map off an entity-usage entry, defaulting
  to `{}` so downstream consumers always see a map."
  [entry]
  (or (:metadata entry) {}))

(defn- accumulate-tool-events
  "Reduce over tool-events, inserting their entity refs into the
  appropriate sets. Returns `{:D <map> :Q <map> :I <map>}`. `:hybrid`
  inputs go into `:I` (the agent fetching details about a known entity);
  `:hybrid` outputs go into `:D` (the listing is a discovery surface).
  `:authoring` outputs are empty by construction (`entity-usage`
  guarantees this for the authoring tool-type)."
  [tool-events]
  (reduce
   (fn [sets {:keys [call-id tool-type iteration-index input output]}]
     (let [base    {:call-id call-id :iteration iteration-index}
           push    (fn [set-key entries set-tag]
                     (reduce (fn [s entry]
                               (conj-entity s entry
                                            (-> base
                                                (assoc :set set-tag
                                                       :metadata (entity-usage-meta entry)))))
                             (get sets set-key)
                             entries))]
       (cond-> sets
         (#{:discovery :hybrid} tool-type)
         (assoc :D (push :D output :D))

         (= :authoring tool-type)
         (assoc :Q (push :Q
                         (remove #(= "database" (:type %)) input)
                         :Q))

         (#{:inspection :hybrid} tool-type)
         (assoc :I (push :I input :I)))))
   {:D {} :Q {} :I {}}
   tool-events))

(defn- accumulate-prompt-context
  "Reduce CONV_P union entries into the `:P` set, with provenance entries
  capturing which sub-channel sourced each ref."
  [prompt-context-entries]
  (reduce
   (fn [p {::keys [channel iteration] :as entry}]
     (conj-entity p
                  (dissoc entry ::channel ::iteration)
                  {:set       :P
                   :call-id   nil
                   :iteration iteration
                   :metadata  {:channel channel}}))
   {}
   prompt-context-entries))

(defn- derive-conv-H
  "CONV_H = CONV_Q \\ (CONV_P ∪ CONV_D) by entity-key set arithmetic. The
  H atoms inherit their provenance from the Q atoms — when a Q ref is
  later proven grounded (e.g. by free-form prompt-text extraction
  moving it into P), the same provenance carries forward."
  [{:keys [P D Q]}]
  (let [grounded-keys (set/union (set (keys P)) (set (keys D)))]
    (into {}
          (remove (fn [[k _]] (contains? grounded-keys k)))
          Q)))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(defn- conversation-metadata
  "Pull `:conversation-id`, `:profile-id`, and `:user-id` off the message
  rows. The first non-nil value across the sorted rows wins for each —
  every row in a conversation shares conversation/profile ids, and the
  originator's `:user_id` lands on at least the first user row."
  [messages]
  (let [first-row (first messages)
        user-row  (first (filter user-row? messages))]
    {:conversation-id (:conversation_id first-row)
     :profile-id      (:profile_id first-row)
     :user-id         (or (:user_id user-row) (:user_id first-row))}))

(defn normalize
  "Public entry point. Pure: takes a seq of `MetabotMessage` rows for a
  single conversation and returns the normalized struct described in the
  ns docstring. Performs no I/O.

  Callers are responsible for fetching the rows; [[metabase.metabot.quality.core]]
  is the canonical caller and handles persistence."
  [messages]
  (let [ordered                (vec (sort-messages messages))
        assistant-rows         (annotate-conversation ordered)
        annotated-parts        (mapcat :annotated-parts assistant-rows)
        tool-events            (pair-events annotated-parts)
        user-rows->next-iter   (pair-user-rows-with-next-iter ordered assistant-rows)
        prompt-context-entries (build-prompt-context user-rows->next-iter)
        sets-without-H         (-> (accumulate-tool-events tool-events)
                                   (assoc :P (accumulate-prompt-context prompt-context-entries)))
        sets                   (assoc sets-without-H :H (derive-conv-H sets-without-H))]
    (merge (conversation-metadata ordered)
           {:messages       ordered
            :tool-events    tool-events
            :prompt-context {:P (mapv #(dissoc % ::channel ::iteration)
                                      prompt-context-entries)}
            :sets           sets})))
