(ns metabase.query-processor.middleware.add-timezone-info
  (:require [metabase.query-processor.timezone :as qp.timezone]))

(defn- add-timezone-metadata [metadata]
  (merge
   metadata
   {:results_timezone (qp.timezone/results-timezone-id)}
   (when-let [requested-timezone-id (qp.timezone/requested-timezone-id)]
     {:requested_timezone requested-timezone-id})))

(defn add-timezone-info
  "Add `:results_timezone` and `:requested_timezone` info to query results."
  [qp]
  (fn [query rff context]
    (qp query
        (fn [metadata]
          (rff (add-timezone-metadata metadata)))
        context)))
