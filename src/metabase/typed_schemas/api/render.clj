(ns metabase.typed-schemas.api.render
  "JavaScript and TypeScript rendering for typed schemas."
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private js-identifier-pattern
  #"[A-Za-z_$][A-Za-z0-9_$]*")

(def ^:private schema-render-policy
  {:question         {:runtime [:type :id :name :display :columns :parameters]
                      :comment [:entityId :description :verified]}
   :table            {:runtime [:type :id :name :fields :segments :measures]
                      :comment [:entityId :description :databaseName :schemaName :tableName]}
   :field            {:runtime [:type :name :sourceName :jsType :fieldId :tableId :baseType :effectiveType :defaultTemporalBucket]
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
  {:baseType     "Base type"
   :databaseName "Database"
   :description  "Description"
   :displayName  "Display name"
   :effectiveType "Effective type"
   :entityId     "Entity ID"
   :schemaName   "Schema"
   :semanticType "Semantic type"
   :sourceTable  "Source table"
   :tableName    "Table"
   :unit         "Unit"
   :verified     "Verified"})

(defn- map-key-value
  [m k]
  (some (fn [[entry-key entry-value]]
          (when (= entry-key k)
            entry-value))
        m))

(defn- node-kind
  [path value]
  (when (map? value)
    (let [kind (or (map-key-value value :type)
                   (map-key-value value :kind))]
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

(defn- javascript-key
  [k]
  (let [s (name k)]
    (if (re-matches js-identifier-pattern s)
      s
      (json/encode s))))

(defn- primitive-value?
  [value]
  (or (nil? value)
      (string? value)
      (number? value)
      (true? value)
      (false? value)))

(defn- javascript-reference
  [path]
  {:javascriptReference path})

(defn- javascript-reference?
  [value]
  (and (map? value)
       (string? (map-key-value value :javascriptReference))))

(defn- javascript-property-access
  [k]
  (let [s (name k)]
    (if (re-matches js-identifier-pattern s)
      (str "." s)
      (str "[" (json/encode s) "]"))))

(defn- javascript-reference-path
  [& ks]
  (str (name (first ks))
       (apply str (map javascript-property-access (rest ks)))))

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
  (let [spaces (apply str (repeat indent " "))]
    (for [k (policy-comment-keys kind value entry-key)
          :let [v (comment-value (get value k))]
          :when (not (str/blank? v))]
      (str spaces "// " (get comment-labels k (name k)) ": " (str/replace v #"\R+" " ")))))

(declare render-javascript-value)

(defn- render-javascript-entry
  [indent path k value]
  (let [kind     (node-kind (conj path k) value)
        comments (comment-lines indent kind value k)
        spaces   (apply str (repeat indent " "))]
    (str (when (seq comments)
           (str (str/join "\n" comments) "\n"))
         spaces
         (javascript-key k)
         ": "
         (render-javascript-value value indent (conj path k)))))

(defn- render-javascript-map
  [value indent path]
  (let [kind    (node-kind path value)
        entries (->> (policy-runtime-keys kind value)
                     (map (fn [k] (render-javascript-entry (+ indent 2) path k (get value k)))))]
    (if (seq entries)
      (str "{\n" (str/join ",\n" entries) "\n" (apply str (repeat indent " ")) "}")
      "{ }")))

(defn- render-javascript-vector
  [value indent path]
  (cond
    (empty? value)
    "[ ]"

    (every? primitive-value? value)
    (str "[ " (str/join ", " (map json/encode value)) " ]")

    :else
    (let [entries (map-indexed
                   (fn [i item]
                     (let [kind     (node-kind (conj path i) item)
                           comments (comment-lines (+ indent 2) kind item nil)
                           spaces   (apply str (repeat (+ indent 2) " "))]
                       (str (when (seq comments)
                              (str (str/join "\n" comments) "\n"))
                            spaces
                            (render-javascript-value item (+ indent 2) (conj path i)))))
                   value)]
      (str "[\n" (str/join ",\n" entries) "\n" (apply str (repeat indent " ")) "]"))))

(defn- render-javascript-value
  [value indent path]
  (cond
    (javascript-reference? value) (map-key-value value :javascriptReference)
    (map? value)    (render-javascript-map value indent path)
    (vector? value) (render-javascript-vector value indent path)
    (seq? value)    (render-javascript-vector (vec value) indent path)
    :else           (json/encode value)))

(defn- table-fields-reference-lookup
  [schema]
  (into {}
        (for [[table-key {:keys [id]}] (:tables schema)
              :when (integer? id)]
          [id {:key       table-key
               :reference (javascript-reference-path :tables table-key :fields)}])))

(defn- table-field-key-lookup
  [schema]
  (into {}
        (mapcat (fn [[table-key {:keys [id fields]}]]
                  (when (integer? id)
                    (mapcat (fn [[field-key {:keys [fieldId name]}]]
                              (cond-> []
                                (integer? fieldId) (conj [[id fieldId] {:table-key table-key
                                                                        :field-key field-key}])
                                (string? name)     (conj [[id name] {:table-key table-key
                                                                     :field-key field-key}])))
                            fields)))
                (:tables schema))))

(defn- javascript-string-vector
  [values]
  (str "[ " (str/join ", " (map json/encode values)) " ]"))

(defn- pick-fields-call
  ([fields-reference field-keys]
   (pick-fields-call fields-reference field-keys nil))
  ([fields-reference field-keys source-field-id]
   (str "pickFields(" fields-reference ", " (javascript-string-vector field-keys)
        (when (integer? source-field-id)
          (str ", { sourceFieldId: " source-field-id " }"))
        ")")))

(defn- dimension-group-output-key
  [table-key source-field-id table-key-count]
  (if (= 1 (get table-key-count table-key))
    table-key
    (str table-key "Via" source-field-id)))

(defn- compact-metric-dimension-fields
  [fields-reference-by-table field-key-by-table-and-field dimensions]
  (let [fields-by-group (reduce (fn [acc [_ {:keys [tableId fieldId name sourceFieldId]}]]
                                  (if-let [{:keys [key reference]} (get fields-reference-by-table tableId)]
                                    (if-let [{:keys [field-key]} (or (get field-key-by-table-and-field [tableId fieldId])
                                                                     (get field-key-by-table-and-field [tableId name]))]
                                      (let [group-key [key sourceFieldId]]
                                        (update acc group-key
                                                (fnil (fn [group]
                                                        (update group :field-keys conj field-key))
                                                      {:table-key       key
                                                       :reference       reference
                                                       :field-keys      []
                                                       :source-field-id sourceFieldId})))
                                      acc)
                                    acc))
                                (array-map)
                                dimensions)
        table-key-count (frequencies (map (comp :table-key val) fields-by-group))]
    (not-empty
     (reduce-kv (fn [acc _ {:keys [table-key reference field-keys source-field-id]}]
                  (assoc acc
                         (dimension-group-output-key table-key source-field-id table-key-count)
                         (javascript-reference (pick-fields-call reference
                                                                 (distinct field-keys)
                                                                 source-field-id))))
                (array-map)
                fields-by-group))))

(defn- compact-metric-dimension-keys
  [fields-reference-by-table field-key-by-table-and-field dimensions]
  (->> dimensions
       (keep (fn [[dimension-key {:keys [tableId fieldId name]}]]
               (when (and (contains? fields-reference-by-table tableId)
                          (or (get field-key-by-table-and-field [tableId fieldId])
                              (get field-key-by-table-and-field [tableId name])))
                 dimension-key)))
       set))

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
  (let [fields-reference-by-table      (table-fields-reference-lookup schema)
        field-key-by-table-and-field  (table-field-key-lookup schema)]
    (update schema :metrics
            (fn [metrics]
              (update-vals metrics
                           (fn [metric]
                             (let [dimensions     (:dimensions metric)
                                   compact-fields (compact-metric-dimension-fields fields-reference-by-table
                                                                                   field-key-by-table-and-field
                                                                                   dimensions)
                                   compact-keys   (compact-metric-dimension-keys fields-reference-by-table
                                                                                 field-key-by-table-and-field
                                                                                 dimensions)
                                   raw-fields     (raw-metric-dimension-fields dimensions compact-keys compact-fields)
                                   compact-dimensions (not-empty (merge raw-fields compact-fields))]
                               (cond-> (dissoc metric :dimensions)
                                 compact-dimensions (assoc :dimensions compact-dimensions)))))))))

(defn- render-top-level-const
  [k value suffix]
  (str "const " (name k) " = " (render-javascript-value value 0 [k]) suffix ";\n\n"))

(defn- render-pick-fields-helper
  [suffix]
  (let [lines (fn [& lines]
                (str (str/join "\n" lines) "\n\n"))
        body  ["  return Object.fromEntries(keys.map((key) => {"
               "    if (options?.sourceFieldId == null) {"
               "      return [key, fields[key]];"
               "    }"
               "    const { tableId, ...joinedField } = fields[key];"
               ""
               "    return [key, { ...joinedField, sourceFieldId: options.sourceFieldId }];"
               "  }));"]]
    (if (= suffix " as const")
      (apply lines
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
             "}")
      (apply lines
             "function pickFields(fields, keys, options) {"
             (conj body "}")))))

(defn- uses-pick-fields-helper?
  [schema]
  (boolean (some (comp seq :dimensions) (vals (:metrics schema)))))

(defn- render-schema-module
  [schema suffix]
  (let [schema          (compact-metric-dimensions schema)
        top-level-keys  [:questions :models :tables :metrics]
        schema-metadata (apply dissoc schema top-level-keys)
        schema-value    (reduce (fn [acc k]
                                  (if (contains? schema k)
                                    (assoc acc k (javascript-reference (name k)))
                                    acc))
                                schema-metadata
                                top-level-keys)]
    (str (when (uses-pick-fields-helper? schema)
           (render-pick-fields-helper suffix))
         (apply str
                (for [k top-level-keys
                      :when (contains? schema k)]
                  (render-top-level-const k (get schema k) suffix)))
         "const schema = " (render-javascript-value schema-value 0 []) suffix ";\n\n"
         "export default schema;\n")))

(defn render-javascript
  "Renders a typed schema as a JavaScript module."
  [schema]
  (render-schema-module schema ""))

(defn render-typescript
  "Renders a typed schema as a TypeScript module with `as const` values."
  [schema]
  (render-schema-module schema " as const"))
