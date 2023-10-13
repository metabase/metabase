(ns metabase.events.sync-database
  (:require
   [metabase.events :as events]
   [metabase.models.database :refer [Database]]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)
(derive :event/database-create ::event)

(methodical/defmethod events/publish-event! ::event
  [topic object]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when object
      (when-let [database (t2/select-one Database :id (events/object->model-id topic object))]
        ;; just kick off a sync on another thread
        (future
          (try
            ;; only do the 'full' sync if this is a "full sync" database. Otherwise just do metadata sync only
            (if (:is_full_sync database)
              (sync/sync-database! database)
              (sync-metadata/sync-db-metadata! database))
            (catch Throwable e
              (log/error e (trs "Error syncing Database {0}" (u/the-id database))))))))
    (catch Throwable e
      (log/warnf e "Failed to process sync-database event: %s" topic))))
