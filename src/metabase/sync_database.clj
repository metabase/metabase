(ns metabase.sync-database
  "The logic for doing DB and Table syncing itself."
  (:require [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :as qp]
            [metabase.driver :as driver]
            [metabase.events :as events]
            [metabase.models.table :refer [Table], :as table]
            [metabase.sync-database.analyze :as analyze]
            [metabase.sync-database.introspect :as introspect]
            [metabase.sync-database.sync :as sync]
            [metabase.util :as u]))


(declare sync-database-with-tracking!)


(defn sync-database!
  "Sync DATABASE and all its Tables and Fields.

   Takes an optional kwarg `:full-sync?` which determines if we execute our table analysis work.  If this is not specified
   then we default to using the `:is_full_sync` attribute of the database."
  [driver database & {:keys [full-sync?]}]
  (binding [qp/*disable-qp-logging*  true
            db/*sel-disable-logging* true]
    (let [full-sync? (if-not (nil? full-sync?)
                       full-sync?
                       (:is_full_sync database))]
      (driver/sync-in-context driver database (partial sync-database-with-tracking! driver database full-sync?)))))

(defn sync-table!
  "Sync a *single* TABLE and all of its Fields.
   This is used *instead* of `sync-database!` when syncing just one Table is desirable.

   Takes an optional kwarg `:full-sync?` which determines if we execute our table analysis work.  If this is not specified
   then we default to using the `:is_full_sync` attribute of the tables parent database."
  [driver table & {:keys [full-sync?]}]
  (binding [qp/*disable-qp-logging* true]
    (let [database   (table/database table)
          full-sync? (if-not (nil? full-sync?)
                       full-sync?
                       (:is_full_sync database))]
      (driver/sync-in-context driver database (fn []
                                                ;(sync-database-active-tables! driver [table] :analyze? full-sync?)
                                                (events/publish-event :table-sync {:table_id (:id table)}))))))


;;; ## ---------------------------------------- IMPLEMENTATION ----------------------------------------


(defn- sync-database-with-tracking! [driver database full-sync?]
  (let [start-time (System/nanoTime)
        tracking-hash (str (java.util.UUID/randomUUID))]
    (log/info (u/format-color 'magenta "Syncing %s database '%s'..." (name driver) (:name database)))
    (events/publish-event :database-sync-begin {:database_id (:id database) :custom_id tracking-hash})

    ;; TODO :special-type = postgres :json columns + mongo
    ;; TODO :nested-fields = mongo only, move to analyze-table only
    ;;      each field should be just a path from the root to the given field.
    ;;      we'll want some way to reconstructing the path if needed.
    ;; TODO :custom -> :details

    (binding [qp/*disable-qp-logging*  true
              db/*sel-disable-logging* true]
      ;; start with capturing a full introspection of the database
      (introspect/introspect-database-and-update-raw-tables! driver database)

      ;; use the introspected schema information and update our working data models
      (sync/update-data-models-from-raw-tables! driver database)

      ;; now do any in-depth data analysis which requires querying the tables (if enabled)
      (when full-sync?
        (analyze/analyze-data-shape-for-tables! driver database)))

    (events/publish-event :database-sync-end {:database_id (:id database) :custom_id tracking-hash :running_time (int (/ (- (System/nanoTime) start-time) 1000000.0))}) ; convert to ms
    (log/info (u/format-color 'magenta "Finished syncing %s database '%s'. (%s)" (name driver) (:name database)
                              (u/format-nanoseconds (- (System/nanoTime) start-time))))))


;; TODO: might be worth keeping this in metabase.driver NS
(defn generic-analyze-table
  "An implementation of `analyze-table` using the defaults (`default-field-avg-length` and `field-percent-urls`)."
  [driver table new-field-ids]
  ((analyze/make-analyze-table driver) driver table new-field-ids))
