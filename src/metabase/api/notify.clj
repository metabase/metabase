(ns metabase.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [table :refer [Table]])))


(defendpoint POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single `Table`."
  [id :as {{:keys [table_id table_name] :as body} :body}]
  (let-404 [database (sel :one Database :id id)]
    (cond
      table_id (when-let [table (sel :one Table :db_id id :id (int table_id))]
                 (future (driver/sync-table table)))
      table_name (when-let [table (sel :one Table :db_id id :name table_name)]
                   (future (driver/sync-table table)))
      :else (future (driver/sync-database database))))
  {:success true})


(define-routes)
