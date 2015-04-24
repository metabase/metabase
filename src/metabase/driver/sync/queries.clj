(ns metabase.driver.sync.queries
  "Predefined QP queries that can be used to get metadata for syncing."
  (:require [metabase.driver :as driver]
            [metabase.driver.context :as context]))

(defn- qp-query [table query-dict]
  (binding [context/*table* table
            context/*database* @(:db table)]
    (->> (driver/process-and-run {:database (:db_id table)
                                  :type "query"
                                  :query (assoc query-dict
                                                :source_table (:id table))})
         :data
         :rows)))

(defn table-row-count
  "Fetch the row count of TABLE via the query processor."
  [table]
  {:post [(integer? %)]}
  (-> (qp-query table {:aggregation ["count"]})
      first first))

(defn field-count
  "Return the count of FIELD via the query processor."
  [field]
  {:post [(integer? %)]}
  (-> (qp-query @(:table field) {:aggregation ["count" (:id field)]})
      first first))

(defn field-distinct-count
  "Return the distinct count of FIELD via the query processor."
  [field]
  {:post [(integer? %)]}
  (-> (qp-query @(:table field) {:aggregation ["distinct" (:id field)]})
      first first))
