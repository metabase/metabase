(ns metabase.events.driver-notifications
  "Driver notifications are used to let drivers know database details or other relevant information has
  changed (`:database-update`) or that a Database has been deleted (`:database-delete`). Drivers can choose to be
  notified of these events by implementing the `metabase.driver/notify-database-updated` multimethod. At the time of
  this writing, the SQL JDBC driver 'superclass' is the only thing that implements this method, and does so to close
  connection pools when database details change or when they are deleted."
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.events :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/database-update ::event)
(derive :event/database-delete ::event)

(methodical/defmethod events/publish-event! ::event
  [topic {database :object, previous-database :previous-object :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    ;; notify the appropriate driver about the updated database to release any related resources, such as connections.
    ;; avoid notifying if the changes shouldn't impact the observable behaviour of any resource, otherwise drivers might
    ;; close connections or other resources unnecessarily (metabase#27877).
    (let [;; remove data that should not impact the observable state of any resource before comparing
          remove-irrelevant-data (fn [db]
                                   (reduce m/dissoc-in db [[:updated_at]
                                                           [:settings :database-enable-actions]]))]
      (when (not= (remove-irrelevant-data database)
                  (remove-irrelevant-data previous-database))
        (driver/notify-database-updated (:engine database) database)))
    (catch Throwable e
      (log/warnf e "Failed to process driver notifications event. %s" topic))))
