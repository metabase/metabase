(ns metabase.warehouse-schema.metadata-from-qp
  "Get metadata by running queries with the query processor."
  (:require
   [metabase.query-processor :as qp]
   [metabase.query-processor.interface :as qp.i]
   [metabase.util :as u]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]
   [toucan2.core :as t2]))

(defn table-query
  "Runs the `mbql-query` where the source table is `table-id` and returns the result.
  Add the required filters if the table requires it,
  see [[metabase.warehouse-schema.metadata-queries/add-required-filters-if-needed]] for more details. Also takes an
  optional `rff`, use the default rff if not provided."
  ([table-id mbql-query]
   (table-query table-id mbql-query nil))
  ([table-id mbql-query rff]
   {:pre [(integer? table-id)]}
   (binding [qp.i/*disable-qp-logging* true]
     (qp/process-query
      {:type       :query
       :database   (t2/select-one-fn :db_id :model/Table table-id)
       :query      (-> mbql-query
                       (assoc :source-table table-id)
                       schema.metadata-queries/add-required-filters-if-needed)
       :middleware {:disable-remaps? true}}
      rff))))

(defn field-distinct-count
  "Return the distinct count of `field`."
  [field & [limit]]
  (-> (table-query (:table_id field) {:aggregation [[:distinct [:field (u/the-id field) nil]]]
                                      :limit       limit})
      :data :rows first first int))

(defn field-count
  "Return the count of `field`."
  [field]
  (-> (table-query (:table_id field) {:aggregation [[:count [:field (u/the-id field) nil]]]})
      :data :rows first first int))
