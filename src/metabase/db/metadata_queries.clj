(ns metabase.db.metadata-queries
  "Predefined MBQL queries for getting metadata about an external database."
  (:require [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.expand :as ql]
            [toucan.db :as db]))

(defn- qp-query [db-id query]
  (-> (qp/process-query
       {:type     :query
        :database db-id
        :query    query})
      :data
      :rows))

(defn- field-query [{table-id :table_id} query]
  {:pre [(integer? table-id)]}
  (qp-query (db/select-one-field :db_id Table, :id table-id)
            (ql/query (merge query)
                      (ql/source-table table-id))))

(defn table-row-count
  "Fetch the row count of TABLE via the query processor."
  [table]
  {:pre  [(map? table)]
   :post [(integer? %)]}
  (-> (qp-query (:db_id table) (ql/query (ql/source-table (:id table))
                                         (ql/aggregation (ql/count))))
      first first long))

(defn field-distinct-values
  "Return the distinct values of FIELD.
   This is used to create a `FieldValues` object for `:type/Category` Fields."
  ([field]
   (field-distinct-values field @(resolve 'metabase.sync-database.analyze/low-cardinality-threshold)))
  ([field max-results]
   {:pre [(integer? max-results)]}
   (mapv first (field-query field (-> {}
                                      (ql/breakout (ql/field-id (u/get-id field)))
                                      (ql/limit max-results))))))

(defn field-distinct-count
  "Return the distinct count of FIELD."
  [{field-id :id, :as field} & [limit]]
  (-> (field-query field (-> {}
                             (ql/aggregation (ql/distinct (ql/field-id field-id)))
                             (ql/limit limit)))
      first first int))

(defn field-count
  "Return the count of FIELD."
  [{field-id :id :as field}]
  (-> (field-query field (ql/aggregation {} (ql/count (ql/field-id field-id))))
      first first int))
