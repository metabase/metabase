(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [metabase.query-processor.timezone :as qp.timezone]))

;; TODO - rename + update dox
(defn add-settings
  "Adds the `:settings` map to the query which can contain any fixed properties that would be useful at execution time,
  and to the results of the query. Currently supports a settings object like:

       {:report-timezone \"US/Pacific\"}"
  [qp]
  (comp
   (fn [results]
     (merge
      results
      {:actual_timezone (qp.timezone/results-timezone-id)}
      (when-let [requested-timezone-id (qp.timezone/requested-timezone-id)]
        {:expected_timezone requested-timezone-id})))
   qp))
