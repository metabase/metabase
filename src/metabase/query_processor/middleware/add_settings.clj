(ns metabase.query-processor.middleware.add-settings
  "Middleware for adding a `:settings` map to a query before it is processed."
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.util.date :as du]))

(defn- settings-for-current-driver []
  (when-let [report-timezone (driver.u/report-timezone-if-supported driver/*driver*)]
    {:report-timezone report-timezone}))

(defn- current-database-timezone-id []
  (when (bound? #'du/*database-timezone*)
    (some-> du/*database-timezone* .getID)))

(defn- system-timezone-id []
  (.getID (java.util.TimeZone/getDefault)))

(defn- expected-timezone-id
  "The timezone that we would *like* to run a query in, regardless of whether we are actaully able to do so. This is
  always equal to the value of the `report-timezone` Setting (if it is set), otherwise the database timezone (if known),
  otherwise the system timezone."
  []
  (or (driver/report-timezone)
      (current-database-timezone-id)
      (system-timezone-id)))

(defn- actual-timezone-id
  "The timezone that a query is actually ran in -- report timezone, if set and supported by the current driver;
  otherwise the timezone of the database (if known), otherwise the system timezone."
  []
  (or (driver.u/report-timezone-if-supported driver/*driver*)
      (current-database-timezone-id)
      (system-timezone-id)))

(defn add-settings
  "Adds the `:settings` map to the query which can contain any fixed properties that would be useful at execution time,
  and to the results of the query. Currently supports a settings object like:

       {:report-timezone \"US/Pacific\"}"
  [qp]
  (fn [query]
    (let [{:keys [report-timezone], :as settings} (settings-for-current-driver)
          query                                   (cond-> query
                                                    settings (assoc :settings settings))
          results                                 (qp query)]
      (update results
              :data
              assoc
              :requested_timezone (expected-timezone-id)
              :results_timezone   (actual-timezone-id)))))
