(ns metabase.cache-database
  "The logic for doing DB and Table syncing itself.
   TODO: move this file under the sync_database directory"
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [events :as events]
             [util :as u]]
            [metabase.models.table :as table]
            [metabase.query-processor.interface :as i]
            [metabase.sync-database.cached-values :as cached-values]
            [metabase.sync.util :as sync-util]
            [toucan.db :as db]))

(defn- cache-database-with-tracking! [driver database]
  (sync-util/with-start-and-finish-logging (format "Cache data shape for %s database '%s'" (name driver) (:name database))
    ;; TODO - why is the event name `database-analysis` for CACHING?
    (sync-util/with-sfc-events :database-analysis (u/get-id database)
      (sync-util/with-logging-disabled
        (cached-values/cache-field-values-for-database! database)))))

(defn- cache-table-with-tracking! [driver database table]
  (sync-util/with-start-and-finish-logging (format "Cache data shape for table '%s' from %s database '%s'" (:display_name table) (name driver) (:name database))
    (sync-util/with-logging-disabled
      (cached-values/cache-table-data-shape! driver table))
    (events/publish-event! :table-sync {:table_id (:id table)})))

(defn cache-database-field-values!
  "Analyze DATABASE and all its Tables and Fields."
  [{database-id :id, :as database} & {:keys [full-sync?]}]
  {:pre [(map? database)]}
  ;; if this database is already being synced then bail now
  (sync-util/with-duplicate-ops-prevented :cache database-id
    (sync-util/with-logging-disabled
      (let [db-driver (driver/engine->driver (:engine database))]
        (driver/sync-in-context db-driver database (partial cache-database-with-tracking! db-driver database))))))

(defn cache-table-field-values!
  "Analyze a *single* TABLE and all of its Fields.
   This is used *instead* of `analyze-database!` when syncing just one Table is desirable."
  [table & {:keys [full-sync?]}]
  {:pre [(map? table)]}
  (sync-util/with-logging-disabled
    (let [database   (table/database table)
          db-driver  (driver/engine->driver (:engine database))
          full-sync? (if-not (nil? full-sync?)
                       full-sync?
                       (:is_full_sync database))]
      (driver/sync-in-context db-driver database (partial cache-table-with-tracking! db-driver database table)))))
