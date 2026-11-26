(ns metabase-enterprise.data-apps.generate.schema.metric
  "The schema of metrics, with their dimensions."
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate.schema.common :as schemas.common]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.core :as metabot]
   [metabase.metrics.core :as metrics]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- metric-result-column
  "Returns the metric aggregation result column inferred by Lib with `metadata-provider`."
  [metadata-provider card]
  (schemas.common/aggregation-result-column-with-metadata-provider metadata-provider (:dataset_query card)))

(defn- metric-filters
  "Returns the display names of the filters `card`'s query applies. The schema exposes a metric only as an
  aggregation, so they are the only hint that it counts a subset of the rows."
  [metadata-provider card]
  (when-let [query-definition (not-empty (:dataset_query card))]
    (try
      (let [query (lib/query metadata-provider query-definition)]
        (not-empty (vec (for [stage-number  (range (lib/stage-count query))
                              filter-clause (lib/filters query stage-number)]
                          (lib/display-name query stage-number filter-clause)))))
      (catch Exception e
        (log/warnf e "Could not describe the filters of metric %s" (:id card))
        nil))))

(defn- metric-details-error-message
  [card error-message]
  (format "Failed to build schema details for metric \"%s\" (card %s): %s"
          (or (:name card) "Untitled")
          (:id card)
          (or error-message "unknown error")))

(defn- metric-details-error-data
  [card error-data]
  (m/assoc-some
   {:card-id   (:id card)
    :card-name (:name card)
    :card-type (:type card)}
   :status-code (:status-code error-data)))

(defn- check-metric-details
  "The details of `card` in the `response` of the metric details lookup, which throws when it failed."
  [card response]
  (or (:structured-output response)
      (let [error-message (:output response)]
        (throw (ex-info (metric-details-error-message card error-message)
                        (assoc (metric-details-error-data card response)
                               :error-message error-message))))))

(defn- metrics-details
  "Returns metric details with queryable dimensions for schema generation, for each of `cards` of the Database with
  `database-id`."
  [database-id cards]
  (mapv check-metric-details
        cards
        (metabot/get-metrics-details database-id
                                     cards
                                     {;; The generated schema does not use the default temporal dimension.
                                      :with-default-temporal-breakout? false
                                      :with-field-values?              false
                                      :with-queryable-dimensions?      true
                                      :with-segments?                  false})))

(defn- persisted-dimension->column
  "Converts persisted metric dimensions to column-shaped maps.

  Persisted metric dimensions use kebab-case field/type keys, while [[schemas.common/column-schema]] expects
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
  "Returns the table id that backs a metric dimension, when known, from `field-table-ids` for one without its own."
  [dimension field-table-ids]
  (or (:table_id dimension)
      (:table-id dimension)
      (get field-table-ids (dimension-field-id dimension))))

(defn- field-table-ids
  "Returns backing table ids for dimensions that need field-based resolution."
  [dimensions]
  (let [field-ids (into #{}
                        (comp (remove #(or (:table_id %) (:table-id %)))
                              (keep dimension-field-id))
                        dimensions)]
    (if (seq field-ids)
      (into {}
            (map (juxt :id :table_id))
            (data-apps.db/field-ids-and-table-ids field-ids))
      {})))

(defn- dimension-schema
  "Returns the schema for a metric dimension."
  [dimension table-id table-key-by-id]
  (let [field-id     (dimension-field-id dimension)
        dimension-id (or (:id dimension) field-id)
        column       (if (:sources dimension)
                       (persisted-dimension->column dimension)
                       dimension)]
    (m/assoc-some
     (assoc (schemas.common/column-schema column)
            :type "column"
            :key (schemas.common/generated-key (:name column) dimension-id)
            :id (str dimension-id))
     :fieldId (when (integer? field-id) field-id)
     :tableId (when (integer? table-id) table-id)
     :sourceFieldId (when (integer? (:source-field-id dimension))
                      (:source-field-id dimension))
     :keyDisambiguator (when (integer? table-id)
                         (get table-key-by-id table-id)))))

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
  "Syncs and returns persisted dimensions with mapping metadata of the metrics with `metric-ids`, by metric id."
  [metric-ids]
  (metrics/sync-dimensions! :metadata/metric metric-ids)
  (into {}
        (map (fn [{:keys [id dimensions dimension_mappings]}]
               [id (enrich-dimensions-with-mappings dimensions dimension_mappings)]))
        (data-apps.db/cards-dimensions metric-ids)))

(defn- table-source-rows
  "Returns table rows for table-backed metric dimensions."
  [table-ids]
  (when (seq table-ids)
    (data-apps.db/table-names table-ids)))

(defn- table-key-disambiguators
  "Returns table display keys used to disambiguate compacted metric dimensions."
  [table-rows]
  (when (seq table-rows)
    (->> table-rows
         (map (fn [{:keys [id name display_name]}]
                [id (schemas.common/pascal-case (schemas.common/generated-key (or display_name name) id))]))
         (into {}))))

(defn- source-table-schema
  "Returns the metric source table identity from portable table metadata."
  [[database-name schema-name table-name]]
  (when (and database-name table-name)
    {:databaseName database-name
     :schemaName   schema-name
     :tableName    table-name}))

(defn- source-table-id
  "Returns the source table id for table-backed metrics."
  [card]
  (lib/primary-source-table-id (:dataset_query card)))

(defn- source-card-id
  "Return the source card ID from the first stage of a metric's definition.

  This identifies the card the definition reads from. The source needed to use the metric is returned by
  [[metabase.metabot.tools.util/metric-required-source]]; a multi-stage definition can require its base table."
  [card]
  (lib/primary-source-card-id (:dataset_query card)))

(defn- fallback-metric-column
  "Returns a stable fallback column when metric result-column inference fails."
  [{:keys [name]}]
  {:type        "column"
   :name        name
   :displayName name
   :jsType      "unknown"})

(defn- metric-dimensions
  "Returns the dimensions of a metric: its persisted ones, else the queryable ones of its `details`."
  [details persisted-dimensions]
  (or (seq persisted-dimensions)
      (:queryable-dimensions details)))

(defn- metric-dimensions-with-table-ids
  "Returns metric dimensions paired with their backing table ids, filtering mapped dimensions for card metrics."
  [dimensions source-card-id-value field-table-ids]
  (cond->> (mapv (fn [dimension]
                   [dimension (dimension-table-id dimension field-table-ids)])
                 dimensions)
    source-card-id-value (remove (fn [[_dimension table-id]]
                                   (integer? table-id)))))

(defn- metric-dimension-schemas
  "Returns dimension schemas and mapped table ids for a metric."
  [dimension-table-id-pairs table-key-by-id]
  (let [dimension-schemas (mapv (fn [[dimension table-id]]
                                  (dimension-schema dimension table-id table-key-by-id))
                                dimension-table-id-pairs)]
    {:dimension-schemas dimension-schemas
     :mapped-table-ids  (->> dimension-schemas (keep :tableId) distinct sort vec)}))

(defn- metric-schema
  "Returns the schema for a metric and its queryable dimensions."
  [{:keys [id name description verified portable_entity_id base_table_portable_fk] :as details}
   card metadata-provider dimension-table-id-pairs table-key-by-id]
  (let [result-column (or (some-> (metric-result-column metadata-provider card) schemas.common/column-schema)
                          (fallback-metric-column details))
        source-card-id-value (source-card-id card)
        {:keys [dimension-schemas mapped-table-ids]} (metric-dimension-schemas dimension-table-id-pairs table-key-by-id)]
    (m/assoc-some
     {:type    "metric"
      :key     (schemas.common/generated-key name id)
      :id      id
      :name    name
      :columns [result-column]}
     :sourceTableId (source-table-id card)
     :sourceCardId source-card-id-value
     :entityId portable_entity_id
     :description description
     :filters (metric-filters metadata-provider card)
     :verified (when verified true)
     :sourceTable (source-table-schema base_table_portable_fk)
     :mappedTableIds (not-empty mapped-table-ids)
     :dimensions (not-empty (schemas.common/keyed-map dimension-schemas)))))

(defn- database-metric-schemas
  "Returns the schemas of metric `cards` of the Database with `database-id`, by card id, read with one metadata
  provider and their dimensions synced and read at once."
  [database-id cards]
  (let [metadata-provider (lib-be/application-database-metadata-provider database-id)
        details           (metrics-details database-id cards)
        persisted         (sync-and-fetch-metric-dimensions! (mapv :id cards))
        dimensions        (mapv #(metric-dimensions %1 (persisted (:id %2))) details cards)
        field-table-ids   (field-table-ids (into [] cat dimensions))
        pairs             (mapv #(metric-dimensions-with-table-ids %1 (source-card-id %2) field-table-ids) dimensions cards)
        table-ids         (into [] (comp cat (keep second) (filter integer?) (distinct)) pairs)
        table-key-by-id   (table-key-disambiguators (table-source-rows table-ids))]
    (into {}
          (map (fn [details card pairs]
                 [(:id card) (metric-schema details card metadata-provider pairs table-key-by-id)])
               details cards pairs))))

(defn- references-saved-card?
  "Whether `metric`'s query depends on a saved card anywhere, not only as its stage-0 source."
  [metric]
  (boolean (seq (lib/all-source-card-ids (:dataset_query metric)))))

(defn metric-schemas
  "Returns the schemas of the metrics in the collections with `collection-ids`, only those with `metric-ids` when it
  has any."
  [collection-ids metric-ids]
  (let [metrics             (into []
                                  (comp (remove source-card-id)
                                        ;; A data app's questions can use only metrics that resolve entirely from
                                        ;; tables, as they read no saved question. `source-card-id` sees only stage 0,
                                        ;; so a table-sourced metric joining a saved question would get through; check
                                        ;; the whole query instead.
                                        (remove references-saved-card?))
                                  (schemas.common/without-unavailable-cards
                                   (data-apps.db/metric-cards-in-collections collection-ids metric-ids)))
        schema-by-metric-id (into {}
                                  (mapcat (fn [[database-id cards]]
                                            (database-metric-schemas database-id cards)))
                                  (group-by :database_id metrics))]
    (keep (comp schema-by-metric-id :id) metrics)))
