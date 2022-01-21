(ns metabase.query-processor.middleware.limit
  "Middleware that handles limiting the maximum number of rows returned by a query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.models.setting :as setting]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.util :as qputil]))

(defn- add-limit [max-rows {query-type :type, :as query}]
  (cond-> query
    (and (= query-type :query)
         (qputil/query-without-aggregations-or-limits? query))
    (assoc-in [:query :limit] max-rows)))

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

(defn determine-query-max-rows
  "Given a `query`, return the max rows that should be returned.  This is the first non-nil value from (in decreasing
  priority order):

  1. the value of the `metabase.query-processor.middleware.constraints/max-results-bare-rows` setting, which allows
     for database-local override
  2. the output of `metabase.mbql.util/query->max-rows-limit` when called on the given query
  3. `metabase.query-processor.interface/absolute-max-results` (a constant, non-nil backstop value)"
  [query]
  (or (setting/get-value-of-type :integer :max-results-bare-rows)
      (mbql.u/query->max-rows-limit query)
      i/absolute-max-results))

(defn limit
  "Add an implicit `limit` clause to MBQL queries without any aggregations, and limit the maximum number of rows that
  can be returned in post-processing."
  [qp]
  (fn [query rff context]
    (let [max-rows (determine-query-max-rows query)]
      (qp
       (add-limit max-rows query)
       (fn [metadata]
         (limit-xform max-rows (rff metadata)))
       context))))
