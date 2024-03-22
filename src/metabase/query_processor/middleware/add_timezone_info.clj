(ns metabase.query-processor.middleware.add-timezone-info
  (:require
   [metabase.query-processor.timezone :as qp.timezone]))

(defn- add-timezone-metadata [metadata]
  (merge
   metadata
   {:results_timezone           (qp.timezone/results-timezone-id)
    ;; I added these for debugging purposes only, hence the FE-unfriendly key names. -- Cam
    :qp.debug/report-timezone   (qp.timezone/report-timezone-id-if-supported)
    :qp.debug/database-timezone (qp.timezone/database-timezone-id)}
   (when-let [requested-timezone-id (qp.timezone/requested-timezone-id)]
     {:requested_timezone requested-timezone-id})))

(defn add-timezone-info
  "Add `:results_timezone` and `:requested_timezone` info to query results."
  [_query rff]
  (fn add-timezone-info-rff* [metadata]
    (rff (add-timezone-metadata metadata))))
