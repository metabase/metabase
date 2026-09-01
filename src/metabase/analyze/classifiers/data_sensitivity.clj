(ns metabase.analyze.classifiers.data-sensitivity
  "Classifier that infers the `data_sensitivity` category of a Field from deterministic rules over its name, base
  type, semantic type, fingerprint, and the name and entity type of its Table. Pure: no app-DB access, no settings."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def ^:private text-type         #{:type/Text})
(def ^:private int-or-text-type  #{:type/Integer :type/Text})
(def ^:private text-or-bool-type #{:type/Text :type/Boolean})
(def ^:private number-type       #{:type/Number})
(def ^:private any-type          #{:type/*})

(defn- name->tokens
  "Lowercased tokens of a physical column or table name, split on `_`, `-`, `.`, whitespace, and camelCase
  boundaries, plus every adjacent pair joined with `_`."
  [s]
  (let [tokens (->> (str/replace s #"(?<=[a-z0-9])(?=[A-Z])" "_")
                    u/lower-case-en
                    (#(str/split % #"[_\-.\s]+"))
                    (remove str/blank?)
                    vec)]
    {:tokens (set tokens)
     :pairs  (set (map #(str %1 "_" %2) tokens (rest tokens)))}))

;; Tuples of `[#{token-or-pair ...} set-of-valid-base-types category]`. A field matches when any of its tokens or
;; adjacent-token pairs is in the set and its base type `isa?` one of the base types.
(def ^:private token-rules
  [[#{"password"}                text-type         :SEC_KEY]
   [#{"ip_address"}              text-type         :SYS_TELEMETRY]
   [#{"diagnosis"}               text-type         :PHI]
   [#{"dna"}                     text-type         :BIO_GEN]
   [#{"card_number"}             int-or-text-type  :PCI_FIN]
   [#{"gender"}                  text-or-bool-type :SENS_PERS]
   [#{"ssn"}                     any-type          :PII]
   [#{"first_name" "last_name"}  text-type         :PII]
   [#{"source_code"}             text-type         :CORP_IP]
   [#{"salary"}                  number-type       :BIZ_CONF]])

;; Tuples of `[regex set-of-valid-base-types category]` matched with `re-find` against the whole lowercased name.
;; Reserved for true substrings that tokenizing misses; keep short.
(def ^:private stem-rules
  [[#"passw" text-type :SEC_KEY]
   [#"email" text-type :PII]])

;; Semantic types that imply a category regardless of table. Consulted with `isa?` so descendants match.
(def ^:private semantic-type->category
  {:type/Email :PII})

;; Semantic types that imply a category only when the table's `entity_type` is `:entity/UserTable`.
(def ^:private user-table-semantic-type->category
  {:type/Name       :PII
   :type/City       :PII
   :type/State      :PII
   :type/Country    :PII
   :type/ZipCode    :PII
   :type/Coordinate :PII})

;; Tuples of `[#{field-token ...} #{table-token ...} category]`. Promotes a weak field signal when the table name
;; supplies the context.
(def ^:private table-boosters
  [[#{"notes" "comments" "remarks"} #{"patient" "medical" "clinical" "health"} :PHI]])

(def ^:private categories
  (set lib.schema.metadata/column-data-sensitivity-types))

(def ^:private precedence
  (zipmap lib.schema.metadata/column-data-sensitivity-types (range)))

(when-not config/is-prod?
  (let [valid-category?    #(and (contains? categories %) (not= :PUBLIC %))
        valid-base-types?  #(and (set? %) (seq %) (every? (fn [t] (isa? t :type/*)) %))
        valid-token?       #(re-matches #"[a-z0-9]+(?:_[a-z0-9]+)?" %)]
    (doseq [[tokens base-types category] token-rules]
      (assert (and (set? tokens) (every? valid-token? tokens)) (pr-str tokens))
      (assert (valid-base-types? base-types) (pr-str base-types))
      (assert (valid-category? category) (pr-str category)))
    (doseq [[pattern base-types category] stem-rules]
      (assert (instance? java.util.regex.Pattern pattern) (pr-str pattern))
      (assert (valid-base-types? base-types) (pr-str base-types))
      (assert (valid-category? category) (pr-str category)))
    (doseq [[semantic-type category] (concat semantic-type->category user-table-semantic-type->category)]
      (assert (isa? semantic-type :Semantic/*) (pr-str semantic-type))
      (assert (valid-category? category) (pr-str category)))
    (doseq [[field-tokens table-tokens category] table-boosters]
      (assert (every? valid-token? field-tokens) (pr-str field-tokens))
      (assert (every? valid-token? table-tokens) (pr-str table-tokens))
      (assert (valid-category? category) (pr-str category)))))

(defn- base-type-matches? [base-type base-types]
  (some (partial isa? base-type) base-types))

(defn- token-matches [{:keys [tokens pairs]} base-type]
  (let [names (into tokens pairs)]
    (for [[rule-names base-types category] token-rules
          :when (and (some rule-names names)
                     (base-type-matches? base-type base-types))]
      category)))

(defn- stem-matches [lower-name base-type]
  (for [[pattern base-types category] stem-rules
        :when (and (base-type-matches? base-type base-types)
                   (re-find pattern lower-name))]
    category))

(defn- semantic-matches [semantic-type entity-type]
  (when semantic-type
    (for [[st category] (cond-> semantic-type->category
                          (= :entity/UserTable entity-type) (merge user-table-semantic-type->category))
          :when (isa? semantic-type st)]
      category)))

(defn- fingerprint-matches [fingerprint base-type]
  (when (and (isa? base-type :type/Text)
             (>= (get-in fingerprint [:type :type/Text :percent-email] 0) 0.95))
    [:PII]))

(defn- booster-matches [{:keys [tokens]} table-name]
  (when table-name
    (let [table-tokens (:tokens (name->tokens table-name))]
      (for [[field-tokens rule-table-tokens category] table-boosters
            :when (and (some field-tokens tokens)
                       (some rule-table-tokens table-tokens))]
        category))))

(def ^:private Field
  [:map
   [:name          :string]
   [:base_type     :keyword]
   [:semantic_type {:optional true} [:maybe :keyword]]
   [:fingerprint   {:optional true} :any]])

(def ^:private TableContext
  [:maybe
   [:map
    [:name        {:optional true} [:maybe :string]]
    [:entity_type {:optional true} [:maybe :keyword]]]])

(mu/defn infer-data-sensitivity :- [:maybe ::lib.schema.metadata/column.data-sensitivity]
  "Infer the `data_sensitivity` category of `field` from its name, base type, semantic type, and fingerprint, with
  `table-context` (`:name`, `:entity_type` of its Table) gating the weaker rules. Returns the highest-precedence
  matching category, or nil when no rule matches. Never returns `:PUBLIC`."
  [{field-name :name, :keys [base_type semantic_type fingerprint]} :- Field
   {table-name :name, :keys [entity_type]} :- TableContext]
  (let [tokens (name->tokens field-name)]
    (->> (concat (token-matches tokens base_type)
                 (stem-matches (u/lower-case-en field-name) base_type)
                 (semantic-matches semantic_type entity_type)
                 (fingerprint-matches fingerprint base_type)
                 (booster-matches tokens table-name))
         (sort-by precedence)
         first)))
