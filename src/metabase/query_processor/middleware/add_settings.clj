(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]))

(defn- add-settings* [query]
  (if-let [report-timezone (driver.u/report-timezone-if-supported driver/*driver*)]
    (assoc-in query [:settings :report-timezone] report-timezone)
    query))

(defn add-settings
  "Adds the `:settings` map to the query which can contain any fixed properties that would be useful at execution time.
   Currently supports a settings object like:

       {:report-timezone \"US/Pacific\"}"
  [qp]
  (comp qp add-settings*))
