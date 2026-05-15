(ns metabase.metabot.quality.extract
  "Pure normalization of a conversation's messages into the shape consumed by
  the BOT-1515 signal predicates.

  Signal predicates never walk raw `metabot_message.data` JSON — they receive
  the normalized map produced here. That isolation has two purposes: it lets
  each signal predicate stay short and direct, and it gives a single place
  where in-memory vs. JSON-roundtripped part shape differences are reconciled.

    In-memory parts (live, pre-persistence)  →  `:type` is a keyword, e.g. `:tool-input`
    Persisted parts (read back via Toucan)   →  `:type` is a string, e.g. \"tool-input\"

  Every type discriminator here normalizes to a keyword via `part-type` so
  both shapes flow through unchanged.

  Output shape (see `normalize`):

    {:conversation-id  Any                       — the conversation id, if supplied
     :profile-id       String|nil                — modal `:profile_id` across messages
     :messages         [normalized-message]      — sorted by (`:created-at`, `:id`)
     :user-turn-windows [user-turn-window]       — half-open intervals for query-thrash
     :tool-events      [tool-event]              — flat conversation-ordered call stream
     :entity-refs      {:search-hits   [ref]
                        :author-refs   [ref]
                        :inspect-refs  [ref]
                        :navigate-refs [ref]}}

  Cross-reference:
    - signal panel: notes/bot-1515-conversation-score/strategy-v3-signals-ref-v2.md §3
    - normalization design: notes/bot-1515-conversation-score/impl-phase-1-conversation-composites.md §4.3"
  (:require
   [metabase.metabot.quality.constants :as constants]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Type discriminator — handles keyword (in-memory) and string (post-JSON-roundtrip)
;; ---------------------------------------------------------------------------

(defn- part-type
  "Normalized part `:type` as a keyword, or nil if the part has no `:type`.
  Accepts both the in-memory keyword (e.g. `:tool-input`) and the persisted
  string (e.g. `\"tool-input\"`)."
  [part]
  (let [t (:type part)]
    (cond
      (keyword? t) t
      (string? t)  (keyword t)
      :else        nil)))

(defn- tool-input-part?  [part] (= :tool-input  (part-type part)))
(defn- tool-output-part? [part] (= :tool-output (part-type part)))

(defn- llm-emission-part?
  "True for parts that count as an LLM emission for iter-count grouping.
  Per signals-ref §3.5: `:text` and `:tool-input` are LLM-emitted;
  `:tool-output`, `:data`, `:error` are non-LLM."
  [part]
  (#{:text :tool-input} (part-type part)))

;; ---------------------------------------------------------------------------
;; iter-count
;; ---------------------------------------------------------------------------

(defn- iter-count
  "Count of LLM-emission groups in a parts vector.

  An LLM-emission group is a maximal run of consecutive LLM parts (`:text` or
  `:tool-input`). The count is the number of *transitions into* such a run
  (signals-ref §3.5: `prev_kind IS NULL OR prev_kind != 'llm'`).

  Examples:
    []                                            → 0
    [text]                                        → 1
    [text tool-input]                             → 1
    [text tool-input tool-output text tool-input] → 2
    [tool-output]                                 → 0"
  [parts]
  (loop [prev-llm? false
         remaining (seq parts)
         n         0]
    (if-let [part (first remaining)]
      (let [llm? (llm-emission-part? part)]
        (recur llm?
               (next remaining)
               (if (and llm? (not prev-llm?)) (inc n) n)))
      n)))

;; ---------------------------------------------------------------------------
;; Per-message normalization
;; ---------------------------------------------------------------------------

(defn- decode-json-string
  "Decode a JSON-encoded string with keywordized keys, falling back to the
  passthrough value if decoding throws. Used for fields that are stored as JSON
  text without a Toucan transform — currently `metabot_message.error`."
  [v]
  (cond
    (nil? v)    nil
    (string? v) (try (json/decode+kw v)
                     (catch Exception _ {:message v}))
    :else       v))

(defn- decode-output-error
  "Decode the sibling `:error` field on a tool-output part. In-memory tool
  outputs carry a structured map (e.g. `{:type :exception :message ...}`);
  after JSON round-trip the map keys are keywords and the values are strings.
  A bare-string error payload is wrapped into `{:message <s>}` for shape
  parity with the structured case."
  [error]
  (decode-json-string error))

(defn- finished-flag
  "Tri-state `:finished`. Nil means in-flight (the schema-level placeholder
  marker); true means completed; false means client abort. PR 74056."
  [v]
  (cond (true? v) true (false? v) false :else nil))

(defn- pair-tool-calls
  "Build the normalized `:tool-calls` vector for an assistant message.

  Pairs each `:tool-input` with its matching `:tool-output` by `:id` (the
  toolCallId both parts share). A tool-input with no matching tool-output —
  e.g. a turn aborted between request and response — still emits an entry
  with `:result` and `:output-error` nil.

  Returned shape per call:
    {:part-index   Int       — index in this message's parts vector
     :id           String    — tool call id
     :function     String    — tool name (e.g. \"search\", \"create_sql_query\")
     :arguments    Map|Any   — the parsed input args
     :result       Map|Any   — the paired output's `:result` (post-strip; may be
                               trimmed by `metabot.persistence/strip-tool-output-bloat`)
     :output-error Map|nil}  — decoded sibling `:error` from the tool-output"
  [parts]
  (let [parts-vec (vec parts)
        outputs   (persistent!
                   (reduce (fn [acc part]
                             (cond-> acc
                               (tool-output-part? part) (assoc! (:id part) part)))
                           (transient {})
                           parts-vec))]
    (into []
          (keep-indexed (fn [idx part]
                          (when (tool-input-part? part)
                            (let [out (get outputs (:id part))]
                              {:part-index   idx
                               :id           (:id part)
                               :function     (:function part)
                               :arguments    (:arguments part)
                               :result       (:result out)
                               :output-error (decode-output-error (:error out))}))))
          parts-vec)))

(defn- normalize-message
  "Build the normalized per-message shape consumed by signal predicates."
  [msg]
  (let [role  (some-> (:role msg) keyword)
        parts (or (:data msg) [])]
    (cond-> {:id           (:id msg)
             :role         role
             :created-at   (:created_at msg)
             :profile-id   (:profile_id msg)
             :total-tokens (or (:total_tokens msg) 0)
             :finished     (finished-flag (:finished msg))
             :error        (decode-json-string (:error msg))
             :parts        parts}
      (= :assistant role)
      (assoc :iter-count (iter-count parts)
             :tool-calls (pair-tool-calls parts)))))

;; ---------------------------------------------------------------------------
;; Conversation-level ordering
;; ---------------------------------------------------------------------------

(defn- ordered-key
  "Sort key matching the conversation-detail endpoint's `ORDER BY created_at, id`.
  Rows that share `created_at` (the placeholder assistant row pinned at turn
  start shares its `created_at` with the paired user row — see
  `metabot.persistence/start-turn!`) are disambiguated by `:id`."
  [msg]
  [(:created-at msg) (:id msg)])

;; ---------------------------------------------------------------------------
;; User-turn windows
;; ---------------------------------------------------------------------------

(defn- user-turn-windows
  "One window per user row in `messages`. The `[start, end)` interval is
  half-open: `start` is the user row's own `ordered-key`; `end` is the next
  user row's `ordered-key`, or nil for the last user prompt (meaning 'extends
  to the end of the conversation').

  query-thrash bucketing then asks `start ≤ event-order-key < end`."
  [messages]
  (let [users (filterv #(= :user (:role %)) messages)]
    (mapv (fn [m next-m]
            {:user-msg-id (:id m)
             :start       (ordered-key m)
             :end         (some-> next-m ordered-key)})
          users
          (concat (rest users) [nil]))))

;; ---------------------------------------------------------------------------
;; Flat tool-events stream
;; ---------------------------------------------------------------------------

(defn- tool-events
  "Flatten per-assistant tool calls into a single conversation-ordered stream.

  Each event carries:
    {:assistant-msg-id <id>             — owning message
     :order-key        [created-at id part-index]  — total order across events
     :part-index :id :function :arguments :result :output-error}

  `messages` must already be sorted by `ordered-key`."
  [messages]
  (into []
        (mapcat (fn [m]
                  (when (= :assistant (:role m))
                    (let [[ca id] (ordered-key m)]
                      (for [c (:tool-calls m)]
                        (assoc c
                               :assistant-msg-id id
                               :order-key        [ca id (:part-index c)]))))))
        messages))

;; ---------------------------------------------------------------------------
;; Entity-ref harvest
;; ---------------------------------------------------------------------------
;;
;; Each ref is a small map carrying enough context for downstream signals to
;; check temporal ordering against other refs and to identify the source call:
;;
;;     {:ref-type        :table|:model|:metric|:question|:card|:dashboard|...
;;      :ref-id          Int
;;      :assistant-msg-id <id>
;;      :order-key       [created-at id part-index]
;;      :function        String           — the tool name that produced the ref
;;      ;; Search-hit refs additionally carry:
;;      :entity          Map}             — the original entity payload from the
;;                                          search tool's result.data

(def ^:private card-template-pattern
  "Regex for `{{#N}}` card-id references embedded in SQL or Python source
  (lifted unchanged from BB3's `signals.sql` recipe). Captures the numeric id."
  #"\{\{#(\d+)")

(defn- harvest-card-template-refs
  "Yield each card id referenced by a `{{#N}}` template in `s`. Empty / non-
  string inputs yield no refs. Duplicate refs are preserved — the caller
  decides whether and how to dedup."
  [s]
  (when (string? s)
    (keep (fn [[_ id-str]] (parse-long id-str))
          (re-seq card-template-pattern s))))

(defn- ref-base
  "Common fields attached to every harvested ref so downstream signals can
  trace it back to the originating tool call and compare temporally."
  [{:keys [function assistant-msg-id order-key]}]
  {:function         function
   :assistant-msg-id assistant-msg-id
   :order-key        order-key})

(defn- ->ref
  "Build a single ref map. Returns nil if `ref-id` is missing — callers should
  `keep` the result. `ref-type` may be either a keyword or a string."
  [base ref-type ref-id]
  (when (some? ref-id)
    (let [rt (cond (keyword? ref-type) ref-type
                   (string? ref-type)  (keyword ref-type)
                   :else               nil)]
      (when rt
        (assoc base :ref-type rt :ref-id ref-id)))))

(defn- source-entity->ref
  [base {:keys [type id]}]
  (->ref base type id))

(defn- author-refs-for-call
  "Author-ref harvest for one tool call. Each AUTHORING tool encodes its target
  entity differently; this dispatch lifts the BB3 recipes into Clojure.

  Card-typed refs surface as `:ref-type :card`; their final subtype (question /
  model / metric) is resolved by `quality.governance/resolve-canonical-rank`
  via `report_card.type` at scoring time."
  [{:keys [function arguments] :as call}]
  (let [base (ref-base call)]
    (case function
      "construct_notebook_query"
      (into []
            (keep identity)
            (cons (source-entity->ref base (:source_entity arguments))
                  (map #(source-entity->ref base %) (:referenced_entities arguments))))

      "create_sql_query"
      (mapv #(->ref base :card %)
            (harvest-card-template-refs (:sql_query arguments)))

      "edit_sql_query"
      (into []
            (mapcat (fn [edit]
                      (map #(->ref base :card %)
                           (harvest-card-template-refs (:new_string edit)))))
            (:edits arguments))

      "replace_sql_query"
      (mapv #(->ref base :card %)
            (harvest-card-template-refs (:new_query arguments)))

      ("write_transform_sql" "write_transform_python")
      (let [action       (:edit_action arguments)
            edit-strings (mapcat #(harvest-card-template-refs (:new_string %))
                                 (:edits action))
            new-content  (harvest-card-template-refs (:new_content action))
            sources      (when (= function "write_transform_sql")
                           (keep (fn [t]
                                   (cond
                                     (map? t)     (source-entity->ref base t)
                                     (integer? t) (->ref base :table t)))
                                 (:source_tables arguments)))]
        (into [] (concat (or sources [])
                         (map #(->ref base :card %) edit-strings)
                         (map #(->ref base :card %) new-content))))

      "document_construct_sql_chart"
      (mapv #(->ref base :card %)
            (harvest-card-template-refs (:sql arguments)))

      "document_construct_model_chart"
      (if-let [r (source-entity->ref base (:source_entity arguments))]
        [r]
        [])

      [])))

(def ^:private metabase-uri-pattern
  "Matches the `metabase://<type>/<id>` prefix of a read_resource URI. Sub-
  resource segments after the id are ignored — the ref is at the entity grain."
  #"^metabase://([^/]+)/(\d+)")

(defn- inspect-refs-for-call
  "Inspect-ref harvest for one tool call."
  [{:keys [function arguments] :as call}]
  (let [base (ref-base call)]
    (case function
      "read_resource"
      (into []
            (keep (fn [uri]
                    (when (string? uri)
                      (when-let [[_ rtype rid] (re-find metabase-uri-pattern uri)]
                        (->ref base rtype (parse-long rid))))))
            (:uris arguments))

      "list_available_fields"
      (into []
            (keep identity)
            (concat (map #(->ref base :table %)  (:table_ids arguments))
                    (map #(->ref base :model %)  (:model_ids arguments))
                    (map #(->ref base :metric %) (:metric_ids arguments))))

      "get_field_values"
      (if-let [r (->ref base (:data_source arguments) (:source_id arguments))]
        [r]
        [])

      [])))

(defn- navigate-refs-for-call
  [{:keys [function arguments] :as call}]
  (when (= "navigate_user" function)
    (let [base (ref-base call)
          d    (:destination arguments)]
      (if-let [r (->ref base (:entity_type d) (:entity_id d))]
        [r]
        []))))

(defn- search-hits-for-call
  "Search-hit harvest for one tool call.

  Reads `(:data (:structured-output result))`. Each entity carries a `:model`
  string and an `:id` (BB2/BB3 shape). The original entity payload is preserved
  on the ref so downstream signals (`quality.governance/resolve-canonical-rank`)
  can read additional fields without going back to the source data.

  Search-tool `:structured-output` bypasses `strip-tool-output-bloat` in
  `metabase.metabot.persistence`, so the in-loop and DB-scored paths see the
  same shape."
  [{:keys [function result] :as call}]
  (when (contains? constants/search-tools function)
    (let [base (ref-base call)]
      (into []
            (keep (fn [entity]
                    (let [rtype (:model entity)
                          rid   (:id entity)]
                      (some-> (->ref base rtype rid) (assoc :entity entity)))))
            (get-in result [:structured-output :data])))))

(defn- harvest-entity-refs
  [events]
  (let [collect (fn [pred xform]
                  (into []
                        (comp (filter (fn [e] (pred (:function e))))
                              (mapcat xform))
                        events))]
    {:search-hits   (collect constants/search-tools    search-hits-for-call)
     :author-refs   (collect constants/authoring-tools author-refs-for-call)
     :inspect-refs  (collect constants/inspect-tools   inspect-refs-for-call)
     :navigate-refs (collect #{"navigate_user"}        navigate-refs-for-call)}))

;; ---------------------------------------------------------------------------
;; Modal profile id
;; ---------------------------------------------------------------------------

(defn- modal-profile-id
  "Modal `:profile-id` across `messages`. Tiebreak `(count desc, profile-id asc)`
  per BB7's `profile_mode` recipe — deterministic across runs. Returns nil if
  no message carries a profile id."
  [messages]
  (when-let [counts (not-empty (frequencies (keep :profile-id messages)))]
    (->> counts
         (sort-by (fn [[pid c]] [(- ^long c) pid]))
         ffirst)))

;; ---------------------------------------------------------------------------
;; Public API
;; ---------------------------------------------------------------------------

(defn normalize
  "Build the normalized conversation shape consumed by quality signal predicates.

  `messages` is a seq of `MetabotMessage` maps for a single conversation; each
  must have at minimum `:id`, `:role`, `:created_at`, `:profile_id`, `:data`.
  The seq does not need to be pre-sorted — this fn re-sorts by
  `[:created_at :id]` to match the conversation-detail endpoint's ordering.

  Options:
    :conversation-id  — copied verbatim onto the result for caller convenience."
  ([messages] (normalize messages nil))
  ([messages {:keys [conversation-id]}]
   (let [normalized (mapv normalize-message messages)
         sorted     (vec (sort-by ordered-key normalized))
         events     (tool-events sorted)]
     {:conversation-id   conversation-id
      :profile-id        (modal-profile-id sorted)
      :messages          sorted
      :user-turn-windows (user-turn-windows sorted)
      :tool-events       events
      :entity-refs       (harvest-entity-refs events)})))
