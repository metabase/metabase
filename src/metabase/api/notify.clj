(ns metabase.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.sync :as sync]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

(s/defn ^:private metabase-table-descriptor
  "Find the table description from describe-database matching the provided name and schema. For databases with no schema
  (e.g. Mongo), pass `nil`. `nil` is returned if there is no matching table."
  [db :- i/DatabaseInstance
   {:keys [schema_name table_name]} :- {:schema_name (s/maybe su/NonBlankString)
                                        :table_name  su/NonBlankString}]
  (let [db-driver    (driver.u/database->driver db)
        {db-tables :tables} (driver/describe-database db-driver db)
        target-table {:schema schema_name :name table_name}]
    (some
     (fn [db-table]
       (when (= target-table (select-keys db-table [:schema :name]))
         db-table))
     db-tables)))

(s/defn ^:private get-or-create-table
  "Given a table name and schema, return the existing metabase table of that name and schema or create and return the
  metabase table if it can be found by `describe-database`."
  [db :- i/DatabaseInstance
   {:keys [schema_name table_name] :as args} :- {:schema_name (s/maybe su/NonBlankString)
                                                 :table_name  su/NonBlankString}]
  (or
   ;; Get the metabase table if it exists
   (db/select-one Table :db_id (:id db) :schema schema_name :name table_name)
   ;; Create and return the table if metabase can find it via `describe-database`
   (some->> (metabase-table-descriptor db args)
            (sync-tables/create-or-reactivate-table! db))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single
  `Table`. Optional Parameter `:scan` can be `\"full\"` or `\"schema\"` for a full sync or a schema sync, available
  regardless if a `:table_id` or `:table_name` is passed. Alternatively, if both `:table_name` and `:schema_name` are
  provided the table is assumed to be in the user database but not in metabase. This will cause just the new table to
  be added, synched, or scanned depending on the `:scan` parameter.
  This endpoint is secured by an API key that needs to be passed as a `X-METABASE-APIKEY` header which needs to be defined in
  the `MB_API_KEY` [environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.html#mb_api_key)"
  [id :as {{:keys [table_id schema_name table_name scan synchronous?] :as body} :body}]
  {table_id    (s/maybe su/IntGreaterThanZero)
   schema_name (s/maybe su/NonBlankString)
   table_name  (s/maybe su/NonBlankString)
   scan        (s/maybe (s/enum "full" "schema"))}
  (let [schema?       (when scan (#{"schema" :schema} scan))
        table-sync-fn (if schema? sync-metadata/sync-table-metadata! sync/sync-table!)
        db-sync-fn    (if schema? sync-metadata/sync-db-metadata! sync/sync-database!)]
    (api/let-404 [database (db/select-one Database :id id)]
      (cond-> (cond
                table_id (api/let-404 [table (db/select-one Table :db_id id, :id (int table_id))]
                           (future (table-sync-fn table)))
                table_name (let [table-spec (select-keys body [:schema_name :table_name])
                                 [table ambiguous-table :as tables] (if (contains? body :schema_name)
                                                                      [(get-or-create-table database table-spec)]
                                                                      (db/select Table :db_id id :name table_name))]
                             (cond
                               ambiguous-table (let [msg (trs
                                                          "Table ''{0}'' is ambiguous ({1} potential tables found). Please provide a schema."
                                                          table_name
                                                          (count tables))]
                                                 (throw (ex-info msg {:status-code 400})))
                               table (future (table-sync-fn table))
                               :else  (let [msg (if (contains? body :schema_name)
                                                  (trs
                                                   "Warehouse table ''{0}'' does not exist or you do not have permission to view it."
                                                   table_name)
                                                  (trs
                                                   "Metabase table ''{0}'' does not exist. If it exists in the warehouse you must also specify a schema to sync it."
                                                   table_name))]
                                       (throw (ex-info msg {:status-code 404})))))
                :else (future (db-sync-fn database)))
              synchronous? deref)))
  {:success true})


(api/define-routes)
