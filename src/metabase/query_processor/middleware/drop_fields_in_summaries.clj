(ns metabase.query-processor.middleware.drop-fields-in-summaries
  (:require
   [metabase.lib.walk :as lib.walk]))

(defn drop-fields-in-summaries
  "Drop any :fields clauses in stages that have :aggregations or :breakouts"
  [query]
  (letfn [(has-summary? [stage] (or (:aggregation stage)
                                    (:breakout stage)))]
    (lib.walk/walk-stages query (fn [_query _path stage]
                                  (cond-> stage
                                    (has-summary? stage) (dissoc :fields))))))
