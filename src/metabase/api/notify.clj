(ns metabase.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [table :refer [Table]])
            [metabase.sync-database :as sync-database]))


(defendpoint POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single `Table`."
  [id :as {{:keys [table_id table_name]} :body}]
  (let-404 [database (Database id)]
    (cond
      table_id (when-let [table (Table :db_id id, :id (int table_id))]
                 (future (sync-database/sync-table! table)))
      table_name (when-let [table (Table :db_id id, :name table_name)]
                   (future (sync-database/sync-table! table)))
      :else (future (sync-database/sync-database! database))))
  {:success true})


(define-routes)
