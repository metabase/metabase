(ns metabase.sync.persist.appdb
  "Default implementation of the sync persist protocols backed by toucan2 / app-db."
  (:require
   [metabase.models.interface :as mi]
   [metabase.sync.persist :as persist]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defrecord AppDbSyncWriter []
  persist/SyncDatabaseWriter
  (set-dbms-version! [_this database-id version]
    (t2/update! :model/Database database-id {:dbms_version version}))

  (set-database-timezone! [_this database-id timezone-id]
    (t2/update! :model/Database database-id {:timezone timezone-id}))

  (set-database-details-version! [_this database-id details version]
    (t2/update! :model/Database database-id
                {:details (assoc details :version version)}))

  (create-table! [_this table-map]
    (t2/insert-returning-instance! :model/Table table-map))

  (reactivate-table! [_this table-id changes]
    (t2/update! :model/Table table-id changes))

  (retire-table! [_this database-id schema table-name]
    (t2/update! :model/Table {:db_id  database-id
                              :schema schema
                              :name   table-name
                              :active true}
                {:active false}))

  (update-table! [_this table-id changes]
    (t2/update! :model/Table table-id changes))

  (update-table-schema! [_this database-id old-schema new-schema]
    (t2/update! :model/Table
                :db_id database-id
                :schema old-schema
                {:schema new-schema}))

  (archive-table! [_this table-id changes]
    (t2/update! :model/Table
                {:id table-id
                 :active false}
                changes)))

(defn sync-writer
  "Create an app-db backed sync writer."
  []
  (->AppDbSyncWriter))

(def writer
  "Singleton app-db backed sync writer."
  (->AppDbSyncWriter))

(defrecord AppDbSyncReader []
  persist/SyncDatabaseReader
  (active-tables [_this database-id]
    (set (t2/select [:model/Table :id :name :schema :data_authority
                     :description :database_require_filter :estimated_row_count
                     :visibility_type :initial_sync_status :is_writable]
                    :db_id database-id
                    :active true)))

  (all-tables [_this database-id]
    (set (t2/select [:model/Table :id :name :schema :data_authority
                     :description :database_require_filter :estimated_row_count
                     :visibility_type :initial_sync_status :is_writable]
                    :db_id database-id)))

  (find-inactive-table-id [_this database-id schema table-name]
    (t2/select-one-pk :model/Table
                      :db_id database-id
                      :schema schema
                      :name table-name
                      :active false))

  (get-table [_this table-id]
    (t2/select-one :model/Table table-id))

  (archivable-tables [_this database-id threshold-expr]
    (t2/select :model/Table
               :db_id database-id
               :active false
               :archived_at nil
               :transform_target false
               :deactivated_at [:< threshold-expr])))

(defn sync-reader
  "Create an app-db backed sync reader."
  []
  (->AppDbSyncReader))

(def reader
  "Singleton app-db backed sync reader."
  (->AppDbSyncReader))
