(ns metabase.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single
  `Table`. Optional Parameter `:scan` can be `\"full\"` or `\"schema\"` for a full sync or a schema sync, available
  regardless if a `:table_id` or `:table_name` is passed. Alternatively, if both `:table_name` and `:schema_name` are
  provided the table is assumed to be in the user database but not in metabase. This will cause just the new table to
  be added, synched, and scanned.
  This endpoint is secured by an API key that needs to be passed as a `X-METABASE-APIKEY` header which needs to be defined in
  the `MB_API_KEY` [environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.html#mb_api_key)"
  [id :as {{:keys [table_id schema_name table_name scan synchronous?]} :body}]
  {table_id    (s/maybe su/IntGreaterThanZero)
   schema_name (s/maybe su/NonBlankString)
   table_name  (s/maybe su/NonBlankString)
   scan        (s/maybe (s/enum "full" "schema"))}
  (let [schema?       (when scan (#{"schema" :schema} scan))
        table-sync-fn (if schema? sync-metadata/sync-table-metadata! sync/sync-table!)
        db-sync-fn    (if schema? sync-metadata/sync-db-metadata! sync/sync-database!)]
    (api/let-404 [database (db/select-one Database :id id)]
      (cond-> (cond
                table_id   (api/let-404 [table (db/select-one Table :db_id id, :id (int table_id))]
                             (future (table-sync-fn table)))
                (and schema_name table_name) (if-not (db/select-one Table :db_id id, :name table_name)
                                               (future (sync/sync-new-table! database {:schema-name schema_name
                                                                                       :table-name  table_name}))
                                               (throw
                                                 (ex-info "This table already exists" {:status-code 400})))
                table_name (api/let-404 [table (db/select-one Table :db_id id, :name table_name)]
                             (future (table-sync-fn table)))
                :else      (future (db-sync-fn database)))
        synchronous? deref)))
  {:success true})


(api/define-routes)
