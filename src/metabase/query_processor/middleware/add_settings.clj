(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [metabase.query-processor.timezone :as qp.timezone]))

(defn- settings-for-current-driver []
  (when-let [timezone-id (qp.timezone/report-timezone-id-if-supported)]
    {:report-timezone timezone-id}))

(defn add-settings
  "Adds the `:settings` map to the query which can contain any fixed properties that would be useful at execution time,
  and to the results of the query. Currently supports a settings object like:

       {:report-timezone \"US/Pacific\"}"
  [qp]
  (fn [query]
    (let [settings (settings-for-current-driver)
          query   (if (seq settings)
                    (assoc query :settings settings)
                    (dissoc query :settings))
          results (qp query)]
      (merge
       results
       {:actual_timezone (qp.timezone/results-timezone-id)}
       (when-let [requested-timezone-id (qp.timezone/requested-timezone-id)]
         {:expected_timezone requested-timezone-id})))))
