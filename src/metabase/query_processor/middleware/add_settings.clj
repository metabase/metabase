(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [metabase.query-processor.timezone :as qp.timezone]))

;; TODO - rename
(defn add-settings
  "Add `:actual_timezone` and `:expected_timezone` info to query results."
  [qp]
  (comp
   (fn [results]
     (merge
      results
      {:actual_timezone (qp.timezone/results-timezone-id)}
      (when-let [requested-timezone-id (qp.timezone/requested-timezone-id)]
        {:expected_timezone requested-timezone-id})))
   qp))
