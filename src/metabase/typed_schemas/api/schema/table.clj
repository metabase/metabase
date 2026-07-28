(ns metabase.typed-schemas.api.schema.table
  "Typed schema generation for tables, fields, segments and measures."
  (:require
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.metabot.core :as metabot]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.common :as common]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [metabase.typed-schemas.api.scope :as scope]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn table-by-field-id
  "Returns the table for a given field id."
  [field-id]
  (when (integer? field-id)
    (t2/select-one-fn :table_id :model/Field :id field-id)))

(defn field-schema
  "Returns the schema for a table field."
  ([field]
   (field-schema field nil nil))
  ([field source-name]
   (field-schema field source-name nil))
  ([{:keys [id field_id] :as field} source-name table-id]
   (let [field-id (or id field_id)
         table-id (or table-id (:table_id field) (:table-id field) (table-by-field-id field-id))]
     (m/assoc-some
      (assoc (common/column-schema field)
             :type "column"
             :key (common/generated-key (:name field) field-id)
             :id field-id)
      :sourceName source-name
      :fieldId (when (integer? field-id) field-id)
      :tableId (when (integer? table-id) table-id)
      :defaultTemporalBucket (:unit field)))))

(defn select-tables
  "Returns readable tables, with optional database and table-id scopes.

  Library and database endpoint paths both need the same active/readable table
  rules; only their id filters differ."
  ([database-ids]
   (select-tables database-ids nil))
  ([database-ids table-ids]
   (->> (t2/select :model/Table
                   {:where    (cond-> [:and [:= :active true]]
                                database-ids (conj (scope/database-id-filter-clause database-ids :db_id))
                                table-ids (conj (scope/id-filter-clause table-ids :id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

(defn select-library-tables
  "Returns published tables from the library based on the given scope."
  [{:keys [data-collection-ids]}]
  (->> (t2/select :model/Table
                  {:where    [:and
                              [:= :active true]
                              [:= :is_published true]
                              (scope/id-filter-clause data-collection-ids :collection_id)]
                   :order-by [[:name :asc] [:id :asc]]})
       (filter mi/can-read?)))

(defn segment-schema
  "Returns the schema for a segment."
  [table-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (m/assoc-some
   {:type    "segment"
    :key     (common/generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- fallback-measure-column
  [{:keys [name]}]
  {:type        "column"
   :name        name
   :displayName name
   :jsType      "unknown"})

(defn measure-result-column
  "Returns the result column for a measure definition, or nil when it cannot be inferred.

  Measures render as aggregate fields. When Lib can infer the
  aggregation column, the schema exposes the real result type. Otherwise, the
  measure remains usable with a fallback column."
  [database-id measure-id]
  (try
    (when-let [definition (t2/select-one-fn :definition :model/Measure :id measure-id)]
      (schema.common/aggregation-result-column database-id definition))
    (catch Exception _
      nil)))

(defn- measure-result-columns
  "Returns result columns for table measures with one definition query and metadata provider."
  [database-id measures]
  (let [measure-ids (into [] (keep :id) measures)]
    (when (seq measure-ids)
      (let [definition-by-measure-id (into {}
                                           (map (juxt :id :definition))
                                           (t2/select [:model/Measure :id :definition] :id [:in measure-ids]))]
        (try
          (let [metadata-provider (lib-be/application-database-metadata-provider database-id)]
            (into {}
                  (keep (fn [{:keys [id]}]
                          (when-let [definition (get definition-by-measure-id id)]
                            [id (schema.common/aggregation-result-column-with-metadata-provider metadata-provider definition)])))
                  measures))
          ;; Result-column inference is best effort; callers fall back to an unknown column.
          (catch Exception _
            {}))))))

(defn measure-schema
  "Returns the schema for a measure."
  ([table-id database-id measure]
   (measure-schema table-id database-id (measure-result-column database-id (:id measure)) measure))
  ([table-id _database-id result-column {:keys [id name description display-name portable-entity-id portable_entity_id]}]
   (m/assoc-some
    {:type    "measure"
     :key     (common/generated-key (or display-name name) id)
     :id      id
     :tableId table-id
     :name    name
     :columns [(or (some-> result-column common/column-schema)
                   (fallback-measure-column {:name (or display-name name)}))]}
    :entityId (or portable_entity_id portable-entity-id)
    :description description)))

(defn table-schema
  "Returns the schema for a table."
  [{:keys [id name description display_name database_id database_name database_schema portable_entity_id fields segments measures]}]
  (let [segments-map                 (common/keyed-map (map #(segment-schema id %) segments))
        measure-result-column-by-id  (measure-result-columns database_id measures)
        measures-map                 (common/keyed-map (map #(measure-schema id database_id
                                                                             (get measure-result-column-by-id (:id %))
                                                                             %)
                                                            measures))]
    (m/assoc-some
     {:type         "table"
      :key          (common/generated-key (or display_name name) id)
      :id           id
      :name         (or display_name name)
      :databaseName database_name
      :tableName    name
      :fields       (common/keyed-map (map #(field-schema % name id) fields))}
     :entityId portable_entity_id
     :description description
     :schemaName database_schema
     :segments (not-empty segments-map)
     :measures (not-empty measures-map))))

(defn- table-details-error-message
  [table error-message]
  (format "Failed to build schema details for table \"%s\" (table %s): %s"
          (or (:name table) "Untitled")
          (:id table)
          (or error-message "unknown error")))

(defn- table-details-error-data
  [table error-data]
  (m/assoc-some
   {:table-id   (:id table)
    :table-name (:name table)}
   :status-code (:status-code error-data)))

(defn- table-details
  [table]
  (let [response (metabot/get-table-details
                  {:entity-type          :table
                   :entity-id            (:id table)
                   :with-fields?         true
                   :with-field-values?   false
                   :with-related-tables? false
                   :with-metrics?        false
                   :with-measures?       true
                   :with-segments?       true})]
    (or (:structured-output response)
        (let [error-message (:output response)]
          (throw (ex-info (table-details-error-message table error-message)
                          (assoc (table-details-error-data table response)
                                 :error-message error-message)))))))

(defn table-schemas
  "Returns table schemas for selected table rows."
  [tables]
  (for [table tables
        :let [details (table-details table)]
        :when details]
    (table-schema details)))
