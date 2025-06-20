(ns metabase.driver.events.report-timezone-updated
  (:require
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(derive ::event :metabase/event)
(derive :event/report-timezone-updated ::event)

(defn- notify-all-databases-updated
  "Send notification that all Databases should immediately release cached resources (i.e., connection pools).

  Currently only used below by [[report-timezone]] setter (i.e., only used when report timezone changes). Reusing
  pooled connections with the old session timezone can have weird effects, especially if report timezone is changed to
  `nil` (meaning subsequent queries will not attempt to change the session timezone) or something considered invalid
  by a given Database (meaning subsequent queries will fail to change the session timezone)."
  []
  (doseq [{driver :engine, id :id, :as database} (t2/select :model/Database)]
    (try
      (driver/notify-database-updated driver database)
      (catch Throwable e
        (log/errorf e "Failed to notify %s Database %s updated" driver id)))))

(methodical/defmethod driver-api/publish-event! ::event
  "When the report-timezone Setting is updated, call [[metabase.driver/notify-database-updated]] for all Databases."
  [_topic _event]
  (notify-all-databases-updated))
