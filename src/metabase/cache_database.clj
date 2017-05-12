(ns metabase.cache-database
  "The logic for doing DB and Table syncing itself."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [events :as events]
             [util :as u]]
            [metabase.models.table :as table]
            [metabase.query-processor.interface :as i]
            [metabase.sync-database.cached-values :as cached-values]
            [toucan.db :as db]))

(defonce ^:private currently-syncing-dbs (atom #{}))

(defn- cache-database-with-tracking! [driver database]
  (let [start-time (System/nanoTime)
        tracking-hash (str (java.util.UUID/randomUUID))]
    (log/info (u/format-color 'magenta "Syncing %s database '%s'..." (name driver) (:name database)))
    (events/publish-event! :database-analysis-begin {:database_id (:id database) :custom_id tracking-hash})

    (binding [i/*disable-qp-logging*  true
              db/*disable-db-logging* true]
      ;; now do any in-depth data analysis which requires querying the tables (if enabled)
      (cached-values/cache-data-shape-for-tables! driver database))

    (events/publish-event! :database-analysis-end {:database_id  (:id database)
                                                   :custom_id    tracking-hash
                                                   :running_time (int (/ (- (System/nanoTime) start-time) 1000000.0))}) ; convert to ms
    (log/info (u/format-color 'magenta "Finished analyzing %s database '%s'. (%s)" (name driver) (:name database)
                              (u/format-nanoseconds (- (System/nanoTime) start-time))))))

(defn- cache-table-with-tracking! [driver database table]
  (let [start-time (System/nanoTime)]
    (log/info (u/format-color 'magenta "Analyzing table '%s' from %s database '%s'..." (:display_name table) (name driver) (:name database)))

    (binding [i/*disable-qp-logging* true
              db/*disable-db-logging* true]
      (cached-values/cache-table-data-shape! driver table))

    (events/publish-event! :table-sync {:table_id (:id table)})
    (log/info (u/format-color 'magenta "Finished syncing table '%s' from %s database '%s'. (%s)" (:display_name table) (name driver) (:name database)
                              (u/format-nanoseconds (- (System/nanoTime) start-time))))))

(defn cache-database!
  "Analyze DATABASE and all its Tables and Fields."
  [{database-id :id, :as database} & {:keys [full-sync?]}]
  {:pre [(map? database)]}
  ;; if this database is already being synced then bail now
  (when-not (contains? @currently-syncing-dbs database-id)
    (binding [i/*disable-qp-logging*  true
              db/*disable-db-logging* true]
      (let [db-driver  (driver/engine->driver (:engine database))]
        (try
          ;; mark this database as currently syncing so we can prevent duplicate sync attempts (#2337)
          (swap! currently-syncing-dbs conj database-id)
          ;; do our work
          (driver/sync-in-context db-driver database (partial cache-database-with-tracking! db-driver database))
          (finally
            ;; always cleanup our tracking when we are through
            (swap! currently-syncing-dbs disj database-id)))))))

(defn cache-table!
  "Analyze a *single* TABLE and all of its Fields.
   This is used *instead* of `analyze-database!` when syncing just one Table is desirable."
  [table & {:keys [full-sync?]}]
  {:pre [(map? table)]}
  (binding [i/*disable-qp-logging* true]
    (let [database   (table/database table)
          db-driver  (driver/engine->driver (:engine database))
          full-sync? (if-not (nil? full-sync?)
                       full-sync?
                       (:is_full_sync database))]
      (driver/sync-in-context db-driver database (partial cache-table-with-tracking! db-driver database table)))))



