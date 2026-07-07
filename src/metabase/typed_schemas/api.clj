(ns metabase.typed-schemas.api
  "/api/typed-schemas endpoints."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private javascript-response-headers
  {"Content-Type"                 "text/javascript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(def ^:private typescript-response-headers
  (assoc javascript-response-headers "Content-Type" "text/typescript; charset=utf-8"))

(def ^:private js-identifier-pattern
  #"[A-Za-z_$][A-Za-z0-9_$]*")

(def ^:private schema-render-policy
  {:question         {:runtime [:kind :id :name :display :columns :parameters]
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
   :column           {:runtime [:name :jsType]
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

(defn- js-type
  [{:keys [type base_type effective_type] :as _column}]
  (case type
    :number   "number"
    :boolean  "boolean"
    :string   "string"
    :date     "Date"
    :datetime "Date"
    :time     "Date"
    (let [schema-type (or effective_type base_type)]
      (cond
        (some-> schema-type (str/includes? "Boolean")) "boolean"
        (some-> schema-type (str/includes? "Number"))  "number"
        (some-> schema-type (str/includes? "Integer")) "number"
        (some-> schema-type (str/includes? "Float"))   "number"
        (some-> schema-type (str/includes? "Decimal")) "number"
        (some-> schema-type (str/includes? "Date"))    "Date"
        (some-> schema-type (str/includes? "Time"))    "Date"
        (some-> schema-type (str/includes? "Text"))    "string"
        (some-> schema-type (str/includes? "UUID"))    "string"
        :else                                          "unknown"))))

(defn- assoc-some
  [m & kvs]
  (reduce (fn [m [k v]]
            (cond-> m
              (some? v) (assoc k v)))
          m
          (partition 2 kvs)))

(defn- column-schema
  [{:keys [name display_name base_type effective_type semantic_type description unit] :as column}]
  (let [effective-type (or effective_type base_type)]
    (assoc-some
     {:name        name
      :displayName (or display_name name)
      :jsType      (js-type column)}
     :baseType base_type
     :effectiveType (when (not= effective-type base_type) effective-type)
     :semanticType semantic_type
     :description description
     :unit unit)))

(defn- generated-key
  [entity-name id]
  (let [k (some-> entity-name u/->camelCaseEn)]
    (if (str/blank? k)
      (str "entity" id)
      k)))

(defn- pascal-case
  [s]
  (when-not (str/blank? s)
    (str (u/upper-case-en (subs s 0 1))
         (subs s 1))))

(defn- keyed-map
  [entities]
  (let [entities          (vec entities)
        base-key->count   (frequencies (map :key entities))
        duplicate-key?    (fn [base-key]
                            (> (get base-key->count base-key 0) 1))
        candidate-key     (fn [entity]
                            (let [base-key (:key entity)]
                              (if-not (duplicate-key? base-key)
                                base-key
                                (str base-key (or (:keyDisambiguator entity)
                                                  (:tableId entity)
                                                  (:id entity))))))
        candidate->count  (frequencies (map candidate-key entities))
        disambiguated-key (fn [entity]
                            (let [candidate (candidate-key entity)]
                              (if (= 1 (get candidate->count candidate))
                                candidate
                                (str candidate (:id entity)))))]
    (reduce (fn [m entity]
              (let [key (disambiguated-key entity)]
                (assoc m key (-> entity
                                 (dissoc :keyDisambiguator)
                                 (assoc :key key)))))
            (sorted-map)
            entities)))

(defn- query-param
  [query-params k]
  (or (get query-params k)
      (get query-params (name k))))

(defn- truthy-query-param?
  [v]
  (contains? #{true "true" "1"} v))

(def ^:private library-data-entity-id
  "librarylibrarydatadat")

(def ^:private library-metrics-entity-id
  "librarylibrarymetrics")

(defn- query-database-value
  [query-params]
  (some-> (or (query-param query-params :database)
              (query-param query-params :database-name))
          str/trim
          not-empty))

(defn- parse-id
  [s]
  (try
    (Long/parseLong s)
    (catch NumberFormatException _
      nil)))

(defn- database-ids-for-value
  [database-value]
  (when database-value
    (let [database-id (parse-id database-value)]
      (->> (if database-id
             (t2/select :model/Database :id database-id)
             (t2/select :model/Database :name database-value))
           (filter mi/can-read?)
           (map :id)
           set))))

(defn- database-id-filter-clause
  [database-ids column]
  (when database-ids
    (if (seq database-ids)
      [:in column database-ids]
      [:= column -1])))

(defn- id-filter-clause
  [ids column]
  (when ids
    (if (seq ids)
      [:in column ids]
      [:= column -1])))

(defn- query-library-value
  [query-params]
  (some-> (query-param query-params :library)
          str/trim
          not-empty))

(defn- query-comma-separated-values
  [query-params ks]
  (when-let [value (some-> (->> ks
                                (keep #(query-param query-params %))
                                first)
                           str/trim
                           not-empty)]
    (->> (str/split value #",")
         (map str/trim)
         (remove str/blank?)
         seq)))

(defn- query-library-collection-values
  [query-params]
  (query-comma-separated-values query-params [:library-collections
                                              :libraryCollections
                                              :collections]))

(defn- query-include-data-library?
  [query-params]
  (truthy-query-param? (or (query-param query-params :include-data-library)
                           (query-param query-params :includeDataLibrary))))

(defn- query-include-metric-library?
  [query-params]
  (truthy-query-param? (or (query-param query-params :include-metric-library)
                           (query-param query-params :includeMetricLibrary))))

(defn- query-question-collection-values
  [query-params]
  (query-comma-separated-values query-params [:question-collections
                                              :questionCollections]))

(defn- library-collection-for-value
  [library-value]
  (when library-value
    (let [collection-id (parse-id library-value)]
      (->> (if collection-id
             (t2/select :model/Collection :id collection-id)
             (t2/select :model/Collection :name library-value))
           (filter #(contains? collection/library-collection-types (:type %)))
           (filter mi/can-read?)
           first))))

(defn- library-collection-for-ref
  [collection-value]
  (let [collection-id (parse-id collection-value)]
    (->> (if collection-id
           (t2/select :model/Collection :id collection-id)
           (t2/select :model/Collection :entity_id collection-value))
         (filter #(contains? collection/library-collection-types (:type %)))
         (filter mi/can-read?)
         first)))

(defn- library-collection-for-entity-id
  [entity-id]
  (->> (t2/select :model/Collection :entity_id entity-id)
       (filter #(contains? collection/library-collection-types (:type %)))
       (filter mi/can-read?)
       first))

(defn- collection-for-ref
  [collection-value]
  (let [collection-id (parse-id collection-value)]
    (->> (if collection-id
           (t2/select :model/Collection :id collection-id)
           (t2/select :model/Collection :entity_id collection-value))
         (filter mi/can-read?)
         first)))

(defn- collection-scope
  [collection-values]
  (when (seq collection-values)
    (let [collections (for [collection-value collection-values]
                        (or (collection-for-ref collection-value)
                            (api/check-404 false)))]
      (->> collections
           (mapcat #(cons % (collection/descendants-flat %)))
           (map :id)
           set))))

(defn- library-collection-scope*
  [library-collections]
  (let [ids          (->> library-collections
                          (mapcat #(cons % (collection/descendants-flat %)))
                          (map :id)
                          set)
        rows         (t2/select [:model/Collection :id :type] :id [:in ids])
        ids-for-type (fn [collection-type]
                       (->> rows
                            (filter #(= (:type %) collection-type))
                            (map :id)
                            set))]
    {:library-collections  library-collections
     :collection-ids        ids
     :data-collection-ids   (ids-for-type collection/library-data-collection-type)
     :metric-collection-ids (ids-for-type collection/library-metrics-collection-type)}))

(defn- library-collection-scope
  [library-value]
  (when library-value
    (let [library (or (library-collection-for-value library-value)
                      (api/check-404 false))]
      (library-collection-scope* [library]))))

(defn- library-collections-scope
  [collection-values]
  (when (seq collection-values)
    (let [collections (for [collection-value collection-values]
                        (or (library-collection-for-ref collection-value)
                            (api/check-404 false)))]
      (library-collection-scope* collections))))

(defn- included-library-root-collections
  [query-params]
  (keep (fn [[include? entity-id]]
          (when include?
            (or (library-collection-for-entity-id entity-id)
                (api/check-404 false))))
        [[(query-include-data-library? query-params) library-data-entity-id]
         [(query-include-metric-library? query-params) library-metrics-entity-id]]))

(defn- library-scope
  [query-params]
  (let [library-value             (query-library-value query-params)
        library-collection-values (query-library-collection-values query-params)
        included-roots            (included-library-root-collections query-params)
        collection-scope          (cond
                                    library-value
                                    (library-collection-scope library-value)

                                    library-collection-values
                                    (library-collections-scope library-collection-values))]
    (cond
      (and collection-scope (seq included-roots))
      (library-collection-scope* (concat (:library-collections collection-scope) included-roots))

      (seq included-roots)
      (library-collection-scope* included-roots)

      :else
      collection-scope)))

(defn- select-cards
  ([card-type database-ids]
   (select-cards card-type database-ids nil))
  ([card-type database-ids collection-ids]
   (->> (t2/select :model/Card
                   {:where    (cond-> [:and
                                       [:= :type (name card-type)]
                                       [:= :archived false]
                                       (collection/visible-collection-filter-clause :collection_id)]
                                database-ids (conj (database-id-filter-clause database-ids :database_id))
                                collection-ids (conj (id-filter-clause collection-ids :collection_id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

(defn- question-details
  [card]
  (-> (entity-details/get-report-details {:report-id             (:id card)
                                          :with-field-values?    false
                                          :with-related-tables?  false
                                          :with-metrics?         false
                                          :with-measures?        false
                                          :with-segments?        false})
      :structured-output))

(defn- metric-result-column
  [card]
  (try
    (let [mp    (lib-be/application-database-metadata-provider (:database_id card))
          query (lib/query mp (:dataset_query card))
          col   (->> (lib/returned-columns query)
                     (filter #(= (:lib/source %) :source/aggregations))
                     first)]
      (when col
        (metabot.tools.u/->result-column query col)))
    (catch Exception _
      nil)))

(defn- metric-details
  [card]
  (-> (entity-details/get-metric-details {:metric-id                       (:id card)
                                          :with-default-temporal-breakout? true
                                          :with-field-values?              false
                                          :with-queryable-dimensions?      true
                                          :with-segments?                  false})
      :structured-output))

(defn- question-schema
  [{:keys [id name description verified display result-columns portable_entity_id]}]
  (assoc-some
   {:kind    "question"
    :key     (generated-key name id)
    :id      id
    :name    name
    :display display
    :columns (mapv column-schema result-columns)}
   :entityId portable_entity_id
   :description description
   :verified (when verified true)))

(defn- ->keyword
  "Coerces strings or keywords into a keyword for uniform type inspection."
  [v]
  (cond
    (keyword? v) v
    (string? v)  (keyword v)
    :else        nil))

(defn- param-type->js-type
  "Maps a Metabase parameter type (`:number`, `:string/=`, `:date/single`,
  `:=`, `:id`, …) to a JS-level type matching [[js-type]]'s convention.
  Returns nil for ambiguous types (`:=`, `:id`, `:category`, …) so the
  caller can fall back to other type sources like a backing template-tag."
  [param-type]
  (when-let [k (->keyword param-type)]
    (let [prefix (or (namespace k) (name k))]
      (case prefix
        ("number" "numeric") "number"
        ("text" "string")    "string"
        "date"               "Date"
        "boolean"            "boolean"
        nil))))

(defn- template-tag-name-from-target
  "Extracts the template-tag name from a parameter's `:target`.
  Target shape: `[:variable [:template-tag <name>]]` (with keywords or strings
  at any position depending on serialization)."
  [target]
  (when (sequential? target)
    (let [[op inner] target]
      (when (and (or (= op :variable) (= op "variable"))
                 (sequential? inner))
        (let [[tag-op tag-name] inner]
          (when (or (= tag-op :template-tag) (= tag-op "template-tag"))
            (cond
              (string? tag-name)  tag-name
              (keyword? tag-name) (clojure.core/name tag-name)
              :else               nil)))))))

(defn- query-action-template-tag-types
  "For a query action, builds `{template-tag-name → tag-type}` from the
  saved `dataset_query`. Empty for non-query actions and for actions
  without a native query stage."
  [{:keys [type dataset_query]}]
  (when (and (= (->keyword type) :query) dataset_query)
    (let [stage-tags (some-> dataset_query :stages first :template-tags)
          native-tags (some-> dataset_query :native :template-tags)
          tags (or stage-tags native-tags)]
      (into {}
            (for [[tag-key tag] tags]
              [(or (:name tag)
                   (cond
                     (string? tag-key)  tag-key
                     (keyword? tag-key) (clojure.core/name tag-key)
                     :else              nil))
               (:type tag)])))))

(defn- action-parameter-schema
  "Each parameter on an Action. The `:slug` is the key the bundle uses in the
  execute payload (`execute({ <slug>: value, … })`). For implicit actions the
  slug is `(slugify column-name)`; for custom (query) actions it's whatever
  the user assigned."
  [tag-types
   {:keys [id slug name display-name type target required]}]
  (let [resolved-slug (or slug
                          (some-> id clojure.core/name)
                          (some-> name u/slugify))
        resolved-type (or (param-type->js-type type)
                          (param-type->js-type
                           (get tag-types
                                (template-tag-name-from-target target)))
                          "unknown")]
    (assoc-some
     {:slug resolved-slug
      :displayName (or display-name name resolved-slug)
      :jsType resolved-type}
     :required (when required true))))

(defn- action-schema
  "A pre-existing Metabase action. HTTP actions are filtered upstream because
  the execute endpoint refuses to run them.

  `model-columns` is the parent model's column-schema list (already rendered
  by [[column-schema]]). It is NOT re-attached to the action — the action is
  keyed under its model in the typed schema, so callers can reach the row
  shape via `schema.models.<m>.columns` directly. The TS helper
  `ActionResult<TAction, TModel>` threads that into the `row/create`
  response shape."
  [_model-columns
   {:keys [id name description type kind parameters entity_id] :as action}]
  (let [tag-types (query-action-template-tag-types action)
        implicit? (= (->keyword type) :implicit)]
    (assoc-some
     {:kind       "action"
      :key        (generated-key name id)
      :id         id
      :name       name
      :type       (some-> type clojure.core/name)
      :parameters (mapv #(action-parameter-schema tag-types %) parameters)}
     :description description
     :entityId entity_id
     :implicitKind (when implicit?
                     (some-> kind ->keyword u/qualified-name)))))

(defn- model-actions
  "Fetches non-archived, non-HTTP actions for a single model and emits each
  in schema form. Returns nil when the model has no executable actions, so
  `assoc-some` drops the empty `:actions` field. `model-columns` is the
  parent model's already-rendered column schemas, passed through to
  implicit actions for response-row typing."
  [model-id model-columns]
  (let [actions (actions/select-actions
                 nil
                 :model_id model-id
                 :archived false
                 :type [:not= "http"])]
    (when (seq actions)
      (mapv #(action-schema model-columns %) actions))))

(defn- model-schema
  "A Metabase model (curated dataset). Shape parallels [[question-schema]] —
  same id/name/columns/etc. — but with `:kind \"model\"` and an extra
  `:actions` map of pre-existing actions bound to the model
  (`action.model_id`)."
  [{:keys [id name description verified display result-columns portable_entity_id]}]
  (let [columns (mapv column-schema result-columns)
        action-schemas (model-actions id columns)]
    (assoc-some
     {:kind    "model"
      :key     (generated-key name id)
      :id      id
      :name    name
      :columns columns}
     :display display
     :entityId portable_entity_id
     :description description
     :verified (when verified true)
     :actions (some-> action-schemas not-empty keyed-map))))

(defn- persisted-dimension->column
  [dimension]
  (let [field-id (some-> dimension :sources first :field-id)]
    {:name           (:name dimension)
     :display_name   (:display-name dimension)
     :base_type      (some-> (:effective-type dimension) u/qualified-name)
     :effective_type (some-> (:effective-type dimension) u/qualified-name)
     :semantic_type  (some-> (:semantic-type dimension) u/qualified-name)
     :field_id       field-id}))

(defn- field-table-id
  [field-id]
  (when (integer? field-id)
    (t2/select-one-fn :table_id :model/Field :id field-id)))

(defn- dimension-schema
  ([dimension metric-id]
   (dimension-schema dimension metric-id {}))
  ([dimension metric-id table-key-by-id]
   (dimension-schema dimension metric-id table-key-by-id {}))
  ([{:keys [field_id] :as dimension}
    metric-id
    table-key-by-id
    table-source-name-by-id]
   (let [dimension-id (or (:id dimension) field_id)
         field-id     (or field_id (some-> dimension :sources first :field-id))
         table-id     (or (:table_id dimension) (:table-id dimension) (field-table-id field-id))
         column       (if (:sources dimension)
                        (persisted-dimension->column dimension)
                        dimension)]
     (assoc-some
      (assoc (column-schema column)
             :type "column"
             :key (generated-key (:name column) dimension-id)
             :id (str dimension-id))
      :sourceName (when (integer? table-id)
                    (get table-source-name-by-id table-id))
      :fieldId (when (integer? field-id) field-id)
      :tableId (when (integer? table-id) table-id)
      :sourceFieldId (when (integer? (:source-field-id dimension))
                       (:source-field-id dimension))
      :metricId metric-id
      :keyDisambiguator (when (integer? table-id)
                          (get table-key-by-id table-id))))))

(defn- field-schema
  ([field]
   (field-schema field nil))
  ([{:keys [id field_id] :as field} source-name]
   (let [field-id (or id field_id)
         table-id (or (:table_id field) (:table-id field) (field-table-id field-id))]
     (assoc-some
      (assoc (column-schema field)
             :type "column"
             :key (generated-key (:name field) field-id)
             :id field-id)
      :sourceName source-name
      :fieldId (when (integer? field-id) field-id)
      :tableId (when (integer? table-id) table-id)
      :defaultTemporalBucket (:unit field)))))

(defn- mapping-source-field-id
  [{:keys [target]}]
  (when (and (vector? target)
             (= :field (first target))
             (map? (second target)))
    (let [source-field-id (:source-field (second target))]
      (when (integer? source-field-id)
        source-field-id))))

(defn- enrich-dimensions-with-mappings
  [dimensions dimension-mappings]
  (let [mapping-by-dimension-id (into {} (map (juxt :dimension-id identity)) dimension-mappings)]
    (mapv (fn [{:keys [id] :as dimension}]
            (assoc-some dimension
                        :source-field-id (some-> (get mapping-by-dimension-id id)
                                                 mapping-source-field-id)))
          dimensions)))

(defn- metric-dimensions
  [{:keys [id]}]
  (metrics/sync-dimensions! :metadata/metric id)
  (let [{:keys [dimensions dimension_mappings]} (t2/select-one [:model/Card :dimensions :dimension_mappings] :id id)]
    (enrich-dimensions-with-mappings dimensions dimension_mappings)))

(defn- readable-table-source-rows
  [table-ids]
  (when (seq table-ids)
    (->> (t2/select [:model/Table :id :name :display_name] :id [:in table-ids])
         (filter mi/can-read?))))

(defn- table-key-disambiguators
  ([table-ids]
   (table-key-disambiguators table-ids (readable-table-source-rows table-ids)))
  ([_table-ids table-rows]
   (when (seq table-rows)
     (->> table-rows
          (map (fn [{:keys [id name display_name]}]
                 [id (pascal-case (generated-key (or display_name name) id))]))
          (into {})))))

(defn- table-source-names
  ([table-ids]
   (table-source-names table-ids (readable-table-source-rows table-ids)))
  ([_table-ids table-rows]
   (when (seq table-rows)
     (->> table-rows
          (map (juxt :id :name))
          (into {})))))

(defn- source-table-schema
  [[database-name schema-name table-name]]
  (when (and database-name table-name)
    {:databaseName database-name
     :schemaName   schema-name
     :tableName    table-name}))

(defn- source-table-id
  [card]
  (let [source-table (or (get-in card [:dataset_query :query :source-table])
                         (get-in card [:dataset_query :stages 0 :source-table]))]
    (when (integer? source-table)
      source-table)))

(defn- source-card-id
  [card]
  (or (when-let [source-card (get-in card [:dataset_query :stages 0 :source-card])]
        (when (integer? source-card)
          source-card))
      (let [source-table (or (get-in card [:dataset_query :query :source-table])
                             (get-in card [:dataset_query :stages 0 :source-table]))]
        (when (string? source-table)
          (some->> (re-matches #"card__(\d+)" source-table)
                   second
                   parse-long)))))

(defn- fallback-metric-column
  [{:keys [name]}]
  {:name          name
   :displayName   name
   :jsType        "unknown"})

(defn- measure-result-column
  [database-id measure-id]
  (try
    (when-let [definition (t2/select-one-fn :definition :model/Measure :id measure-id)]
      (let [mp    (lib-be/application-database-metadata-provider database-id)
            query (lib/query mp definition)
            col   (->> (lib/returned-columns query)
                       (filter #(= (:lib/source %) :source/aggregations))
                       first)]
        (when col
          (metabot.tools.u/->result-column query col))))
    (catch Exception _
      nil)))

(defn- metric-schema
  [{:keys [id name description verified portable_entity_id base_table_portable_fk] :as details}
   card]
  (let [result-column (or (some-> (metric-result-column card) column-schema)
                          (fallback-metric-column details))
        dimensions    (or (seq (metric-dimensions details))
                          (:queryable-dimensions details))
        table-ids     (->> dimensions
                           (keep (fn [{:keys [field_id] :as dimension}]
                                   (let [field-id (or field_id (some-> dimension :sources first :field-id))]
                                     (or (:table_id dimension)
                                         (:table-id dimension)
                                         (field-table-id field-id)))))
                           (filter integer?)
                           distinct)
        table-rows              (readable-table-source-rows table-ids)
        table-key-by-id         (table-key-disambiguators table-ids table-rows)
        table-source-name-by-id (table-source-names table-ids table-rows)
        dimension-schemas (mapv #(dimension-schema % id table-key-by-id table-source-name-by-id)
                                dimensions)
        mapped-table-ids  (->> dimension-schemas
                               (keep :tableId)
                               distinct
                               sort
                               vec)]
    (assoc-some
     {:type       "metric"
      :key        (generated-key name id)
      :id         id
      :name       name
      :columns    [result-column]}
     :databaseId (:database_id card)
     :sourceTableId (source-table-id card)
     :sourceCardId (source-card-id card)
     :entityId portable_entity_id
     :description description
     :verified (when verified true)
     :sourceTable (source-table-schema base_table_portable_fk)
     :mappedTableIds (not-empty mapped-table-ids)
     :dimensions (not-empty (keyed-map dimension-schemas)))))

(defn- select-tables
  ([database-ids]
   (select-tables database-ids nil))
  ([database-ids table-ids]
   (->> (t2/select :model/Table
                   {:where    (cond-> [:and [:= :active true]]
                                database-ids (conj (database-id-filter-clause database-ids :db_id))
                                table-ids (conj (id-filter-clause table-ids :id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

(defn- select-library-tables
  [{:keys [data-collection-ids]}]
  (->> (t2/select :model/Table
                  {:where    [:and
                              [:= :active true]
                              [:= :is_published true]
                              (id-filter-clause data-collection-ids :collection_id)]
                   :order-by [[:name :asc] [:id :asc]]})
       (filter mi/can-read?)))

(defn- segment-schema
  [table-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (assoc-some
   {:type    "segment"
    :key     (generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- measure-schema
  [table-id database-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (assoc-some
   {:type    "measure"
    :key     (generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name
    :columns [(or (some-> (measure-result-column database-id id) column-schema)
                  (fallback-metric-column {:name (or display-name name)}))]}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- table-schema
  [{:keys [id name description display_name database_id database_name database_schema portable_entity_id fields segments measures]}]
  (let [segments-map (keyed-map (map #(segment-schema id %) segments))
        measures-map (keyed-map (map #(measure-schema id database_id %) measures))]
    (assoc-some
     {:type         "table"
      :key          (generated-key (or display_name name) id)
      :id           id
      :name         (or display_name name)
      :databaseName database_name
      :tableName    name
      :fields       (keyed-map (map #(field-schema % name) fields))}
     :entityId portable_entity_id
     :description description
     :schemaName database_schema
     :segments (not-empty segments-map)
     :measures (not-empty measures-map))))

(defn- table-details
  [table]
  (some-> (entity-details/get-table-details
           {:entity-type          :table
            :entity-id            (:id table)
            :with-fields?         true
            :with-field-values?   false
            :with-related-tables? false
            :with-metrics?        false
            :with-measures?       true
            :with-segments?       true})
          :structured-output))

(defn- question-schemas
  ([database-ids]
   (question-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (select-cards :question database-ids collection-ids)
         :let [details (question-details card)]
         :when details]
     (question-schema details))))

(defn- model-schemas
  ([database-ids]
   (model-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (select-cards :model database-ids collection-ids)
         :let [details (question-details card)]
         :when details]
     (model-schema details))))

(defn- metric-schemas
  ([database-ids]
   (metric-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (select-cards :metric database-ids collection-ids)
         :let [details (metric-details card)]
         :when details]
     (metric-schema details card))))

(defn- table-schemas
  [tables]
  (for [table tables
        :let [details (table-details table)]
        :when details]
    (table-schema details)))

(defn- base-schema
  [questions models tables metrics]
  (array-map
   :schemaVersion 2
   :generatedAt   (str (Instant/now))
   :metabase      {:instanceUrl (system/site-url)}
   :questions     (keyed-map questions)
   :models        (keyed-map models)
   :tables        (keyed-map tables)
   :metrics       (keyed-map metrics)))

(defn- validate-query-params!
  [query-params]
  (let [library-value              (query-library-value query-params)
        library-collection-values  (query-library-collection-values query-params)
        question-collection-values (query-question-collection-values query-params)
        include-library-root?      (or (query-include-data-library? query-params)
                                       (query-include-metric-library? query-params))
        collection-scoped?         (or library-value
                                       library-collection-values
                                       question-collection-values
                                       include-library-root?)
        database-value             (query-database-value query-params)
        questions-only             (truthy-query-param? (query-param query-params :questions))]
    (api/check-400
     (not (and library-value (or library-collection-values include-library-root?)))
     "The library query parameter is mutually exclusive with library-collections, includeDataLibrary, and includeMetricLibrary.")
    (api/check-400
     (not (and collection-scoped? database-value))
     "Collection-scoped query parameters and database query parameters are mutually exclusive.")
    (api/check-400
     (not (and collection-scoped? questions-only))
     "Collection-scoped query parameters and the questions query parameter are mutually exclusive.")
    (api/check-400
     (not (and questions-only (nil? database-value)))
     "The questions query parameter requires a database query parameter.")))

(defn- typed-schema-for-library-scope
  [library-scope models]
  (let [{:keys [metric-collection-ids]} library-scope
        metrics               (metric-schemas nil metric-collection-ids)
        mapped-table-ids      (->> metrics (mapcat :mappedTableIds) set)
        library-table-ids     (->> (select-library-tables library-scope) (map :id) set)
        table-ids             (set/union library-table-ids mapped-table-ids)
        tables                (table-schemas (select-tables nil table-ids))]
    (base-schema [] models tables metrics)))

(defn- typed-schema
  [query-params]
  (validate-query-params! query-params)
  (let [library-value              (query-library-value query-params)
        library-collection-values  (query-library-collection-values query-params)
        question-collection-values (query-question-collection-values query-params)
        library-scope              (library-scope query-params)
        database-ids               (database-ids-for-value (query-database-value query-params))
        question-collection-ids    (collection-scope question-collection-values)
        models                     (cond
                                     database-ids
                                     (model-schemas database-ids)

                                     question-collection-ids
                                     (model-schemas nil question-collection-ids)

                                     :else
                                     [])
        questions-only             (truthy-query-param? (query-param query-params :questions))]
    (cond
      (or library-value library-collection-values library-scope question-collection-values)
      (let [questions           (if question-collection-values
                                  (question-schemas nil question-collection-ids)
                                  [])
            library-schema      (some-> library-scope
                                        (typed-schema-for-library-scope models))]
        (base-schema questions
                     models
                     (-> library-schema :tables vals)
                     (-> library-schema :metrics vals)))

      questions-only
      (base-schema (question-schemas database-ids) models [] [])

      :else
      (let [questions (question-schemas database-ids)
            metrics   (metric-schemas database-ids)
            tables    (table-schemas (select-tables database-ids))]
        (base-schema questions models tables metrics)))))

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

(defn- render-javascript
  [schema]
  (render-schema-module schema ""))

(defn- render-typescript
  [schema]
  (render-schema-module schema " as const"))

(api.macros/defendpoint :get "/v1/javascript" :- :any
  "Generate a JavaScript semantic schema module."
  [_route-params query-params _body _request respond _raise]
  (respond {:status  200
            :headers javascript-response-headers
            :body    (render-javascript (typed-schema query-params))}))

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params query-params _body _request respond _raise]
  (respond {:status  200
            :headers typescript-response-headers
            :body    (render-typescript (typed-schema query-params))}))

(api.macros/defendpoint :get "/v1/json" :- :any
  "Generate a JSON semantic schema."
  [_route-params query-params]
  (typed-schema query-params))

(def ^{:arglists '([request respond raise])} routes
  "`/api/typed-schemas/` routes."
  (api.macros/ns-handler *ns*))
