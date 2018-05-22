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
            [puppetlabs.i18n.core :refer [trs]]
            [schema.core :as s]))

(defn- sync-fields-summary [{:keys [total-fields updated-fields] :as step-info}]
  (trs "Total number of fields sync''d {0}, number of fields updated {1}"
       total-fields updated-fields))

(defn- sync-tables-summary [{:keys [total-tables updated-tables :as step-info]}]
  (trs "Total number of tables sync''d {0}, number of tables updated {1}"
       total-tables updated-tables))

(defn- sync-timezone-summary [{:keys [timezone-id]}]
  (trs "Found timezone id {0}" timezone-id))

(defn- sync-fks-summary [{:keys [total-fks updated-fks total-failed]}]
  (trs "Total number of foreign keys sync''d {0}, {1} updated and {2} tables failed to update"
       total-fks updated-fks total-failed))

(def ^:private sync-steps
  [(sync-util/create-sync-step "sync-timezone" sync-tz/sync-timezone! sync-timezone-summary)
   ;; Make sure the relevant table models are up-to-date
   (sync-util/create-sync-step "sync-tables" sync-tables/sync-tables! sync-tables-summary)
   ;; Now for each table, sync the fields
   (sync-util/create-sync-step "sync-fields" sync-fields/sync-fields! sync-fields-summary)
   ;; Now for each table, sync the FKS. This has to be done after syncing all the fields to make sure target fields exist
   (sync-util/create-sync-step "sync-fks" sync-fks/sync-fks! sync-fks-summary)
   ;; finally, sync the metadata metadata table if it exists.
   (sync-util/create-sync-step "sync-metabase-metadata" metabase-metadata/sync-metabase-metadata!)])

(s/defn sync-db-metadata!
  "Sync the metadata for a Metabase DATABASE. This makes sure child Table & Field objects are synchronized."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :sync-metadata database (format "Sync metadata for %s" (sync-util/name-for-logging database))
    (sync-util/run-sync-operation "sync" database sync-steps)))

(s/defn sync-table-metadata!
  "Sync the metadata for an individual TABLE -- make sure Fields and FKs are up-to-date."
  [table :- i/TableInstance]
  (sync-fields/sync-fields-for-table! table)
  (sync-fks/sync-fks-for-table! table))
