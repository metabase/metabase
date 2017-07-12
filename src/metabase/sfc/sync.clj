(ns metabase.sfc.sync
  "The logic for doing DB and Table syncing itself."
  (:require [metabase
             [driver :as driver]
             [events :as events]
             [util :as u]]
            [metabase.models
             [raw-table :as raw-table]
             [table :as table]]
            [metabase.sfc
             [analyze :as analyze]
             [introspect :as introspect]
             [util :as sfc-util]]
            [metabase.sfc.introspect.sync :as introspect-sync]
            [metabase.sfc.sync.dynamic :as sync-dynamic]))

;;; ------------------------------------------------------------ Sync Table ------------------------------------------------------------

(defn- -sync-table! [driver database table full-sync?]
  (sfc-util/with-start-and-finish-logging (format "Sync table '%s' from %s database '%s'..." (:display_name table) (name driver) (:name database))
    (sfc-util/with-logging-disabled
      ;; if the Table has a RawTable backing it then do an introspection and sync
      (when-let [raw-table (raw-table/RawTable (:raw_table_id table))]
        (introspect/introspect-raw-table-and-update! driver database raw-table)
        (introspect-sync/update-data-models-for-table! table))
      ;; if this table comes from a dynamic schema db then run that sync process now
      (when (driver/driver-supports? driver :dynamic-schema)
        (sync-dynamic/scan-table-and-update-data-model! driver database table)))
    (events/publish-event! :table-sync {:table_id (:id table)})))


(defn sync-table!
  "Sync a *single* TABLE and all of its Fields.
   This is used *instead* of `sync-database!` when syncing just one Table is desirable.

   Takes an optional kwarg `:full-sync?` which determines if we execute our table analysis work.  If this is not specified
   then we default to using the `:is_full_sync` attribute of the tables parent database."
  [table & {:keys [full-sync?]}]
  {:pre [(map? table)]}
  (sfc-util/with-logging-disabled
    (let [database   (table/database table)
          db-driver  (driver/engine->driver (:engine database))
          full-sync? (if-not (nil? full-sync?)
                       full-sync?
                       (:is_full_sync database))]
      (driver/sync-in-context db-driver database (partial -sync-table! db-driver database table full-sync?)))))


;;; ------------------------------------------------------------ Sync Database ------------------------------------------------------------

(defn- -sync-database! [driver database full-sync?]
  (sfc-util/with-start-and-finish-logging (format "Sync %s database '%s'..." (name driver) (:name database))
    (sfc-util/with-sfc-events :database-sync (u/get-id database)
      (sfc-util/with-logging-disabled
        ;; start with capturing a full introspection of the database
        (introspect/introspect-database-and-update-raw-tables! driver database)
        ;; use the introspected schema information and update our working data models
        (if (driver/driver-supports? driver :dynamic-schema)
          (sync-dynamic/scan-database-and-update-data-model! driver database)
          (introspect-sync/update-data-models-from-raw-tables! database))
        ;; now do any in-depth data analysis which requires querying the tables (if enabled)
        (when full-sync?
          (analyze/analyze-database! database))))))

(defn sync-database!
  "Sync DATABASE and all its Tables and Fields.

   Takes an optional kwarg `:full-sync?` which determines if we execute our table analysis work.  If this is not specified
   then we default to using the `:is_full_sync` attribute of the database."
  [{database-id :id, :as database} & {:keys [full-sync?]}]
  {:pre [(map? database)]}
  ;; if this database is already being synced then bail now
  (sfc-util/with-duplicate-ops-prevented :sync database-id
    (sfc-util/with-logging-disabled
      (let [db-driver  (driver/database-id->driver database-id)
            full-sync? (if-not (nil? full-sync?)
                         full-sync?
                         (:is_full_sync database))]
        (driver/sync-in-context db-driver database (partial -sync-database! db-driver database full-sync?))))))
