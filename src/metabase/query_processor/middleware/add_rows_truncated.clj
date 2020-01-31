(ns metabase.query-processor.middleware.add-rows-truncated
  "Adds `:rows_truncated` to the query results if the results were truncated because of the query's constraints."
  (:require [metabase.query-processor
             [interface :as i]
             [util :as qputil]]))

(defn- results-limit [{{:keys [max-results max-results-bare-rows]} :constraints, :as query}]
  (or (when (qputil/query-without-aggregations-or-limits? query)
        max-results-bare-rows)
      max-results
      i/absolute-max-results))

(defn- add-rows-truncated-xform [limit]
  (fn add-rows-truncated-rf [rf]
    {:pre [(fn? rf)]}
    (fn
      ([]
       (rf))

      ([result]
       (let [result' (rf result)]
         (if (and (map? result') (:row_count result') (= (:row_count result') limit))
           (assoc-in result' [:data :rows_truncated] limit)
           result')))

      ([result row]
       (rf result row)))))

(defn add-rows-truncated
  "Add `:rows_truncated` to the result if the results were truncated because of the query's constraints. Only affects QP
  results that are reduced to a map (e.g. the default reducing function; other reducing functions such as streaming to
  a CSV are unaffected.)"
  [qp]
  (fn [query xformf chans]
    (qp
     query
     (fn [metadata]
       (comp (add-rows-truncated-xform (results-limit query)) (xformf metadata)))
     chans)))
