(ns metabase.driver.events.driver-notifications
  "Driver notifications are used to let drivers know database details or other relevant information has
  changed (`:database-update`) or that a Database has been deleted (`:database-delete`). Drivers can choose to be
  notified of these events by implementing the `metabase.driver/notify-database-updated` multimethod. At the time of
  this writing, the SQL JDBC driver 'superclass' is the only thing that implements this method, and does so to close
  connection pools when database details change or when they are deleted."
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.mq.core :as mq]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

;;; ----------------------------------------- Topic subscription -------------------------------------------

(defmethod startup/def-startup-logic! ::DriverNotificationSubscription [_]
  ;; Subscribe to connection pool invalidation topic so other nodes can signal us to flush pools.
  (mq/listen! :topic/connection-pool-invalidated
              (fn [{:keys [database-id all-databases]}]
                (if all-databases
                  (doseq [{driver :engine, :as database} (t2/select :model/Database)]
                    (try
                      (driver/notify-database-updated driver database)
                      (catch Throwable e
                        (log/error e "Failed to notify database updated" {:id (:id database)}))))
                  (when-let [database (t2/select-one :model/Database :id database-id)]
                    (try
                      (driver/notify-database-updated (:engine database) database)
                      (catch Throwable e
                        (log/error e "Failed to notify database updated" {:id database-id}))))))))

(derive ::event :metabase/event)
(derive :event/database-update ::event)
(derive :event/database-delete ::event)

(methodical/defmethod driver-api/publish-event! ::event
  [topic {database :object, previous-database :previous-object, details-changed? :details-changed? :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    ;; notify the appropriate driver about the updated database to release any related resources, such as connections.
    ;; avoid notifying if the changes shouldn't impact the observable behaviour of any resource, otherwise drivers might
    ;; close connections or other resources unnecessarily (metabase#27877).
    (let [;; remove data that should not impact the observable state of any resource before comparing
          remove-irrelevant-data (fn [db]
                                   (reduce m/dissoc-in db [[:updated_at]
                                                           [:settings :database-enable-actions]]))]
      (when (or details-changed?
                (not= (remove-irrelevant-data database)
                      (remove-irrelevant-data previous-database)))
        (mq/with-topic :topic/connection-pool-invalidated [t]
          (mq/put t {:database-id (:id database)}))))
    (catch Throwable e
      (log/warnf e "Failed to process driver notifications event. %s" topic))))
