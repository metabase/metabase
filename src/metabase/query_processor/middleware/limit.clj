(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require [clojure.core.async :as a]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]))

(defn- add-limit [max-rows {query-type :type, :as query}]
  (cond-> query
    (and (= query-type :query)
         (qputil/query-without-aggregations-or-limits? query))
    (assoc-in [:query :limit] max-rows)))

(defn- limit-xform [max-rows]
  (fn [xf]
    {:pre [(fn? xf)]}
    (let [row-count (atom 0)]
      (fn
        ([]
         (xf))

        ([result]
         (xf result))

        ([result row]
         (let [result'       (xf result row)
               new-row-count (swap! row-count inc)]
           (if (>= new-row-count max-rows)
             (reduced result')
             result')))))))

(defn limit
  "Add an implicit `limit` clause to MBQL queries without any aggregations, and limit the maximum number of rows that
  can be returned in post-processing."
  [qp]
  (fn [query xform-fn {:keys [raise-chan], :as chans}]
    (try
      (let [max-rows (or (mbql.u/query->max-rows-limit query)
                         i/absolute-max-results)]
        (qp
         (add-limit max-rows query)
         (fn [metadata]
           (comp (limit-xform max-rows) (xform-fn metadata)))
         chans))
      (catch Throwable e
        (a/>!! raise-chan e)))))
