(ns metabase.typed-schemas.api.schema.metric
  "Typed schema generation for metrics and metric dimensions."
  (:require
   [medley.core :as m]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.common :as common]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [metabase.typed-schemas.api.schema.table :as schema.table]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- metric-result-column
  "Returns the metric aggregation result column inferred by Lib."
  [card]
  (schema.common/aggregation-result-column (:database_id card) (:dataset_query card)))

(defn- metric-details
  "Returns metric details with queryable dimensions for schema generation."
  [card]
  (-> (entity-details/get-metric-details {:metric-id                       (:id card)
                                          ;; The typed schema does not use the default temporal dimension.
                                          :with-default-temporal-breakout? false
                                          :with-field-values?              false
                                          :with-queryable-dimensions?      true
                                          :with-segments?                  false})
      :structured-output))

(defn- persisted-dimension->column
  "Converts persisted metric dimensions to column-shaped maps.

  Persisted metric dimensions use kebab-case field/type keys, while [[common/column-schema]] expects
  result-column-style snake_case keys."
  [dimension]
  (let [field-id (some-> dimension :sources first :field-id)]
    {:name           (:name dimension)
     :display_name   (:display-name dimension)
     :base_type      (some-> (:effective-type dimension) u/qualified-name)
     :effective_type (some-> (:effective-type dimension) u/qualified-name)
     :semantic_type  (some-> (:semantic-type dimension) u/qualified-name)
     :field_id       field-id}))

(defn- dimension-field-id
  "Returns the field id backing a metric dimension, including persisted dimension sources."
  [{:keys [field_id] :as dimension}]
  (or field_id (some-> dimension :sources first :field-id)))

(defn- dimension-table-id
  "Returns the table id that backs a metric dimension, when known."
  ([dimension]
   (dimension-table-id dimension nil))
  ([dimension field-table-ids]
   (or (:table_id dimension)
       (:table-id dimension)
       (if field-table-ids
         (get field-table-ids (dimension-field-id dimension))
         (schema.table/table-by-field-id (dimension-field-id dimension))))))

(defn- field-table-ids
  "Returns backing table ids for dimensions that need field-based resolution."
  [dimensions]
  (let [field-ids (into #{}
                        (comp (remove #(or (:table_id %) (:table-id %)))
                              (keep dimension-field-id))
                        dimensions)]
    (when (seq field-ids)
      (into {}
            (map (juxt :id :table_id))
            (t2/select [:model/Field :id :table_id] :id [:in field-ids])))))

(defn- dimension-schema
  "Returns the schema for a metric dimension."
  ([dimension metric-id]
   (dimension-schema dimension metric-id (dimension-table-id dimension) {} {}))
  ([dimension
    metric-id
    table-id
    table-key-by-id
    table-source-name-by-id]
   (let [field-id     (dimension-field-id dimension)
         dimension-id (or (:id dimension) field-id)
         column       (if (:sources dimension)
                        (persisted-dimension->column dimension)
                        dimension)]
     (m/assoc-some
      (assoc (common/column-schema column)
             :type "column"
             :key (common/generated-key (:name column) dimension-id)
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

(defn- mapping-source-field-id
  "Returns the mapped source field id for a metric dimension mapping."
  [{:keys [target]}]
  (when (and (vector? target)
             (= :field (first target))
             (map? (second target)))
    (let [source-field-id (:source-field (second target))]
      (when (integer? source-field-id)
        source-field-id))))

(defn- enrich-dimensions-with-mappings
  "Adds mapped source field ids to persisted metric dimensions."
  [dimensions dimension-mappings]
  (let [mapping-by-dimension-id (into {} (map (juxt :dimension-id identity)) dimension-mappings)]
    (mapv (fn [{:keys [id] :as dimension}]
            (m/assoc-some dimension
                          :source-field-id (some-> (get mapping-by-dimension-id id)
                                                   mapping-source-field-id)))
          dimensions)))

(defn- sync-and-fetch-metric-dimensions!
  "Syncs and returns persisted metric dimensions with mapping metadata."
  [{:keys [id]}]
  (metrics/sync-dimensions! :metadata/metric id)
  (let [{:keys [dimensions dimension_mappings]} (t2/select-one [:model/Card :dimensions :dimension_mappings] :id id)]
    (enrich-dimensions-with-mappings dimensions dimension_mappings)))

(defn- readable-table-source-rows
  "Returns readable table rows for table-backed metric dimensions."
  [table-ids]
  (when (seq table-ids)
    (->> (t2/select [:model/Table :id :name :display_name] :id [:in table-ids])
         (filter mi/can-read?))))

(defn- table-key-disambiguators
  "Returns table display keys used to disambiguate compacted metric dimensions."
  ([table-ids]
   (table-key-disambiguators table-ids (readable-table-source-rows table-ids)))
  ([_dimension-table-ids table-rows]
   (when (seq table-rows)
     (->> table-rows
          (map (fn [{:keys [id name display_name]}]
                 [id (common/pascal-case (common/generated-key (or display_name name) id))]))
          (into {})))))

(defn- table-source-names
  "Returns table names emitted as metric dimension source names."
  ([table-ids]
   (table-source-names table-ids (readable-table-source-rows table-ids)))
  ([_dimension-table-ids table-rows]
   (when (seq table-rows)
     (->> table-rows
          (map (juxt :id :name))
          (into {})))))

(defn- source-table-schema
  "Returns the metric source table identity from portable table metadata."
  [[database-name schema-name table-name]]
  (when (and database-name table-name)
    {:databaseName database-name
     :schemaName   schema-name
     :tableName    table-name}))

(defn- source-table-reference
  "Returns the metric query source-table reference from either query shape."
  [card]
  (or (get-in card [:dataset_query :query :source-table])
      (get-in card [:dataset_query :stages 0 :source-table])))

(defn- source-table-id
  "Returns the source table id for table-backed metrics."
  [card]
  (let [source-table (source-table-reference card)]
    (when (integer? source-table)
      source-table)))

(defn- source-card-id
  "Returns the source card id for metrics that are based on saved questions."
  [card]
  (or (when-let [source-card (get-in card [:dataset_query :stages 0 :source-card])]
        (when (integer? source-card)
          source-card))
      (let [source-table (source-table-reference card)]
        (when (string? source-table)
          (some->> (re-matches #"card__(\d+)" source-table)
                   second
                   parse-long)))))

(defn- fallback-metric-column
  "Returns a stable fallback column when metric result-column inference fails."
  [{:keys [name]}]
  {:type        "column"
   :name        name
   :displayName name
   :jsType      "unknown"})

(defn- metric-dimensions-with-table-ids
  "Returns metric dimensions paired with their backing table ids, filtering mapped dimensions for card metrics."
  [details source-card-id-value]
  (let [dimensions (or (seq (sync-and-fetch-metric-dimensions! details))
                       (:queryable-dimensions details))
        field-table-ids (field-table-ids dimensions)]
    (cond->> (mapv (fn [dimension]
                     [dimension (dimension-table-id dimension field-table-ids)])
                   dimensions)
      source-card-id-value (remove (fn [[_dimension table-id]]
                                     (integer? table-id))))))

(defn- metric-dimension-schemas
  "Returns dimension schemas and mapped table ids for a metric."
  [metric-id details source-card-id-value]
  (let [dimension-table-id-pairs (metric-dimensions-with-table-ids details source-card-id-value)
        table-ids                (->> dimension-table-id-pairs (keep second) (filter integer?) distinct)
        table-rows               (readable-table-source-rows table-ids)
        table-key-by-id          (table-key-disambiguators table-ids table-rows)
        table-source-name-by-id  (table-source-names table-ids table-rows)
        dimension-schemas        (mapv (fn [[dimension table-id]]
                                         (dimension-schema dimension
                                                           metric-id
                                                           table-id
                                                           table-key-by-id
                                                           table-source-name-by-id))
                                       dimension-table-id-pairs)]
    {:dimension-schemas dimension-schemas
     :mapped-table-ids  (->> dimension-schemas (keep :tableId) distinct sort vec)}))

(defn- metric-schema
  "Returns the schema for a metric and its queryable dimensions."
  [{:keys [id name description verified portable_entity_id base_table_portable_fk] :as details}
   card]
  (let [result-column (or (some-> (metric-result-column card) common/column-schema)
                          (fallback-metric-column details))
        source-card-id-value (source-card-id card)
        {:keys [dimension-schemas mapped-table-ids]} (metric-dimension-schemas id details source-card-id-value)]
    (m/assoc-some
     {:type    "metric"
      :key     (common/generated-key name id)
      :id      id
      :name    name
      :columns [result-column]}
     :databaseId (:database_id card)
     :sourceTableId (source-table-id card)
     :sourceCardId source-card-id-value
     :entityId portable_entity_id
     :description description
     :verified (when verified true)
     :sourceTable (source-table-schema base_table_portable_fk)
     :mappedTableIds (not-empty mapped-table-ids)
     :dimensions (not-empty (common/keyed-map dimension-schemas)))))

(defn metric-schemas
  "Returns metric schemas, with optional database and collection scopes."
  ([database-ids]
   (metric-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (schema.common/select-schema-cards :metric database-ids collection-ids)
         :let [details (metric-details card)]
         :when details]
     (metric-schema details card))))
