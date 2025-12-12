(ns metabase.query-processor.middleware.add-rows-truncated
  "Adds `:rows_truncated` to the query results if the results were truncated because of the query's constraints."
  (:refer-clojure :exclude [empty?])
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.middleware.limit :as-alias limit]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [empty?]]))

(defn- results-limit
  [{{:keys [max-results max-results-bare-rows]} :constraints
    :as                                         query}]
  (let [{aggregations :aggregation, :keys [limit page], ::limit/keys [original-limit]} (lib/query-stage query -1)]
    (or (when (and (or (not limit)
                       (= original-limit nil))
                   (not page)
                   (empty? aggregations))
          max-results-bare-rows)
        max-results
        qp.settings/absolute-max-results)))

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

(mu/defn add-rows-truncated
  "Add `:rows_truncated` to the result if the results were truncated because of the query's constraints. Only affects QP
  results that are reduced to a map (e.g. the default reducing function; other reducing functions such as streaming to
  a CSV are unaffected.)"
  [query :- ::lib.schema/query
   rff   :- ::qp.schema/rff]
  (fn add-rows-truncated-rff* [metadata]
    (add-rows-truncated-xform (results-limit query) (rff metadata))))
