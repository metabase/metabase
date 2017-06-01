(ns metabase.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require [compojure.core :refer [POST]]
            [metabase
             [driver :as driver]
             [sync-database :as sync-database]]
            [metabase.api.common :as api]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.sync-database
             [analyze :as analyze]
             [cached-values :as cached-values]
             [classify :as classify]]))

(defn- future-sync-and-analyze-table [driver table]
  (future (sync-database/sync-table! table)
          (cached-values/cache-table-data-shape! table)
          (analyze/analyze-table-data-shape! table)
          (classify/classify-table! table)))

(defn- future-sync-and-analyze-database [driver database]
  (future (sync-database/sync-database! database)
          (cached-values/cache-data-shape-for-tables! driver database)
          (analyze/analyze-data-shape-for-tables! driver database)
          (classify/classify-database! database)))

(api/defendpoint POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single `Table`."
  [id :as {{:keys [table_id table_name]} :body}]
  (api/let-404 [database (Database id)
                driver (driver/engine->driver (:engine database))]
    (cond
      table_id (when-let [table (Table :db_id id, :id (int table_id))]
                 (future-sync-and-analyze-table driver table))
      table_name (when-let [table (Table :db_id id, :name table_name)]
                   (future-sync-and-analyze-table driver table))
      :else (future-sync-and-analyze-database driver database)))
  {:success true})

(api/define-routes)
