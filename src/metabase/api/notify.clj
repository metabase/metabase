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
            [metabase.sync-database.sync :as sync]))

(api/defendpoint POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single `Table`."
  [id :as {{:keys [table_id table_name]} :body}]
  (api/let-404 [database (Database id)
                driver (driver/engine->driver (:engine database))]
    (cond
      table_id (when-let [table (Table :db_id id, :id (int table_id))]
                 (sync/future-sync-and-analyze-table table))
      table_name (when-let [table (Table :db_id id, :name table_name)]
                   (sync/future-sync-and-analyze-table table))
      :else (sync/future-sync-and-analyze-database database)))
  {:success true})

(api/define-routes)
