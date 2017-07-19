(ns metabase.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require [compojure.core :refer [POST]]
            [metabase
             [driver :as driver]]
            [metabase.api.common :as api]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.sfc :as sfc]
            [schema.core :as s]
            [metabase.util.schema :as su]))

(api/defendpoint POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single `Table`."
  [id :as {{:keys [table_id table_name]} :body}]
  {table_id   (s/maybe s/Int)
   table_name (s/maybe su/NonBlankString)}
  (api/let-404 [database (Database id)
                driver (driver/engine->driver (:engine database))]
    (cond
      table_id   (when-let [table (Table :db_id id, :id table_id)]
                   (sfc/sync-fingerprint-classify-table-async! table))
      table_name (when-let [table (Table :db_id id, :name table_name)]
                   (sfc/sync-fingerprint-classify-table-async! table))
      :else      (sfc/sync-fingerprint-classify-database-async! database)))
  {:success true})

(api/define-routes)
