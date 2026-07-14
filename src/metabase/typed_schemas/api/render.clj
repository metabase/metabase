(ns metabase.typed-schemas.api.render
  "TypeScript rendering for typed schemas."
  (:require
   [clojure.string :as str]
   [metabase.typed-schemas.api.javascript :as javascript]
   [metabase.util :as u]))

(def ^:private const-suffix
  " as const")

;; The rendered schema serves two audiences:
;; - `:runtime` keys are executable data consumed by the Lib.createTestQuery DSL.
;; - `:comment` keys are emitted as nearby JavaScript comments for coding agents
;;   and humans, preserving useful context without making the runtime object
;;   larger or more ambiguous than the DSL needs.
(def ^:private schema-render-policy
  {:question         {:runtime [:type :id :name :display :columns :parameters]
                      :comment [:entityId :description :verified]}
   :table            {:runtime [:type :id :name :fields :segments :measures]
                      :comment [:entityId :description :databaseName :schemaName :tableName]}
   :field            {:runtime [:type :name :sourceName :jsType :fieldId :tableId
                                :baseType :effectiveType :defaultTemporalBucket]
                      :comment [:displayName :description :semanticType :unit]}
   :segment          {:runtime [:type :id :tableId :name]
                      :comment [:entityId :description]}
   :measure          {:runtime [:type :id :tableId :name :columns]
                      :comment [:entityId :description]}
   :metric           {:runtime [:type :id :name :databaseId :sourceTableId :sourceCardId
                                :mappedTableIds :columns :dimensions]
                      :comment [:entityId :description :verified :sourceTable]}
   :metric-dimension {:runtime [:type :id :fieldId :metricId :tableId :sourceName :sourceFieldId
                                :name :jsType :baseType :effectiveType :defaultTemporalBucket]
                      :comment [:displayName :description :semanticType :unit]}
   :column           {:runtime [:type :name :jsType]
                      :comment [:displayName :description :baseType :effectiveType :semanticType :unit]}})

(def ^:private comment-labels
  {:baseType      "Base type"
   :databaseName  "Database"
   :description   "Description"
   :displayName   "Display name"
   :effectiveType "Effective type"
   :entityId      "Entity ID"
   :schemaName    "Schema"
   :semanticType  "Semantic type"
   :sourceTable   "Source table"
   :tableName     "Table"
   :unit          "Unit"
   :verified      "Verified"})

(defn- spaces
  [indent]
  (apply str (repeat indent " ")))

(defn- entry-value
  [m k]
  (some (fn [[entry-key entry-value]]
          (when (= entry-key k)
            entry-value))
        m))

(defn- node-kind
  [path value]
  (when (map? value)
    (let [kind (or (entry-value value :type)
                   (entry-value value :kind))]
      (cond
        (= kind "card") :question
        (= kind "question") :question
        (= kind "table") :table
        (= kind "segment") :segment
        (= kind "measure") :measure
        (= kind "metric") :metric
        (= (last (butlast path)) :fields) :field
        (and (= kind "column")
             (or (= (last (butlast path)) :dimensions)
                 (= (last (drop-last 2 path)) :dimensions))) :metric-dimension
        (= (last (butlast path)) :columns) :column
        :else nil))))

(defn- policy-runtime-keys
  [kind value]
  (let [runtime-keys (get-in schema-render-policy [kind :runtime])]
    (if runtime-keys
      (->> runtime-keys
           (filter #(contains? value %)))
      (keys value))))

(defn- redundant-table-name-comment?
  [entry-key table-name]
  (and (some? entry-key)
       (some? table-name)
       (= (name entry-key) (str table-name))))

(defn- policy-comment-keys
  [kind value entry-key]
  (->> (get-in schema-render-policy [kind :comment])
       (remove #(and (= kind :table)
                     (= % :tableName)
                     (redundant-table-name-comment? entry-key (get value %))))
       (filter #(contains? value %))))

(defn- comment-value
  [value]
  (cond
    (nil? value) nil
    (map? value) (->> [(:databaseName value) (:schemaName value) (:tableName value)]
                      (keep identity)
                      (str/join "."))
    :else (str value)))

(defn- comment-lines
  [indent kind value entry-key]
  (let [prefix (spaces indent)]
    (for [k (policy-comment-keys kind value entry-key)
          :let [v (comment-value (get value k))]
          :when (not (str/blank? v))]
      (str prefix "// " (get comment-labels k (name k)) ": " (str/replace v #"\R+" " ")))))

(defn- render-options
  []
  {:map-keys       (fn [path value]
                     (policy-runtime-keys (node-kind path value) value))
   :entry-comments (fn [indent path k value]
                     (comment-lines indent (node-kind (conj path k) value) value k))
   :item-comments  (fn [indent path value]
                     (comment-lines indent (node-kind path value) value nil))})

(defn- table-fields-reference-lookup
  [schema]
  (into {}
        (for [[table-key {:keys [id]}] (:tables schema)
              :when (integer? id)]
          [id {:key       table-key
               :reference (javascript/reference-path :tables table-key :fields)}])))

(defn- field-lookup-keys
  [table-id {:keys [fieldId name]}]
  (cond-> []
    (integer? fieldId) (conj [table-id fieldId])
    (string? name)     (conj [table-id name])))

(defn- table-field-key-entries
  [table-id table-key fields]
  (for [[field-key field] fields
        lookup-key (field-lookup-keys table-id field)]
    [lookup-key {:table-key table-key
                 :field-key field-key}]))

(defn- table-field-key-lookup
  [schema]
  (into {}
        (mapcat (fn [[table-key {:keys [id fields]}]]
                  (when (integer? id)
                    (table-field-key-entries id table-key fields))))
        (:tables schema)))

(defn- pick-fields-call
  ([fields-reference field-keys]
   (pick-fields-call fields-reference field-keys nil))
  ([fields-reference field-keys source-field-id]
   (str "pickFields(" fields-reference ", " (javascript/string-vector field-keys)
        (when (integer? source-field-id)
          (str ", { sourceFieldId: " source-field-id " }"))
        ")")))

(defn- dimension-group-output-key
  [table-key source-field-id table-key-count]
  (if (= 1 (get table-key-count table-key))
    table-key
    (str table-key "Via" source-field-id)))

(defn- metric-dimension-table-field
  [fields-reference-by-table field-key-by-table-and-field {:keys [tableId fieldId name sourceFieldId]}]
  (when-let [{:keys [key reference]} (get fields-reference-by-table tableId)]
    (when-let [{:keys [field-key]} (or (get field-key-by-table-and-field [tableId fieldId])
                                       (get field-key-by-table-and-field [tableId name]))]
      {:field-key       field-key
       :reference       reference
       :source-field-id sourceFieldId
       :table-key       key})))

(defn- add-compact-metric-dimension-field
  [groups {:keys [field-key reference source-field-id table-key]}]
  (update groups
          [table-key source-field-id]
          (fnil (fn [group]
                  (update group :field-keys conj field-key))
                {:field-keys      []
                 :reference       reference
                 :source-field-id source-field-id
                 :table-key       table-key})))

(defn- compact-metric-dimension-fields
  [fields-reference-by-table field-key-by-table-and-field dimensions]
  (let [{:keys [fields-by-group dimension-keys]}
        (reduce (fn [acc [dimension-key dimension]]
                  (if-let [field (metric-dimension-table-field fields-reference-by-table
                                                               field-key-by-table-and-field
                                                               dimension)]
                    (-> acc
                        (update :fields-by-group add-compact-metric-dimension-field field)
                        (update :dimension-keys conj dimension-key))
                    acc))
                {:dimension-keys  #{}
                 :fields-by-group (array-map)}
                dimensions)
        table-key-count (frequencies (map (comp :table-key val) fields-by-group))]
    {:dimension-keys dimension-keys
     :fields         (not-empty
                      (reduce-kv (fn [acc _ {:keys [table-key reference field-keys source-field-id]}]
                                   (assoc acc
                                          (dimension-group-output-key table-key source-field-id table-key-count)
                                          (javascript/reference (pick-fields-call reference
                                                                                  (distinct field-keys)
                                                                                  source-field-id))))
                                 (array-map)
                                 fields-by-group))}))

(defn- compact-metric-dimension-keys
  [compact-fields]
  (:dimension-keys compact-fields))

(defn- raw-metric-dimension-fields
  [dimensions compact-keys compact-fields]
  (when-let [raw-fields (not-empty (update-vals (apply dissoc dimensions compact-keys)
                                                #(dissoc % :metricId)))]
    (let [group-key (if (contains? compact-fields "fields")
                      "metricFields"
                      "fields")]
      {group-key raw-fields})))

(defn- compact-metric-dimensions
  [schema]
  (let [fields-reference-by-table     (table-fields-reference-lookup schema)
        field-key-by-table-and-field (table-field-key-lookup schema)]
    (update schema :metrics
            (fn [metrics]
              (update-vals metrics
                           (fn [metric]
                             (let [dimensions     (:dimensions metric)
                                   compact-fields (compact-metric-dimension-fields fields-reference-by-table
                                                                                   field-key-by-table-and-field
                                                                                   dimensions)
                                   fields         (:fields compact-fields)
                                   compact-keys   (compact-metric-dimension-keys compact-fields)
                                   raw-fields     (raw-metric-dimension-fields dimensions compact-keys fields)
                                   compact-dimensions (not-empty (merge raw-fields fields))]
                               (cond-> (dissoc metric :dimensions)
                                 compact-dimensions (assoc :dimensions compact-dimensions)))))))))

(defn- render-top-level-const
  [k value]
  (str "const " (u/qualified-name k) " = " (javascript/render-value value (assoc (render-options) :path [k]))
       const-suffix ";\n\n"))

(defn- render-pick-fields-helper
  []
  (javascript/line-block
   "function pickFields<TFields extends object, TKey extends keyof TFields>("
   "  fields: TFields,"
   "  keys: readonly TKey[],"
   "  options?: { sourceFieldId?: number },"
   "): Pick<TFields, TKey> {"
   "  return Object.fromEntries(keys.map((key) => {"
   "    const field = fields[key] as { tableId?: number };"
   "    if (options?.sourceFieldId == null) {"
   "      return [key, field];"
   "    }"
   "    const { tableId, ...joinedField } = field;"
   ""
   "    return [key, { ...joinedField, sourceFieldId: options.sourceFieldId }];"
   "  })) as Pick<TFields, TKey>;"
   "}"))

(defn- uses-pick-fields-helper?
  [schema]
  (boolean
   (some (fn [metric]
           (some javascript/reference? (vals (:dimensions metric))))
         (vals (:metrics schema)))))

(defn render-typescript
  "Render `schema` as an ES module containing `as const` TypeScript constants."
  [schema]
  (let [schema          (compact-metric-dimensions schema)
        top-level-keys  [:questions :models :tables :metrics]
        schema-metadata (apply dissoc schema top-level-keys)
        schema-value    (reduce (fn [acc k]
                                  (if (contains? schema k)
                                    (assoc acc k (javascript/reference (name k)))
                                    acc))
                                schema-metadata
                                top-level-keys)]
    (str (when (uses-pick-fields-helper? schema)
           (render-pick-fields-helper))
         (apply str
                (for [k top-level-keys
                      :when (contains? schema k)]
                  (render-top-level-const k (get schema k))))
         "const schema = " (javascript/render-value schema-value (render-options)) const-suffix ";\n\n"
         "export default schema;\n")))
