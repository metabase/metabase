(ns metabase-enterprise.data-apps.generate.schema.render
  "Converts semantic schema values into the TypeScript AST.

  This is the pure policy stage of the schema pipeline: it decides which
  schema keys become runtime data, which become `/* metadata */` blocks, how
  metric dimensions compact into `pickFields(...)` calls, and which name each
  table and metric is exported under. The output is the
  tagged-vector AST described in [[metabase-enterprise.data-apps.generate.schema.javascript]];
  [[schema->ast]] produces it, and the public
  [[metabase-enterprise.data-apps.generate.schema/render-typescript]] composes it with the
  printer.

  Nothing here touches the database or builds strings: new rendering behavior
  should be expressed as schema -> AST transformation (extend
  [[schema-render-policy]] or emit different nodes), keeping it assertable
  structurally in tests."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.generate.schema.javascript :as schemas.javascript]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;; The rendered schema serves two audiences:
;; - `:runtime` keys are executable data consumed by the Lib.createTestQuery DSL.
;; - `:metadata` keys are emitted as a `/* metadata: {...} */` block inside the
;;   entity for coding agents and humans, preserving useful context without
;;   making the runtime object larger or more ambiguous than the DSL needs.
(def ^:private schema-render-policy
  {:table            {:runtime  [:type :id :name :fields :segments :measures]
                      :metadata [:entityId :description :databaseName :schemaName :tableName]}
   :field            {:runtime  [:type :name :slug :jsType :fieldId :tableId]
                      :metadata [:displayName :description :baseType :effectiveType :semanticType :unit]}
   :segment          {:runtime  [:type :id :tableId :name]
                      :metadata [:entityId :description]}
   :measure          {:runtime  [:type :id :tableId :name :columns]
                      :metadata [:entityId :description]}
   :metric           {:runtime  [:type :id :name :sourceTableId :sourceCardId
                                 :mappedTableIds :columns :dimensions]
                      :metadata [:entityId :description :filters :verified :sourceTable]}
   :metric-dimension {:runtime  [:type :id :fieldId :tableId :sourceFieldId :name :jsType]
                      :metadata [:displayName :description :baseType :effectiveType :semanticType :unit]}
   :column           {:runtime  [:type :name :jsType]
                      :metadata [:displayName :description :baseType :effectiveType :semanticType :unit]}})

;; Nested entity kinds by parent kind and entry key. Map values hold keyed
;; entity maps; sequential values hold entity vectors. Metric `:dimensions` are
;; special-cased in [[entity->node]] because compaction mixes call expressions
;; with nested dimension maps.
(def ^:private entity-children
  {:table    {:fields :field, :segments :segment, :measures :measure}
   :measure  {:columns :column}
   :metric   {:columns :column}})

(defn- policy-runtime-keys
  "Returns the keys that should be emitted as runtime data for a schema node."
  [kind value]
  (filter #(contains? value %)
          (get-in schema-render-policy [kind :runtime])))

(defn- redundant-table-name?
  "Returns true when a table's name would duplicate its object key."
  [entry-key table-name]
  (and (some? entry-key)
       (some? table-name)
       (= (name entry-key) (str table-name))))

(defn- metadata-value
  "Returns `value` as written in a metadata block, or nil when there is nothing to write: a nil or blank value says
  nothing, so a map loses such keys at any depth (a table without a schema has no `schemaName`)."
  [value]
  (cond
    (string? value) (when-not (str/blank? value) value)
    (map? value)    (not-empty (into {} (keep (fn [[k v]] (when-some [v (metadata-value v)] [k v]))) value))
    (coll? value)   (not-empty (into [] (keep metadata-value) value))
    :else           value))

(defn- entity-metadata
  "Returns the metadata-only keys of an entity, in policy order, or nil when it has none."
  [kind value entry-key]
  (not-empty
   (apply array-map
          (mapcat (fn [metadata-key]
                    (when-some [metadata (metadata-value (get value metadata-key))]
                      (when-not (and (= kind :table)
                                     (= metadata-key :tableName)
                                     (redundant-table-name? entry-key metadata))
                        [(name metadata-key) metadata])))
                  (get-in schema-render-policy [kind :metadata])))))

(defn- generic->node
  "Converts a schema value without render policy into an AST expression.

  Values outside the policy table (instance metadata) emit every key and no
  metadata block."
  [value]
  (cond
    (schemas.javascript/expression? value) value
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
          (if-let [metadata (entity-metadata kind entity entry-key)]
            [entry-key {:metadata metadata} (entity->node entity kind)]
            [entry-key (entity->node entity kind)]))))

(defn- entities->arr
  "Converts a sequence of entities of `kind` into an array expression."
  [entities kind]
  (into [:arr]
        (for [entity entities]
          (if-let [metadata (entity-metadata kind entity nil)]
            [:item {:metadata metadata} (entity->node entity kind)]
            (entity->node entity kind)))))

(defn- dimensions->obj
  "Converts compacted metric dimensions into an object expression.

  Compaction leaves a mix of `pickFields(...)` call expressions and grouped raw
  dimension maps under `:dimensions`."
  [dimensions]
  (into [:obj]
        (for [[entry-key group] dimensions]
          [entry-key (if (schemas.javascript/expression? group)
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

;; Names a module can't declare: JavaScript's reserved words, in strict mode and in a module.
(def ^:private reserved-identifiers
  #{"arguments" "await" "break" "case" "catch" "class" "const" "continue" "debugger" "default" "delete" "do" "else"
    "enum" "eval" "export" "extends" "false" "finally" "for" "function" "if" "implements" "import" "in" "instanceof"
    "interface" "let" "new" "null" "package" "private" "protected" "public" "return" "static" "super" "switch" "this"
    "throw" "true" "try" "typeof" "var" "void" "while" "with" "yield"})

;; Top-level sections, in declaration order (a metric reads its tables), and the kind of their entities. Tables also
;; take export names first, as an app's code names them far more often.
(def ^:private section-kinds
  (array-map :tables  :table
             :metrics :metric))

;; The module's own declarations, which no table or metric may shadow.
(def ^:private module-identifiers
  #{"pickFields" "schema"})

;; The characters that [[schemas.javascript/identifier?]] refuses.
(def ^:private non-identifier-chars
  #"[^A-Za-z0-9_$]")

(defn- fallback-export-name
  "Returns the export name of an entity whose key can't be one: its kind, its key without the characters an identifier
  can't hold, and its id (`tableDefault_2`, `metricOrders_7`)."
  [kind entity-key id]
  (str (name kind) (u/capitalize-first-char (str/replace entity-key non-identifier-chars "")) "_" id))

(defn- export-names
  "Returns `{kind {entity-key export-name}}` for the tables and metrics of `schema`. An entity is exported under its key
  when the key is an identifier that isn't reserved and that neither the module nor a table already declares. Every
  other entity is exported under its [[fallback-export-name]], which holds its id, so that adding or removing another
  entity never moves a name to a different one."
  [schema]
  (let [entities (for [[section-key kind]        section-kinds
                       [entity-key {:keys [id]}] (get schema section-key)]
                   [kind entity-key id])
        take-one (fn [{:keys [taken] :as acc} [kind entity-key] candidates]
                   (if-let [export-name (some #(when (and (schemas.javascript/identifier? %)
                                                          (not (contains? reserved-identifiers %))
                                                          (not (contains? taken %)))
                                                 %)
                                              candidates)]
                     (-> acc
                         (update :taken conj export-name)
                         (assoc-in [:names kind entity-key] export-name))
                     acc))
        own-keys (reduce (fn [acc [_ entity-key :as entity]]
                           (take-one acc entity [entity-key]))
                         {:taken module-identifiers
                          :names {}}
                         entities)]
    (:names
     (reduce (fn [acc [kind entity-key id :as entity]]
               (cond-> acc
                 (not (get-in acc [:names kind entity-key]))
                 ;; A key can end in `_<id>` too; while one holds the fallback name, add the id again.
                 (take-one entity (iterate #(str % "_" id) (fallback-export-name kind entity-key id)))))
             own-keys
             entities))))

(defn- table-reference-lookup
  "Returns table-id -> the table's key and a reference to its export, for tables in `schema`."
  [schema table-export-names]
  (into {}
        (for [[table-key {:keys [id]}] (:tables schema)
              :when (integer? id)]
          [id {:key       table-key
               :reference [:ref (get table-export-names table-key)]}])))

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
  "Returns a `pickFields(...)` call expression for compacted metric dimensions, marked pure so that a bundler drops it
  with an unused metric."
  ([table-reference field-keys]
   (pick-fields-call table-reference field-keys nil))
  ([table-reference field-keys source-field-id]
   ;; The call takes the table rather than `orders.fields`: a bundler treats a property read as a possible side
   ;; effect, so an unused metric that reads `orders.fields` keeps the table.
   (cond-> [:call "pickFields" {:pure true}
            table-reference
            (into [:arr] (map (fn [field-key] [:lit field-key])) field-keys)]
     (integer? source-field-id)
     (conj [:obj ["sourceFieldId" [:lit source-field-id]]]))))

(defn- dimension-group-output-key
  "Returns the output key for a compacted dimension group, suffixed by its foreign key's field key when several joins
  reach the same table."
  [table-key source-field-id table-key-count field-key-by-field-id]
  (if (= 1 (get table-key-count table-key))
    table-key
    (str table-key "Via" (if-let [field-key (get field-key-by-field-id source-field-id)]
                           (u/capitalize-first-char field-key)
                           source-field-id))))

(defn- metric-dimension-table-field
  "Returns table field metadata when a metric dimension can be represented by `pickFields(...)`."
  [table-reference-by-id field-key-by-table-and-field {:keys [tableId fieldId name sourceFieldId]}]
  (when-let [{table-key :key, :keys [reference]} (get table-reference-by-id tableId)]
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
  [table-reference-by-id field-key-by-table-and-field dimensions]
  (let [{:keys [fields-by-group dimension-keys]}
        (reduce (fn [acc [dimension-key dimension]]
                  (if-let [field (metric-dimension-table-field table-reference-by-id
                                                               field-key-by-table-and-field
                                                               dimension)]
                    (-> acc
                        (update :fields-by-group add-compact-metric-dimension-field field)
                        (update :dimension-keys conj dimension-key))
                    acc))
                {:dimension-keys  #{}
                 :fields-by-group (array-map)}
                dimensions)
        table-key-count (frequencies (map (comp :table-key val) fields-by-group))
        field-key-by-field-id (into {}
                                    (keep (fn [[[_table-id field-id-or-name] {:keys [field-key]}]]
                                            (when (integer? field-id-or-name)
                                              [field-id-or-name field-key])))
                                    field-key-by-table-and-field)]
    {:dimension-keys dimension-keys
     :fields         (not-empty
                      (reduce-kv (fn [acc _ {:keys [table-key reference field-keys source-field-id]}]
                                   (assoc acc
                                          (dimension-group-output-key table-key source-field-id table-key-count
                                                                      field-key-by-field-id)
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
  (when-let [raw-fields (not-empty (apply dissoc dimensions compact-keys))]
    (let [group-key (if (contains? compact-fields "fields")
                      "metricFields"
                      "fields")]
      {group-key raw-fields})))

(defn- compact-metric-dimensions
  "Rewrites metric dimensions into compact field references where possible, reaching each table by its name in
  `table-export-names`."
  [schema table-export-names]
  (let [table-reference-by-id        (table-reference-lookup schema table-export-names)
        field-key-by-table-and-field (table-field-key-lookup schema)]
    (update schema :metrics
            (fn [metrics]
              (update-vals metrics
                           (fn [metric]
                             (let [dimensions     (:dimensions metric)
                                   compact-fields (compact-metric-dimension-fields table-reference-by-id
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
                   "  table: { fields: TFields },"
                   "  keys: readonly TKey[],"
                   "  options?: { sourceFieldId?: number },"
                   "): Pick<TFields, TKey> {"
                   "  return Object.fromEntries(keys.map((key) => {"
                   "    const field = table.fields[key] as { tableId?: number };"
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
           (some schemas.javascript/call? (vals (:dimensions metric))))
         (vals (:metrics schema)))))

(defn schema->ast
  "Converts a semantic schema value into a TypeScript module AST.

  Each table and metric becomes its own exported `const`, so an app's bundle can leave out the ones it doesn't import.
  The exported `schema` const holds them under their keys, with the remaining schema metadata."
  [schema]
  (let [export-names    (export-names schema)
        schema          (compact-metric-dimensions schema (:table export-names))
        present-keys    (filter #(contains? schema %) (keys section-kinds))
        schema-metadata (apply dissoc schema (keys section-kinds))
        schema-entries  (concat (for [[entry-key value] schema-metadata]
                                  [entry-key (generic->node value)])
                                (for [section-key present-keys
                                      :let [kind (section-kinds section-key)]]
                                  [section-key (into [:obj]
                                                     (for [entity-key (keys (get schema section-key))]
                                                       [entity-key [:ref (get-in export-names [kind entity-key])]]))]))]
    (into [:module]
          (concat
           (when (uses-pick-fields-helper? schema)
             [pick-fields-helper])
           (for [section-key         present-keys
                 :let [kind (section-kinds section-key)]
                 [entity-key entity] (get schema section-key)
                 :let [metadata (entity-metadata kind entity entity-key)]]
             [:const (get-in export-names [kind entity-key])
              (cond-> {:export true} metadata (assoc :metadata metadata))
              (entity->node entity kind)])
           [[:const "schema" {:export true} (into [:obj] schema-entries)]]))))
