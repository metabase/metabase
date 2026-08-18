(ns metabase.typed-schemas.render
  "Converts semantic schema values into the TypeScript AST.

  This is the pure policy stage of the typed-schema pipeline: it decides which
  schema keys become runtime data, which become `//` context comments, and how
  metric dimensions compact into `pickFields(...)` calls. The output is the
  tagged-vector AST described in [[metabase.typed-schemas.javascript]];
  [[schema->ast]] produces it, and the public
  [[metabase.typed-schemas.core/render-typescript]] composes it with the
  printer.

  Nothing here touches the database or builds strings: new rendering behavior
  should be expressed as schema -> AST transformation (extend
  [[schema-render-policy]] or emit different nodes), keeping it assertable
  structurally in tests."
  (:require
   [clojure.string :as str]
   [metabase.typed-schemas.javascript :as javascript]))

(set! *warn-on-reflection* true)

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

;; Nested entity kinds by parent kind and entry key. Map values hold keyed
;; entity maps; sequential values hold entity vectors. Metric `:dimensions` are
;; special-cased in [[entity->node]] because compaction mixes call expressions
;; with nested dimension maps.
(def ^:private entity-children
  {:question {:columns :column}
   :table    {:fields :field, :segments :segment, :measures :measure}
   :measure  {:columns :column}
   :metric   {:columns :column}})

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

(defn- policy-runtime-keys
  "Returns the keys that should be emitted as runtime data for a schema node."
  [kind value]
  (filter #(contains? value %)
          (get-in schema-render-policy [kind :runtime])))

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

(defn- entity-comments
  "Returns comment strings for context-only schema fields of an entity.

  Fields listed under `:comment` in [[schema-render-policy]] are useful context
  for humans and coding agents, but are intentionally omitted from runtime
  objects consumed by the Lib.createTestQuery DSL."
  [kind value entry-key]
  (seq (for [comment-key (policy-comment-keys kind value entry-key)
             :let [comment-text (comment-value (get value comment-key))]
             :when (not (str/blank? comment-text))]
         (str (get comment-labels comment-key (name comment-key))
              ": "
              (str/replace comment-text #"\R+" " ")))))

(defn- generic->node
  "Converts a schema value without render policy into an AST expression.

  Values outside the policy table (action namespaces, parameter maps, instance
  metadata) emit every key and no comments."
  [value]
  (cond
    (javascript/expression? value) value
    (map? value)                   (into [:obj] (for [[entry-key entry-value] value]
                                                  [entry-key (generic->node entry-value)]))
    (sequential? value)            (into [:arr] (map generic->node) value)
    :else                          [:lit value]))

(declare entity->node)

(defn- keyed-entities->obj
  "Converts a map of entity key -> entity of `kind` into an object expression."
  [entities kind]
  (into [:obj]
        (for [[entry-key entity] entities]
          (if-let [comments (entity-comments kind entity entry-key)]
            [entry-key {:comments comments} (entity->node entity kind)]
            [entry-key (entity->node entity kind)]))))

(defn- entities->arr
  "Converts a sequence of entities of `kind` into an array expression."
  [entities kind]
  (into [:arr]
        (for [entity entities]
          (if-let [comments (entity-comments kind entity nil)]
            [:item {:comments comments} (entity->node entity kind)]
            (entity->node entity kind)))))

(defn- dimensions->obj
  "Converts compacted metric dimensions into an object expression.

  Compaction leaves a mix of `pickFields(...)` call expressions and grouped raw
  dimension maps under `:dimensions`."
  [dimensions]
  (into [:obj]
        (for [[entry-key group] dimensions]
          [entry-key (if (javascript/expression? group)
                       group
                       (keyed-entities->obj group :metric-dimension))])))

(defn- entity->node
  "Converts one schema entity of `kind` into an object expression, emitting the
  runtime keys chosen by [[schema-render-policy]]."
  [entity kind]
  (into [:obj]
        (for [entry-key (policy-runtime-keys kind entity)
              :let [value      (get entity entry-key)
                    child-kind (get-in entity-children [kind entry-key])]]
          [entry-key
           (cond
             (and (= kind :metric)
                  (= entry-key :dimensions))  (dimensions->obj value)
             (and child-kind (map? value))    (keyed-entities->obj value child-kind)
             (and child-kind
                  (sequential? value))        (entities->arr value child-kind)
             :else                            (generic->node value))])))

(defn- table-fields-reference-lookup
  "Returns table-id -> field-map reference expression for tables in `schema`."
  [schema]
  (into {}
        (for [[table-key {:keys [id]}] (:tables schema)
              :when (integer? id)]
          [id {:key       table-key
               :reference [:ref "tables" table-key "fields"]}])))

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
  "Returns a `pickFields(...)` call expression for compacted metric dimensions."
  ([fields-reference field-keys]
   (pick-fields-call fields-reference field-keys nil))
  ([fields-reference field-keys source-field-id]
   (cond-> [:call "pickFields"
            fields-reference
            (into [:arr] (map (fn [field-key] [:lit field-key])) field-keys)]
     (integer? source-field-id)
     (conj [:obj ["sourceFieldId" [:lit source-field-id]]]))))

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
  "Compacts table-backed metric dimensions into grouped call expressions.

  Returns both the compacted `:fields` map and the original dimension keys that
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
                                          (pick-fields-call reference
                                                            (distinct field-keys)
                                                            source-field-id)))
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

(def ^:private pick-fields-helper
  "The TypeScript helper used by compacted metric dimensions."
  [:raw (str/join "\n"
                  ["function pickFields<TFields extends object, TKey extends keyof TFields>("
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
                   "}"])])

(defn- uses-pick-fields-helper?
  "Returns true when compacted metrics contain `pickFields(...)` expressions."
  [schema]
  (boolean
   (some (fn [metric]
           (some javascript/call? (vals (:dimensions metric))))
         (vals (:metrics schema)))))

(def ^:private top-level-keys
  [:questions :models :tables :metrics])

(defn- section->node
  "Converts one top-level schema section into an object expression."
  [section-key section]
  (case section-key
    :questions (keyed-entities->obj section :question)
    :models    (generic->node section)
    :tables    (keyed-entities->obj section :table)
    :metrics   (keyed-entities->obj section :metric)))

(defn schema->ast
  "Converts a semantic schema value into a TypeScript module AST.

  Each present top-level section becomes its own `const`; the `schema` const
  ties them together with the remaining schema metadata and is exported as the
  module default."
  [schema]
  (let [schema          (compact-metric-dimensions schema)
        present-keys    (filter #(contains? schema %) top-level-keys)
        schema-metadata (apply dissoc schema top-level-keys)
        schema-entries  (concat (for [[entry-key value] schema-metadata]
                                  [entry-key (generic->node value)])
                                (for [section-key present-keys]
                                  [section-key [:ref (name section-key)]]))]
    (into [:module]
          (concat
           (when (uses-pick-fields-helper? schema)
             [pick-fields-helper])
           (for [section-key present-keys]
             [:const (name section-key) (section->node section-key (get schema section-key))])
           [[:const "schema" (into [:obj] schema-entries)]
            [:export-default [:ref "schema"]]]))))
