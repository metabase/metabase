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
  "Returns the requested entry without invoking map lookup.

  Some rendered schemas can contain sorted maps with string keys; direct keyword
  lookup can make those maps compare keywords to strings and throw."
  [entries-map entry-key-to-find]
  (some (fn [[entry-key entry-value]]
          (when (= entry-key entry-key-to-find)
            entry-value))
        entries-map))

(defn- node-kind
  "Returns the schema node kind at `path`.

  Most nodes identify themselves with `:type`, but fields/columns are also
  inferred from their position so the renderer can apply the right runtime and
  comment policy."
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
  "Returns the keys that should be emitted as runtime data for a schema node."
  [kind value]
  (let [runtime-keys (get-in schema-render-policy [kind :runtime])]
    (if runtime-keys
      (->> runtime-keys
           (filter #(contains? value %)))
      (keys value))))

(defn- redundant-table-name-comment?
  "Returns true when a table-name comment would duplicate the object key."
  [entry-key table-name]
  (and (some? entry-key)
       (some? table-name)
       (= (name entry-key) (str table-name))))

(defn- policy-comment-keys
  "Returns the keys that should be rendered as context comments for a schema node."
  [kind value entry-key]
  (->> (get-in schema-render-policy [kind :comment])
       (remove #(and (= kind :table)
                     (= % :tableName)
                     (redundant-table-name-comment? entry-key (get value %))))
       (filter #(contains? value %))))

(defn- comment-value
  "Formats a schema value for a single-line JavaScript comment."
  [value]
  (cond
    (nil? value) nil
    (map? value) (->> [(:databaseName value) (:schemaName value) (:tableName value)]
                      (keep identity)
                      (str/join "."))
    :else (str value)))

(defn- comment-lines
  "Returns JavaScript comment lines for context-only schema fields.

  Fields listed under `:comment` in [[schema-render-policy]] are useful context
  for humans and coding agents, but are intentionally omitted from runtime
  objects consumed by the Lib.createTestQuery DSL."
  [indent kind value entry-key]
  (let [prefix (spaces indent)]
    (for [comment-key (policy-comment-keys kind value entry-key)
          :let [comment-text (comment-value (get value comment-key))]
          :when (not (str/blank? comment-text))]
      (str prefix
           "// "
           (get comment-labels comment-key (name comment-key))
           ": "
           (str/replace comment-text #"\R+" " ")))))

(defn- schema-render-options
  "Returns callbacks that adapt typed-schema render policy to [[javascript/render-value]].

  The JavaScript renderer knows how to print Clojure data as JavaScript syntax.
  These callbacks teach it which schema keys are runtime fields and which fields
  should be emitted as nearby context comments."
  []
  {:map-keys       (fn [path value]
                     (policy-runtime-keys (node-kind path value) value))
   :entry-comments (fn [indent path entry-key value]
                     (comment-lines indent (node-kind (conj path entry-key) value) value entry-key))
   :item-comments  (fn [indent path value]
                     (comment-lines indent (node-kind path value) value nil))})

(defn- table-fields-reference-lookup
  "Returns table-id -> JavaScript field-map reference for tables in `schema`."
  [schema]
  (into {}
        (for [[table-key {:keys [id]}] (:tables schema)
              :when (integer? id)]
          [id {:key       table-key
               :reference (javascript/reference-path :tables table-key :fields)}])))

(defn- field-lookup-keys
  "Returns the table-scoped lookup keys that can identify a field."
  [table-id {:keys [fieldId name]}]
  (cond-> []
    (integer? fieldId) (conj [table-id fieldId])
    (string? name)     (conj [table-id name])))

(defn- table-field-key-entries
  "Returns lookup entries that map table/field identity to rendered field keys."
  [table-id table-key fields]
  (for [[field-key field] fields
        lookup-key (field-lookup-keys table-id field)]
    [lookup-key {:table-key table-key
                 :field-key field-key}]))

(defn- table-field-key-lookup
  "Returns [table-id field-id-or-name] -> rendered table/field keys for `schema`."
  [schema]
  (into {}
        (mapcat (fn [[table-key {:keys [id fields]}]]
                  (when (integer? id)
                    (table-field-key-entries id table-key fields))))
        (:tables schema)))

(defn- pick-fields-call
  "Returns a TypeScript `pickFields(...)` call for compacted metric dimensions."
  ([fields-reference field-keys]
   (pick-fields-call fields-reference field-keys nil))
  ([fields-reference field-keys source-field-id]
   (str "pickFields(" fields-reference ", " (javascript/string-vector field-keys)
        (when (integer? source-field-id)
          (str ", { sourceFieldId: " source-field-id " }"))
        ")")))

(defn- dimension-group-output-key
  "Returns the output key for a compacted dimension group.

  Multiple joins to the same table need source-field suffixes to stay distinct."
  [table-key source-field-id table-key-count]
  (if (= 1 (get table-key-count table-key))
    table-key
    (str table-key "Via" source-field-id)))

(defn- metric-dimension-table-field
  "Returns table field metadata when a metric dimension can be represented by `pickFields(...)`."
  [fields-reference-by-table field-key-by-table-and-field {:keys [tableId fieldId name sourceFieldId]}]
  (when-let [{table-key :key, :keys [reference]} (get fields-reference-by-table tableId)]
    (when-let [{:keys [field-key]} (or (get field-key-by-table-and-field [tableId fieldId])
                                       (get field-key-by-table-and-field [tableId name]))]
      {:field-key       field-key
       :reference       reference
       :source-field-id sourceFieldId
       :table-key       table-key})))

(defn- add-compact-metric-dimension-field
  "Adds one matched metric dimension to its table/source-field compaction group."
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
  "Compacts table-backed metric dimensions into grouped JavaScript references.

  Returns both the rendered `:fields` map and the original dimension keys that
  were compacted, so raw dimensions can be preserved without another lookup pass."
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
  "Returns original metric dimension keys represented by compacted fields."
  [compact-fields]
  (:dimension-keys compact-fields))

(defn- raw-metric-dimension-fields
  "Returns non-compacted metric dimensions as raw runtime fields.

  Raw dimensions are kept under `\"fields\"`, or `\"metricFields\"` if compacted
  fields already use `\"fields\"` as their output key."
  [dimensions compact-keys compact-fields]
  (when-let [raw-fields (not-empty (update-vals (apply dissoc dimensions compact-keys)
                                                #(dissoc % :metricId)))]
    (let [group-key (if (contains? compact-fields "fields")
                      "metricFields"
                      "fields")]
      {group-key raw-fields})))

(defn- compact-metric-dimensions
  "Rewrites metric dimensions into compact field references where possible."
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
  "Renders one top-level schema section as a TypeScript `const ... as const`."
  [section-key value]
  (str "const " (u/qualified-name section-key) " = " (javascript/render-value value (assoc (schema-render-options) :path [section-key]))
       const-suffix ";\n\n"))

(defn- render-pick-fields-helper
  "Renders the TypeScript helper used by compacted metric dimensions."
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
  "Returns true when rendered metrics contain `pickFields(...)` references."
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
        schema-value    (reduce (fn [schema-value section-key]
                                  (if (contains? schema section-key)
                                    (assoc schema-value section-key (javascript/reference (name section-key)))
                                    schema-value))
                                schema-metadata
                                top-level-keys)]
    (str (when (uses-pick-fields-helper? schema)
           (render-pick-fields-helper))
         (apply str
                (for [section-key top-level-keys
                      :when (contains? schema section-key)]
                  (render-top-level-const section-key (get schema section-key))))
         "const schema = " (javascript/render-value schema-value (schema-render-options)) const-suffix ";\n\n"
         "export default schema;\n")))
