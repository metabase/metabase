(ns metabase.query-processor.middleware.add-rows-truncated
  "Adds `:rows_truncated` to the query results if the results were truncated because of the query's constraints."
  (:require
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.middleware.limit :as limit]))

(defn- results-limit
  [{{:keys [max-results max-results-bare-rows]}                                    :constraints
    {aggregations :aggregation, :keys [limit page], ::limit/keys [original-limit]} :query
    :as                                                                            _query}]
  (or (when (and (or (not limit)
                     (= original-limit nil))
                 (not page)
                 (empty? aggregations))
        max-results-bare-rows)
      max-results
      qp.i/absolute-max-results))

(defn- add-rows-truncated-xform [limit rf]
  {:pre [(int? limit) (fn? rf)]}
  (let [row-count (volatile! 0)]
    (fn
      ([]
       (rf))

      ([result]
       (rf (cond-> result
             (and (map? result)
                  (= @row-count limit))
             (assoc-in [:data :rows_truncated] limit))))

      ([result row]
       (vswap! row-count inc)
       (rf result row)))))

(defn add-rows-truncated
  "Add `:rows_truncated` to the result if the results were truncated because of the query's constraints. Only affects QP
  results that are reduced to a map (e.g. the default reducing function; other reducing functions such as streaming to
  a CSV are unaffected.)"
  [query rff]
  (fn add-rows-truncated-rff* [metadata]
    (add-rows-truncated-xform (results-limit query) (rff metadata))))
