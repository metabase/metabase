(ns metabase.driver.sync.queries
  "Predefined QP queries that can be used to get metadata for syncing."
  (:require [metabase.driver :as driver]))

(defn- qp-query [table query-dict]
  (-> (driver/process-query {:database (:db_id table)
                             :type "query"
                             :query (assoc query-dict
                                           :source_table (:id table))})
      :data
      :rows))

(defn table-row-count
  "Fetch the row count of TABLE via the query processor."
  [table]
  {:pre  [(map? table)]
   :post [(integer? %)]}
  (-> (qp-query table {:aggregation ["count"]})
      first first))

(defn field-count
  "Return the count of FIELD via the query processor."
  [field]
  {:pre  [(delay? (:table field))
          (integer? (:id field))]
   :post [(integer? %)]}
  (-> (qp-query @(:table field) {:aggregation ["count" (:id field)]})
      first first))

(defn field-distinct-count
  "Return the distinct count of FIELD via the query processor."
  {:arglists '([field] [field limit])}
  [field & [limit]]
  {:pre  [(delay? (:table field))
          (integer? (:id field))]
   :post [(integer? %)]}
  (-> (qp-query @(:table field) (merge {:aggregation ["distinct" (:id field)]}
                                       (when limit
                                         {:limit limit})))
      first first))
