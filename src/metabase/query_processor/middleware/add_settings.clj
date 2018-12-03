(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [medley.core :as m]
            [metabase.driver.util :as driver.u]))

(defn- add-settings* [{:keys [driver] :as query}]
  (let [settings {:report-timezone (driver.u/report-timezone-if-supported driver)}]
    (assoc query :settings (m/filter-vals (complement nil?) settings))))

(defn add-settings
  "Adds the `:settings` map to the query which can contain any fixed properties that would be useful at execution time.
   Currently supports a settings object like:

       {:report-timezone \"US/Pacific\"}"
  [qp]
  (comp qp add-settings*))
