(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.middleware.forty-three :as m.43]
            [metabase.query-processor.util :as qputil]))

;;;; Pre-processing

(defn- add-limit [max-rows {query-type :type, {original-limit :limit}, :query, :as query}]
  (cond-> query
    (and (= query-type :query)
         (qputil/query-without-aggregations-or-limits? query))
    (update :query assoc :limit max-rows, ::original-limit original-limit)))

(defn- query-max-rows [query]
  (or (mbql.u/query->max-rows-limit query)
      i/absolute-max-results))

(defn add-default-limit
  "Pre-processing middleware. Add default `:limit` to MBQL queries without any aggregations."
  [query]
  (add-limit (query-max-rows query) query))


;;;; Post-processing

(defn- limit-xform [max-rows rf]
  {:pre [(fn? rf)]}
  (let [row-count (volatile! 0)]
    (fn
      ([]
       (rf))

      ([result]
       (rf result))

      ([result row]
       (let [result'       (rf result row)
             new-row-count (vswap! row-count inc)]
         (if (>= new-row-count max-rows)
           (ensure-reduced result')
           result'))))))

(defn- limit-result-rows [query rff]
  (let [max-rows (query-max-rows query)]
    (fn limit-result-rows-rff* [metadata]
      (limit-xform max-rows (rff metadata)))))

(def limit-result-rows-middleware
  "Post-processing middleware. Limit the maximum number of rows that are returned in post-processing."
  (m.43/wrap-43-post-processing-middleware limit-result-rows))
