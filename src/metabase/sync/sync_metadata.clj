(ns metabase.sync.sync-metadata
  "Logic responsible for syncing the metadata for an entire database.
   Delegates to different subtasks:

   1.  Sync tables (`metabase.sync.sync-metadata.tables`)
   2.  Sync fields (`metabase.sync.sync-metadata.fields`)
   3.  Sync FKs    (`metabase.sync.sync-metadata.fks`)
   4.  Sync indexes (`metabase.sync.sync-metadata.indexes`)
   5.  Sync routines (`metabase.sync.sync-metadata.routines`)
   6.  Sync Metabase Metadata table (`metabase.sync.sync-metadata.metabase-metadata`)"
  (:require
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.dbms-version :as sync-dbms-ver]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.sync.sync-metadata.fks :as sync-fks]
   [metabase.sync.sync-metadata.indexes :as sync-indexes]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.sync.sync-metadata.routines :as sync-routines]
   [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.table :as table]))

(defn- sync-dbms-version-summary [{:keys [version] :as _step-info}]
  (if version
    (format "Found DBMS version %s" version)
    "Could not determine DBMS version"))

(defn- sync-fields-summary [{:keys [total-fields updated-fields] :as _step-info}]
  (format "Total number of fields sync''d %d, number of fields updated %d"
          total-fields updated-fields))

(defn- sync-tables-summary [{:keys [total-tables updated-tables] :as _step-info}]
  (format "Total number of tables sync''d %d, number of tables updated %d"
          total-tables updated-tables))

(defn- sync-timezone-summary [{:keys [timezone-id]}]
  (format "Found timezone id %s" timezone-id))

(defn- sync-fks-summary [{:keys [total-fks updated-fks total-failed]}]
  (format "Total number of foreign keys sync''d %d, %d updated and %d tables failed to update"
          total-fks updated-fks total-failed))

(defn- sync-indexes-summary [{:keys [total-indexes added-indexes removed-indexes]}]
  (format "Total number of indexes sync''d %d, %d added and %d removed"
          total-indexes added-indexes removed-indexes))

(defn- sync-routines-summary [{:keys [total-routines updated-routines]}]
  (format "Total number of routines sync''d %d, number of routines updated %d"
          total-routines updated-routines))

(defn- make-sync-steps [db-metadata]
  [(sync-util/create-sync-step "sync-dbms-version" sync-dbms-ver/sync-dbms-version! sync-dbms-version-summary)
   (sync-util/create-sync-step "sync-timezone" sync-tz/sync-timezone! sync-timezone-summary)
   ;; Make sure the relevant table models are up-to-date
   (sync-util/create-sync-step "sync-tables" #(sync-tables/sync-tables-and-database! % db-metadata) sync-tables-summary)
   ;; Now for each table, sync the fields
   (sync-util/create-sync-step "sync-fields" sync-fields/sync-fields! sync-fields-summary)
   ;; Now for each table, sync the FKS. This has to be done after syncing all the fields to make sure target fields exist
   (sync-util/create-sync-step "sync-fks" sync-fks/sync-fks! sync-fks-summary)
   ;; Sync index info if the database supports it
   (sync-util/create-sync-step "sync-indexes" sync-indexes/maybe-sync-indexes! sync-indexes-summary)
   ;; Sync stored procedures and functions if the database supports it
   (sync-util/create-sync-step "sync-routines" sync-routines/sync-routines! sync-routines-summary)
   ;; Sync the metabase metadata table if it exists.
   (sync-util/create-sync-step "sync-metabase-metadata" #(metabase-metadata/sync-metabase-metadata! % db-metadata))])

(mu/defn sync-db-metadata!
  "Sync the metadata for a Metabase `database`. This makes sure child Table & Field objects are synchronized."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :sync-metadata database (format "Sync metadata for %s" (sync-util/name-for-logging database))
    (let [db-metadata (fetch-metadata/db-metadata database)]
      (u/prog1 (sync-util/run-sync-operation "sync" database (make-sync-steps db-metadata))
        (if (some sync-util/abandon-sync? (map second (:steps <>)))
          (sync-util/set-initial-database-sync-aborted! database)
          (sync-util/set-initial-database-sync-complete! database))))))

(mu/defn sync-table-metadata!
  "Sync the metadata for an individual `table` -- make sure Fields and FKs are up-to-date."
  [table :- i/TableInstance]
  (let [database (table/database table)]
    (sync-fields/sync-fields-for-table! database table)
    (sync-fks/sync-fks-for-table! database table)
    (sync-indexes/maybe-sync-indexes-for-table! database table)))
