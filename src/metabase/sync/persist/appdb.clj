(ns metabase.sync.persist.appdb
  "Default implementation of the sync persist protocols backed by toucan2 / app-db."
  (:require
   [metabase.sync.persist :as persist]
   [toucan2.core :as t2]))

(defrecord AppDbSyncWriter []
  persist/SyncDatabaseWriter
  (set-dbms-version! [_this database-id version]
    (t2/update! :model/Database database-id {:dbms_version version}))

  (set-database-timezone! [_this database-id timezone-id]
    (t2/update! :model/Database database-id {:timezone timezone-id})))

(defn sync-writer
  "Create an app-db backed sync writer."
  []
  (->AppDbSyncWriter))

(defrecord AppDbSyncReader []
  persist/SyncDatabaseReader
  ;; No reader methods yet.
  )

(defn sync-reader
  "Create an app-db backed sync reader."
  []
  (->AppDbSyncReader))
