(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]))

(defn- settings-for-current-driver []
  (when-let [report-timezone (driver.u/report-timezone-if-supported driver/*driver*)]
    {:report-timezone report-timezone}))

(defn- add-settings* [query]
  (if-let [settings (settings-for-current-driver)]
    (assoc query :settings settings)
    query))

(defn add-settings
  "Adds the `:settings` map to the query which can contain any fixed properties that would be useful at execution time,
  and to the results of the query. Currently supports a settings object like:

       {:report-timezone \"US/Pacific\"}"
  [qp]
  (fn [query]
    (let [settings (settings-for-current-driver)
          query    (cond-> query
                     settings (assoc :settings settings))
          results  (qp query)]
      (cond-> results
        settings (assoc :settings settings)))))
