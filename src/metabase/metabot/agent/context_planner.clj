(ns metabase.metabot.agent.context-planner
  "Deterministic, provider-neutral planning for the message history sent to an LLM.

  The planner never mutates agent memory and never summarizes with an LLM. When
  the history exceeds its estimated token budget, it replaces eligible older
  units with ordinary text records. System instructions and tool schemas are
  deliberately outside this API and continue to be supplied separately by the
  agent/provider boundary."
  (:require
   [clojure.string :as str]))

(def default-context-token-budget
  "Conservative default budget for message history only. System instructions,
  tool schemas, and response tokens are intentionally not included."
  24000)

(def ^:private default-recent-step-count 2)
(def ^:private estimated-chars-per-token 4)

(defn- estimated-chars
  "Order-independent size estimate for values in AISDK parts."
  [value]
  (cond
    (nil? value)        4
    (string? value)     (count value)
    (keyword? value)    (inc (count (name value)))
    (symbol? value)     (count (str value))
    (number? value)     (count (str value))
    (boolean? value)    (if value 4 5)
    (map? value)        (+ 2 (reduce-kv (fn [total k v]
                                          (+ total (estimated-chars k) 1 (estimated-chars v) 1))
                                        0
                                        value))
    (coll? value)       (+ 2 (reduce (fn [total item]
                                       (+ total (estimated-chars item) 1))
                                     0
                                     value))
    :else               (count (str value))))

(defn estimate-tokens
  "Estimate provider-neutral tokens for AISDK parts using four characters per
  token. This is deliberately simple and deterministic; it is a planning metric,
  not a provider billing tokenizer."
  [parts]
  (let [chars (estimated-chars parts)]
    (quot (+ chars (dec estimated-chars-per-token)) estimated-chars-per-token)))

(defn- step-message-part?
  [part]
  (contains? #{:text :tool-input :tool-output :reasoning} (:type part)))

(defn- recent-step-part-count
  [steps recent-step-count]
  (->> steps
       (take-last recent-step-count)
       (mapcat :parts)
       (filter step-message-part?)
       count))

(defn- flush-current
  [{:keys [units current]}]
  {:units   (cond-> units (seq current) (conj current))
   :current []})

(defn- unit-entries
  "Partition parts into atomic planning units. Explicit role messages stand on
  their own. Assistant text/tool calls and their following tool results stay in
  one unit, including parallel calls. A new assistant part after a result starts
  the next agent step."
  [parts]
  (let [{:keys [units current]}
        (reduce (fn [{:keys [current] :as state} entry]
                  (let [part          (:part entry)
                        explicit-role (contains? part :role)
                        assistant-part? (contains? #{:text :tool-input} (:type part))
                        completed?    (some #(= :tool-output (get-in % [:part :type])) current)]
                    (cond
                      explicit-role
                      (-> state
                          flush-current
                          (update :units conj [entry]))

                      (and assistant-part? completed?)
                      (-> state
                          flush-current
                          (assoc :current [entry]))

                      (contains? #{:text :tool-input :tool-output} (:type part))
                      (update state :current conj entry)

                      :else
                      (-> state
                          flush-current
                          (update :units conj [entry])))))
                {:units [] :current []}
                (map-indexed (fn [index part] {:index index :part part}) parts))]
    (cond-> units
      (seq current) (conj current))))

(defn- tool-id-frequencies
  [part-type parts]
  (frequencies (keep #(when (= part-type (:type %)) (:id %)) parts)))

(defn- safe-tool-history?
  "True when a unit has no tool protocol items, or has exactly one result for
  every call ID (and no orphan results)."
  [parts]
  (let [tool-parts (filter #(contains? #{:tool-input :tool-output} (:type %)) parts)]
    (and (every? (comp some? :id) tool-parts)
         (= (tool-id-frequencies :tool-input parts)
            (tool-id-frequencies :tool-output parts)))))

(def ^:private critical-key-names
  #{"error" "errors" "exception" "failure" "failures"
    "permission" "permissions" "scope" "scopes" "denied" "forbidden"
    "unauthorized" "unauthorised"})

(def ^:private critical-text-pattern
  #"(?i)\b(error|errors|failed|failure|exception|permission|permissions|scope|denied|forbidden|unauthori[sz]ed|read[- ]only|write access|cannot access|can access)\b")

(defn- critical-key?
  [key]
  (and (or (keyword? key) (string? key))
       (contains? critical-key-names (str/lower-case (name key)))))

(defn- critical-fact?
  "Detect error and authorization/scope facts that must remain verbatim."
  [value]
  (cond
    (string? value) (boolean (re-find critical-text-pattern value))
    (map? value)    (or (some critical-key? (keys value))
                        (some critical-fact? (vals value)))
    (coll? value)   (some critical-fact? value)
    :else           false))

(def ^:private identifier-key-pattern
  #"(?i)^(?:query[-_]?id|card[-_]?id|(?:database|db)(?:[-_]?id)?)$")
(def ^:private uri-pattern
  #"(?:https?://|metabase://)[^\s\]\)>\"']+")

(def ^:private relative-entity-pattern
  #"(?i)/(?:query|card|database|db)/[A-Za-z0-9._:-]+")

(def ^:private citation-marker-pattern
  #"\[[0-9]+\]")

(def ^:private inline-identifier-pattern
  #"(?i)\b(?:query|card|database|db)(?:[-_ ]?id)?\s*[:=/#]\s*[A-Za-z0-9][A-Za-z0-9._:-]*")

(def ^:private citation-container-key-pattern
  #"(?i)^citations?(?:[-_](?:data|refs?|references?))?$")

(def ^:private citation-reference-key-pattern
  #"(?i)^(?:id|ref|reference)$")

(def ^:private citation-specific-reference-key-pattern
  #"(?i)^citation[-_]?(?:id|ref|reference)$")

(defn- scalar-reference-value?
  [value]
  (or (string? value)
      (keyword? value)
      (symbol? value)
      (number? value)
      (uuid? value)))

(defn- reference-value
  [value]
  (cond
    (string? value)  (pr-str value)
    (keyword? value) (str value)
    :else            (str value)))

(defn- citation-references
  ([value]
   (citation-references value false))
  ([value in-citation?]
   (cond
     (map? value)
     (mapcat
      (fn [[k v]]
        (let [key-name            (when (or (keyword? k) (string? k)) (name k))
              citation-container? (and key-name (re-matches citation-container-key-pattern key-name))
              generic-reference?  (and key-name (re-matches citation-reference-key-pattern key-name))
              specific-reference? (and key-name (re-matches citation-specific-reference-key-pattern key-name))
              citation-context?   (or in-citation? citation-container?)]
          (concat
           (when (and (scalar-reference-value? v)
                      (or (and citation-context? generic-reference?)
                          specific-reference?))
             [(str "citation." key-name "=" (reference-value v))])
           (citation-references v citation-context?))))
      value)

     (coll? value)
     (mapcat #(citation-references % in-citation?) value)

     :else
     [])))

(defn- identifier-references
  [value]
  (cond
    (map? value)
    (mapcat (fn [[k v]]
              (concat
               (when (and (or (keyword? k) (string? k))
                          (re-matches identifier-key-pattern (name k))
                          (scalar-reference-value? v))
                 [(str (name k) "=" (reference-value v))])
               (identifier-references v)))
            value)

    (coll? value)
    (mapcat identifier-references value)

    :else
    []))

(defn- strings-in
  [value]
  (cond
    (string? value) [value]
    (map? value)    (mapcat strings-in (vals value))
    (coll? value)   (mapcat strings-in value)
    :else           []))

(defn- regex-matches
  [pattern text]
  (map #(if (string? %) % (first %)) (re-seq pattern text)))

(defn- references
  "Extract exact follow-up references from a unit. Identifier values and
  citations survive compaction without retaining a potentially huge tool body."
  [parts]
  (->> (concat (identifier-references parts)
               (citation-references parts)
               (mapcat (fn [text]
                         (concat (regex-matches uri-pattern text)
                                 (regex-matches relative-entity-pattern text)
                                 (regex-matches citation-marker-pattern text)
                                 (regex-matches inline-identifier-pattern text)))
                       (strings-in parts)))
       distinct
       sort
       vec))

(defn- tool-summary
  [parts]
  (->> parts
       (keep #(when (= :tool-input (:type %)) (:function %)))
       frequencies
       (sort-by key)
       (map (fn [[tool-name n]]
              (str tool-name (when (< 1 n) (str " x" n)))))
       (str/join ", ")))

(defn- unit-kind
  [parts]
  (cond
    (some #(= :tool-input (:type %)) parts) "resolved tool exchange"
    (some #(= :user (:role %)) parts)        "prior user message"
    (some #(= :text (:type %)) parts)        "prior assistant message"
    :else                                    "prior message"))

(defn- compact-record
  [unit-index entries]
  (let [parts      (mapv :part entries)
        tools      (tool-summary parts)
        references (references parts)]
    {:role    :user
     :content (str "[Prior context record " (inc unit-index) "; not a new user request]\n"
                   "Kind: " (unit-kind parts) "."
                   (when (seq tools)
                     (str "\nTools: " tools "."))
                   (when (seq references)
                     (str "\nReferences: " (str/join ", " references) ".")))}))

(defn- unit-protected-reasons
  [entries latest-user-index recent-tail-start]
  (let [parts   (mapv :part entries)
        indexes (map :index entries)]
    (cond-> #{}
      (some #(= latest-user-index %) indexes)            (conj :current-user)
      (some #(<= recent-tail-start %) indexes)           (conj :recent-step)
      (some #(= :system (:role %)) parts)                (conj :system)
      (not (safe-tool-history? parts))                   (conj :unresolved-tool-history)
      (some critical-fact? parts)                        (conj :error-or-scope-fact))))

(defn- render-units
  [units compacted-unit-indexes]
  (into []
        (mapcat (fn [{:keys [unit-index entries compact]}]
                  (if (contains? compacted-unit-indexes unit-index)
                    [compact]
                    (map :part entries))))
        units))

(defn- plan-stats
  [budget before parts compacted-count protected-count]
  (let [after (estimate-tokens parts)]
    {:budget                   budget
     :estimated-tokens-before before
     :estimated-tokens-after  after
     :estimated-token-savings (- before after)
     :compacted-unit-count    compacted-count
     :protected-unit-count    protected-count
     :budget-satisfied?       (<= after budget)}))

(defn plan-message-history
  "Plan `parts` for provider serialization.

  Options:
  - `:budget` message-history budget in deterministic estimated tokens.
  - `:steps` the full in-memory `:steps-taken` vector; only its most recent
    `:recent-step-count` message parts are protected verbatim.
  - `:recent-step-count` defaults to 2.

  Returns `{:parts [...] :stats {...}}`. Required units win over the budget, so
  `:budget-satisfied?` can be false rather than dropping current intent, recent
  work, errors, scope facts, or unresolved tool protocol items."
  ([parts]
   (plan-message-history parts {}))
  ([parts {:keys [budget steps recent-step-count]
           :or   {budget            default-context-token-budget
                  steps             []
                  recent-step-count default-recent-step-count}}]
   (let [parts               (vec parts)
         budget              (max 0 (long budget))
         before              (estimate-tokens parts)
         latest-user-index   (last (keep-indexed (fn [index part]
                                                   (when (= :user (:role part)) index))
                                                 parts))
         recent-count        (min (count parts) (recent-step-part-count steps recent-step-count))
         recent-tail-start   (- (count parts) recent-count)
         units               (mapv (fn [unit-index entries]
                                     (let [parts     (mapv :part entries)
                                           compact   (compact-record unit-index entries)
                                           reasons   (unit-protected-reasons entries latest-user-index recent-tail-start)
                                           savings   (- (estimate-tokens parts) (estimate-tokens [compact]))]
                                       {:unit-index unit-index
                                        :entries    entries
                                        :compact    compact
                                        :reasons    reasons
                                        :savings    savings}))
                                   (range)
                                   (unit-entries parts))
         protected-count     (count (filter (comp seq :reasons) units))
         candidates          (filter #(and (empty? (:reasons %)) (pos? (:savings %))) units)]
     (if (<= before budget)
       {:parts parts
        :stats (plan-stats budget before parts 0 protected-count)}
       (loop [remaining candidates
              compacted #{}
              planned   parts]
         (if (or (<= (estimate-tokens planned) budget)
                 (empty? remaining))
           {:parts planned
            :stats (plan-stats budget before planned (count compacted) protected-count)}
           (let [unit-index (:unit-index (first remaining))
                 compacted' (conj compacted unit-index)
                 planned'   (render-units units compacted')]
             (recur (rest remaining) compacted' planned'))))))))
