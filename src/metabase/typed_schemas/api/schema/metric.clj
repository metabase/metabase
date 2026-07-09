(ns metabase.typed-schemas.api.schema.metric
  "Metric schema construction for typed-schema endpoints."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.common :as typed-schemas.common]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [metabase.typed-schemas.api.schema.table :as table]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(defn- persisted-dimension->column
  [dimension]
  (let [field-id (some-> dimension :sources first :field-id)]
    {:name           (:name dimension)
     :display_name   (:display-name dimension)
     :base_type      (some-> (:effective-type dimension) u/qualified-name)
     :effective_type (some-> (:effective-type dimension) u/qualified-name)
     :semantic_type  (some-> (:semantic-type dimension) u/qualified-name)
     :field_id       field-id}))

(defn- dimension-table-id
  [{:keys [field_id] :as dimension}]
  (let [field-id (or field_id (some-> dimension :sources first :field-id))]
    (or (:table_id dimension)
        (:table-id dimension)
        (table/field-table-id field-id))))

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
         table-id     (dimension-table-id dimension)
         column       (if (:sources dimension)
                        (persisted-dimension->column dimension)
                        dimension)]
     (typed-schemas.common/assoc-some
      (assoc (typed-schemas.common/column-schema column)
             :type "column"
             :key (typed-schemas.common/generated-key (:name column) dimension-id)
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
            (typed-schemas.common/assoc-some dimension
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
                 [id (typed-schemas.common/pascal-case (typed-schemas.common/generated-key (or display_name name) id))]))
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

(defn- metric-schema
  [{:keys [id name description verified portable_entity_id base_table_portable_fk] :as details}
   card]
  (let [result-column (or (some-> (metric-result-column card) typed-schemas.common/column-schema)
                          (schema.common/fallback-metric-column details))
        source-card-id-value (source-card-id card)
        dimensions    (cond->> (or (seq (metric-dimensions details))
                                   (:queryable-dimensions details))
                        source-card-id-value (remove (comp integer? dimension-table-id)))
        table-ids     (->> dimensions
                           (keep dimension-table-id)
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
    (typed-schemas.common/assoc-some
     {:type       "metric"
      :key        (typed-schemas.common/generated-key name id)
      :id         id
      :name       name
      :columns    [result-column]}
     :databaseId (:database_id card)
     :sourceTableId (source-table-id card)
     :sourceCardId source-card-id-value
     :entityId portable_entity_id
     :description description
     :verified (when verified true)
     :sourceTable (source-table-schema base_table_portable_fk)
     :mappedTableIds (not-empty mapped-table-ids)
     :dimensions (not-empty (typed-schemas.common/keyed-map dimension-schemas)))))

(defn metric-schemas
  "Returns metric schemas for readable saved metrics."
  ([database-ids]
   (metric-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (schema.common/select-cards :metric database-ids collection-ids)
         :let [details (metric-details card)]
         :when details]
     (metric-schema details card))))
