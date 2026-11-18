(ns metabase.driver.events.driver-notifications
  "Notifies drivers, through `metabase.driver/notify-database-updated`, that the details of a Database changed or that
  it was deleted, which the SQL JDBC driver uses to close connection pools."
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
  they serve (metabase#27877), the schema a workspace writes to being read at the use of the Database."
  [database]
  (-> (perf/select-keys database [:engine :details :settings])
      (cond-> (map? (:settings database)) (-> (m/dissoc-in [:settings :database-enable-actions])
                                              (m/dissoc-in [:settings :database-workspace-schema])))
      (update :settings perf/not-empty)))

(methodical/defmethod events/publish-event! ::event
  [topic {:keys [object previous-object]}]
  (try
    (when (or (= topic :event/database-delete)
              (not= (connection-state object) (connection-state previous-object)))
      (let [database (or object previous-object)]
        (driver/notify-database-updated (:engine database) (driver.u/ensure-lib-database database))))
    (catch Throwable e
      (log/warnf "Failed to process driver notifications event %s: %s" topic (ex-message e)))))
