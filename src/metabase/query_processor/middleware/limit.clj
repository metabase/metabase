(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]))

(defn limit
  "Add an implicit `limit` clause to MBQL queries without any aggregations, and limit the maximum number of rows that
  can be returned in post-processing."
  [qp]
  (fn [{query-type :type, :as query}]
    (let [max-rows (or (mbql.u/query->max-rows-limit query)
                       i/absolute-max-results)
          query    (cond-> query
                     (and (= query-type :query)
                          (qputil/query-without-aggregations-or-limits? query))
                     (assoc-in [:query :limit] max-rows))
          results  (qp query)]
      (update results :rows (partial take max-rows)))))
