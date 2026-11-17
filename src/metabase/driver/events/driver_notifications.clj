(ns metabase.driver.events.driver-notifications
  "Driver notifications are used to let drivers know that the details or other relevant state of a Database changed
  (`:database-update`). Drivers can choose to be notified by implementing the `metabase.driver/notify-database-updated`
  multimethod. At the time of this writing, the SQL JDBC driver 'superclass' is the only thing that implements this
  method, and does so to close connection pools when database details change or when they are deleted."
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/database-update ::event)
(events/derive! :event/database-delete ::event)

(defn- connection-state
  "What of `database` the resources of its driver depend on, which leaves out the settings that do not change what
  they serve (metabase#27877)."
  [database]
  (-> (perf/select-keys database [:engine :details :settings])
      (cond-> (map? (:settings database)) (m/dissoc-in [:settings :database-enable-actions]))
      (update :settings not-empty)))

(methodical/defmethod events/publish-event! ::event
  [topic {:keys [object previous-object]}]
  (try
    (when (or (= topic :event/database-delete)
              (not= (connection-state object) (connection-state previous-object)))
      (let [database (or object previous-object)]
        (driver/notify-database-updated (:engine database) (driver.u/ensure-lib-database database))))
    (catch Throwable e
      (log/warnf "Failed to process driver notifications event %s: %s" topic (ex-message e)))))
