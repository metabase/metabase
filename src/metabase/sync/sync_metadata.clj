(ns metabase.sync.sync-metadata
  "Logic responsible for syncing the metadata for an entire database.
   Delegates to different subtasks:

   1.  Sync tables (`metabase.sync.sync-metadata.tables`)
   2.  Sync fields (`metabase.sync.sync-metadata.fields`)
   3.  Sync FKs    (`metabase.sync.sync-metadata.fks`)
   4.  Sync Metabase Metadata table (`metabase.sync.sync-metadata.metabase-metadata`)"
  (:require [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.sync-metadata
             [fields :as sync-fields]
             [fks :as sync-fks]
             [metabase-metadata :as metabase-metadata]
             [sync-timezone :as sync-tz]
             [tables :as sync-tables]]
            [schema.core :as s]))

(s/defn ^:always-validate sync-db-metadata!
  "Sync the metadata for a Metabase DATABASE. This makes sure child Table & Field objects are synchronized."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :sync-metadata database (format "Sync metadata for %s" (sync-util/name-for-logging database))
    (sync-tz/sync-timezone! database)
    ;; Make sure the relevant table models are up-to-date
    (sync-tables/sync-tables! database)
    ;; Now for each table, sync the fields
    (sync-fields/sync-fields! database)
    ;; Now for each table, sync the FKS. This has to be done after syncing all the fields to make sure target fields exist
    (sync-fks/sync-fks! database)
    ;; finally, sync the metadata metadata table if it exists.
    (metabase-metadata/sync-metabase-metadata! database)))

(s/defn ^:always-validatge sync-table-metadata!
  "Sync the metadata for an individual TABLE -- make sure Fields and FKs are up-to-date."
  [table :- i/TableInstance]
  (sync-fields/sync-fields-for-table! table)
  (sync-fks/sync-fks-for-table! table))
