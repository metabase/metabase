(ns metabase.query-processor.middleware.add-timezone-info
  (:require
   [java-time.api :as t]
   [metabase.query-processor.timezone :as qp.timezone]))

(defn- add-timezone-metadata [metadata]
  (let [results-timezone-id   (qp.timezone/results-timezone-id)
        requested-timezone-id (qp.timezone/requested-timezone-id)
        ;; e.g. `US/Pacific` requested but `America/Los_Angeles` used: same zone, so report it under the requested name.
        ;; Region IDs only, since Java accepts IDs like `Z` that browsers don't.
        same-zone?            (and requested-timezone-id
                                   (contains? (t/available-zone-ids) requested-timezone-id)
                                   (qp.timezone/same-zone-rules? requested-timezone-id results-timezone-id))]
    (merge
     metadata
     {:results_timezone (if same-zone? requested-timezone-id results-timezone-id)}
     (when requested-timezone-id
       {:requested_timezone requested-timezone-id}))))

(defn add-timezone-info
  "Add `:results_timezone` and `:requested_timezone` info to query results. When the requested timezone is another name
  for the timezone the query ran in, `:results_timezone` uses the requested name."
  [_query rff]
  (fn add-timezone-info-rff* [metadata]
    (rff (add-timezone-metadata metadata))))
