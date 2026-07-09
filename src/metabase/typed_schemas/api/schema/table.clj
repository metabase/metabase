(ns metabase.typed-schemas.api.schema.table
  "Table, field, segment, and measure schema construction for typed-schema endpoints."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.common :as typed-schemas.common]
   [metabase.typed-schemas.api.query-params :as qp]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn field-table-id
  "Returns the table id for a field id, when the field id is an integer."
  [field-id]
  (when (integer? field-id)
    (t2/select-one-fn :table_id :model/Field :id field-id)))

(defn- field-schema
  ([field]
   (field-schema field nil))
  ([{:keys [id field_id] :as field} source-name]
   (let [field-id (or id field_id)
         table-id (or (:table_id field) (:table-id field) (field-table-id field-id))]
     (typed-schemas.common/assoc-some
      (assoc (typed-schemas.common/column-schema field)
             :type "column"
             :key (typed-schemas.common/generated-key (:name field) field-id)
             :id field-id)
      :sourceName source-name
      :fieldId (when (integer? field-id) field-id)
      :tableId (when (integer? table-id) table-id)
      :defaultTemporalBucket (:unit field)))))

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

(defn select-tables
  "Returns readable active tables, optionally scoped by database and table ids."
  ([database-ids]
   (select-tables database-ids nil))
  ([database-ids table-ids]
   (->> (t2/select :model/Table
                   {:where    (cond-> [:and [:= :active true]]
                                database-ids (conj (qp/database-id-filter-clause database-ids :db_id))
                                table-ids (conj (qp/id-filter-clause table-ids :id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

(defn select-library-tables
  "Returns readable active published tables in a library data collection scope."
  [{:keys [data-collection-ids]}]
  (->> (t2/select :model/Table
                  {:where    [:and
                              [:= :active true]
                              [:= :is_published true]
                              (qp/id-filter-clause data-collection-ids :collection_id)]
                   :order-by [[:name :asc] [:id :asc]]})
       (filter mi/can-read?)))

(defn- segment-schema
  [table-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (typed-schemas.common/assoc-some
   {:type    "segment"
    :key     (typed-schemas.common/generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- measure-schema
  [table-id database-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (typed-schemas.common/assoc-some
   {:type    "measure"
    :key     (typed-schemas.common/generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name
    :columns [(or (some-> (measure-result-column database-id id) typed-schemas.common/column-schema)
                  (schema.common/fallback-metric-column {:name (or display-name name)}))]}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- table-schema
  [{:keys [id name description display_name database_id database_name database_schema portable_entity_id fields segments measures]}]
  (let [segments-map (typed-schemas.common/keyed-map (map #(segment-schema id %) segments))
        measures-map (typed-schemas.common/keyed-map (map #(measure-schema id database_id %) measures))]
    (typed-schemas.common/assoc-some
     {:type         "table"
      :key          (typed-schemas.common/generated-key (or display_name name) id)
      :id           id
      :name         (or display_name name)
      :databaseName database_name
      :tableName    name
      :fields       (typed-schemas.common/keyed-map (map #(field-schema % name) fields))}
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

(defn table-schemas
  "Returns table schemas for tables with available structured details."
  [tables]
  (for [table tables
        :let [details (table-details table)]
        :when details]
    (table-schema details)))
