(ns metabase.sync.events.sync-database
  (:require
   [metabase.events.core :as events]
   [metabase.sync.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouses.core :as warehouses]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/database-create ::event)
(events/derive! :event/database-update ::event)

(methodical/defmethod events/publish-event! ::event
  "When a Database is created by a user or a stub Database gets connected, kick off a sync process for it in a
  different thread."
  [topic {database :object previous-database :previous-object :keys [user-id]}]
  (try
    (when (and user-id
               database
               (not (:is_stub database))
               (or (= topic :event/database-create)
                   (:is_stub previous-database))
               (not (warehouses/disable-auto-sync)))
      (quick-task/submit-task!
       (fn []
         (try
           (if (:is_full_sync database)
             (sync/sync-database! (u/the-id database))
             (sync-metadata/sync-db-metadata! (u/the-id database)))
           (catch Throwable e
             (log/errorf "Error syncing Database %s: %s" (u/the-id database) (ex-message e)))))))
    (catch Throwable e
      (log/warnf "Failed to process sync-database event: %s: %s" topic (ex-message e)))))
