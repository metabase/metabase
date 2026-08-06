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

(methodical/defmethod events/publish-event! ::event
  "When a new Database is created, kick off a sync process for it in a different thread."
  [topic {database :object :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when (and database (not (warehouses/disable-auto-sync)))
      ;; just kick off a sync on another thread
      (quick-task/submit-task!
       (fn []
         (try
           ;; only do the 'full' sync if this is a "full sync" database. Otherwise just do metadata sync only
           (if (:is_full_sync database)
             (sync/sync-database! database)
             (sync-metadata/sync-db-metadata! database))
           (catch Throwable e
             (log/errorf "Error syncing Database %s: %s" (u/the-id database) (ex-message e)))))))
    (catch Throwable e
      (log/warnf "Failed to process sync-database event: %s: %s" topic (ex-message e)))))
