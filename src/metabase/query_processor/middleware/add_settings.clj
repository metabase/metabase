(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [metabase.query-processor.timezone :as qp.timezone]))

;; TODO - rename
(defn add-settings
  "Add `:results_timezone` and `:requested_timezone` info to query results."
  [qp]
  (comp
   (fn [results]
     (merge
      results
      {:results_timezone (qp.timezone/results-timezone-id)}
      (when-let [requested-timezone-id (qp.timezone/requested-timezone-id)]
        {:requested_timezone requested-timezone-id})))
   qp))
