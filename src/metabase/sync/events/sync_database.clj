(ns metabase.sync.events.sync-database
  (:require
   [metabase.events :as events]
   [metabase.sync.concurrent :as sync.concurrent]
   [metabase.sync.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/database-create ::event)

(methodical/defmethod events/publish-event! ::event
  "When a new Database is created, kick off a sync process for it in a different thread."
  [topic {database :object :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when database
      ;; just kick off a sync on another thread
      (sync.concurrent/submit-task!
       (fn []
         (try
           ;; only do the 'full' sync if this is a "full sync" database. Otherwise just do metadata sync only
           (if (:is_full_sync database)
             (sync/sync-database! database)
             (sync-metadata/sync-db-metadata! database))
           (catch Throwable e
             (log/errorf e "Error syncing Database %s" (u/the-id database)))))))
    (catch Throwable e
      (log/warnf e "Failed to process sync-database event: %s" topic))))
