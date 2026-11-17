(ns metabase.sync.hooks
  "Hooks that sync a Database once the user who created it or connected its stub has saved it."
  (:require
   [metabase.sync.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouses.core :as warehouses]))

(set! *warn-on-reflection* true)

(defn after-database-saved
  "Hook for `database` after a user saved it, `previous-database` being the stored Database before the write, or nil
  for a new one, which starts a sync in another thread when it is new or its stub was connected."
  [previous-database database]
  (try
    (when (and database
               (not (:is_stub database))
               (or (nil? previous-database) (:is_stub previous-database))
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
      (log/warnf "Failed to sync Database %s: %s" (:id database) (ex-message e)))))
