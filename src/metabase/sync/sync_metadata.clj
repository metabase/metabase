(ns metabase.sync.sync-metadata
  "Logic responsible for syncing the metadata for an entire database.
   Delegates to different subtasks:

   1.  Sync tables (`metabase.sync.sync-metadata.tables`)
   2.  Sync fields (`metabase.sync.sync-metadata.fields`)
   3.  Sync FKs    (`metabase.sync.sync-metadata.fks`)
   4.  Sync Metabase Metadata table (`metabase.sync.sync-metadata.metabase-metadata`)"
  (:require
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.dbms-version :as sync-dbms-ver]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.sync.sync-metadata.fks :as sync-fks]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [schema.core :as s]))

(defn- sync-dbms-version-summary [{:keys [version] :as _step-info}]
  (if version
    (trs "Found DBMS version {0}" version)
    (trs "Could not determine DBMS version")))

(defn- sync-fields-summary [{:keys [total-fields updated-fields] :as _step-info}]
  (trs "Total number of fields sync''d {0}, number of fields updated {1}"
       total-fields updated-fields))

(defn- sync-tables-summary [{:keys [total-tables updated-tables] :as _step-info}]
  (trs "Total number of tables sync''d {0}, number of tables updated {1}"
       total-tables updated-tables))

(defn- sync-timezone-summary [{:keys [timezone-id]}]
  (trs "Found timezone id {0}" timezone-id))

(defn- sync-fks-summary [{:keys [total-fks updated-fks total-failed]}]
  (trs "Total number of foreign keys sync''d {0}, {1} updated and {2} tables failed to update"
       total-fks updated-fks total-failed))

(defn- activate-tables-summary [{:keys [updated-tables]}]
  (trs "Total number of tables activated {0}"
       updated-tables))

(defn- make-sync-steps [db-metadata]
  [(sync-util/create-sync-step "sync-dbms-version" sync-dbms-ver/sync-dbms-version! sync-dbms-version-summary)
   (sync-util/create-sync-step "sync-timezone" sync-tz/sync-timezone! sync-timezone-summary)
   ;; Make sure the relevant table models are up-to-date
   (sync-util/create-sync-step "sync-tables" #(sync-tables/sync-tables-and-database! % db-metadata) sync-tables-summary)
   ;; Now for each table, sync the fields
   (sync-util/create-sync-step "sync-fields" sync-fields/sync-fields! sync-fields-summary)
   ;; Now for each table, sync the FKS. This has to be done after syncing all the fields to make sure target fields exist
   (sync-util/create-sync-step "sync-fks" sync-fks/sync-fks! sync-fks-summary)
   ;; Now activate newly created tables and reactivate old ones
   (sync-util/create-sync-step "activate-new-tables" #(sync-tables/activate-new-tables! % db-metadata) activate-tables-summary)
   ;; finally, sync the metabase metadata table if it exists.
   (sync-util/create-sync-step "sync-metabase-metadata" #(metabase-metadata/sync-metabase-metadata! % db-metadata))])

(s/defn sync-db-metadata!
  "Sync the metadata for a Metabase `database`. This makes sure child Table & Field objects are synchronized."
  [database :- i/DatabaseInstance]
  (let [db-metadata (fetch-metadata/db-metadata database)]
    (sync-util/sync-operation :sync-metadata database (format "Sync metadata for %s" (sync-util/name-for-logging database))
      (u/prog1 (sync-util/run-sync-operation "sync" database (make-sync-steps db-metadata))
        (if (some sync-util/abandon-sync? (map second (:steps <>)))
          (sync-util/set-initial-database-sync-aborted! database)
          (sync-util/set-initial-database-sync-complete! database))))))

(s/defn sync-table-metadata!
  "Sync the metadata for an individual `table` -- make sure Fields and FKs are up-to-date."
  [table :- i/TableInstance]
  (sync-fields/sync-fields-for-table! table)
  (sync-fks/sync-fks-for-table! table))
