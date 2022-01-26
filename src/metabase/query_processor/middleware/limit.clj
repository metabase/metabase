(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.query-processor.middleware.forty-three :as m.43]
            [metabase.query-processor.util :as qputil]))

;;;; Pre-processing

(defn- add-limit [max-rows {query-type :type, :as query}]
  (cond-> query
    (and (= query-type :query)
         (qputil/query-without-aggregations-or-limits? query))
    (assoc-in [:query :limit] max-rows)))

(defn determine-query-max-rows
  "Given a `query`, return the max rows that should be returned.  This is the first non-nil value from (in decreasing
  priority order):

  1. the value of the [[metabase.query-processor.middleware.constraints/max-results-bare-rows]] setting, which allows
     for database-local override
  2. the output of [[metabase.mbql.util/query->max-rows-limit]] when called on the given query
  3. [[metabase.query-processor.interface/absolute-max-results]] (a constant, non-nil backstop value)"
  [query]
  (or (constraints/max-results-bare-rows)
      (mbql.u/query->max-rows-limit query)
      i/absolute-max-results))

(defn- add-default-limit [query]
  (add-limit (determine-query-max-rows query) query))

(def add-default-limit-middleware
  "Pre-processing middleware. Add default `:limit` to MBQL queries without any aggregations."
  (m.43/wrap-43-pre-processing-middleware add-default-limit))


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
  (let [max-rows (determine-query-max-rows query)]
    (fn limit-result-rows-rff* [metadata]
      (limit-xform max-rows (rff metadata)))))

(def limit-result-rows-middleware
  "Post-processing middleware. Limit the maximum number of rows that are returned in post-processing."
  (m.43/wrap-43-post-processing-middleware limit-result-rows))
