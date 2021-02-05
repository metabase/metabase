(ns metabase.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.models.database :refer [Database]]
            [metabase.models.table :refer [Table]]
            [metabase.sync :as sync]
            [metabase.sync.sync-metadata :as sync-metadata]))

(api/defendpoint POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single
  `Table`. Optional Parameter `:scan` can be `\"full\" or \"schema\" for a full sync or a schema sync, available
  regardless if a `:table_id` or `:table_name` is passed."
  [id :as {{:keys [table_id table_name scan]} :body}]
  (when scan
    (or (contains? #{"full" :full "schema" :schema} scan)
        (throw (ex-info "Optional scan parameter must be either \"full\" or \"scan\""
                        {:status-code 400}))))
  (let [schema? (when scan (#{"schema" :schema} scan))
        table-sync-fn (if schema? sync-metadata/sync-table-metadata! sync/sync-table!)
        db-sync-fn (if schema? sync-metadata/sync-db-metadata! sync/sync-database!)]
    (api/let-404 [database (Database id)]
      (cond
        table_id (when-let [table (Table :db_id id, :id (int table_id))]
                   (future (table-sync-fn table)))
        table_name (when-let [table (Table :db_id id, :name table_name)]
                     (future (table-sync-fn table)))
        :else (future (db-sync-fn database)))))
  {:success true})


(api/define-routes)
