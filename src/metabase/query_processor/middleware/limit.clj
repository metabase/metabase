(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require (metabase.query-processor [interface :as i]
                                      [util :as qputil])))

(defn limit
  "Add an implicit `limit` clause to MBQL queries without any aggregations, and limit the maximum number of rows that
  can be returned in post-processing."
  [qp]
  (fn [{{:keys [max-results max-results-bare-rows]} :constraints, query-type :type, :as query}]
    (let [query   (cond-> query
                    (and (= query-type :query)
                         (qputil/query-without-aggregations-or-limits? query))
                    (assoc-in [:query :limit] (or max-results-bare-rows
                                                  max-results
                                                  i/absolute-max-results)))
          results (qp query)]
      (update results :rows (partial take (or max-results
                                              i/absolute-max-results))))))
