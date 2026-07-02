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
   [metabase.sync.sync-metadata.indexes :as sync-indexes]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.tracing.core :as tracing]
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

(defn- make-sync-steps [db-metadata]
  [(sync-util/create-sync-step "sync-dbms-version" sync-dbms-ver/sync-dbms-version! sync-dbms-version-summary)
   (sync-util/create-sync-step "sync-timezone" sync-tz/sync-timezone! sync-timezone-summary)
   ;; Make sure the relevant table models are up-to-date
   (sync-util/create-sync-step "sync-tables" #(sync-tables/sync-tables-and-database! % db-metadata) sync-tables-summary true)
   ;; Now for each table, sync the fields
   (sync-util/create-sync-step "sync-fields" sync-fields/sync-fields! sync-fields-summary true)
   ;; Now for each table, sync the FKS. This has to be done after syncing all the fields to make sure target fields exist
   (sync-util/create-sync-step "sync-fks" sync-fks/sync-fks! sync-fks-summary)
   ;; Sync index info if the database supports it
   (sync-util/create-sync-step "sync-indexes" sync-indexes/maybe-sync-indexes! sync-indexes-summary)
   ;; Sync the metabase metadata table if it exists.
   (sync-util/create-sync-step "sync-metabase-metadata" #(metabase-metadata/sync-metabase-metadata! % db-metadata))])

(mu/defn- sync-db-metadata!*
  "Shared core of [[sync-db-metadata!]] and [[sync-db-metadata-explicit!]]: the metadata sync work,
  without the surrounding `*-sync-operation` wrapper (which is what applies the eligibility gating)."
  [database :- i/DatabaseInstance]
  (let [db-metadata     (try
                          (tracing/with-span :sync "sync.metadata.fetch-metadata" {:db/id (:id database)}
                            (fetch-metadata/db-metadata database))
                          (catch Throwable e
                            (sync-util/set-initial-database-sync-aborted! database)
                            (throw e)))
        ;; holder the `sync-tables` step fills with any `_metabase_metadata` table(s) as it streams
        ;; `:tables`, so the later `sync-metabase-metadata` step doesn't have to re-scan them
        db-metadata     (assoc db-metadata :metabase-metadata-tables (volatile! []))
        steps           (make-sync-steps db-metadata)
        essential-steps (into #{} (comp (filter :essential?) (map :step-name)) steps)
        results         (sync-util/run-sync-operation "sync" database steps)]
    (cond
      (some sync-util/abandon-sync? (map second (:steps results)))
      (sync-util/set-initial-database-sync-aborted! database)

      (some (fn [[step-name step-results]]
              (and (contains? essential-steps step-name)
                   (sync-util/step-failed? step-results)))
            (:steps results))
      (sync-util/set-initial-database-sync-aborted! database)

      :else
      (sync-util/set-initial-database-sync-complete! database))
    results))

(mu/defn sync-db-metadata!
  "Sync the metadata for a Metabase `database`. This makes sure child Table & Field objects are synchronized.
  Subject to the `disable-auto-sync` setting; for an explicit user-requested sync use
  [[sync-db-metadata-explicit!]]."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :sync-metadata database (format "Sync metadata for %s" (sync-util/name-for-logging database))
    (sync-db-metadata!* database)))

(mu/defn sync-db-metadata-explicit!
  "Like [[sync-db-metadata!]], but for an explicit, user-requested sync (e.g. the Sync-now button):
  runs even when the `disable-auto-sync` setting is enabled."
  [database :- i/DatabaseInstance]
  (sync-util/explicit-sync-operation :sync-metadata database (format "Sync metadata for %s" (sync-util/name-for-logging database))
                                     (sync-db-metadata!* database)))

(mu/defn sync-table-metadata!
  "Sync the metadata for an individual `table` -- make sure Fields and FKs are up-to-date."
  [table :- i/TableInstance]
  (let [database (table/database table)]
    (sync-fields/sync-fields-for-table! database table)
    (sync-fks/sync-fks-for-table! database table)
    (sync-indexes/maybe-sync-indexes-for-table! database table)))
