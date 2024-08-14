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
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api/defendpoint POST "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single
  `Table`. Optional Parameter `:scan` can be `\"full\"` or `\"schema\"` for a full sync or a schema sync, available
  regardless if a `:table_id` or `:table_name` is passed.
  This endpoint is secured by an API key that needs to be passed as a `X-METABASE-APIKEY` header which needs to be defined in
  the `MB_API_KEY` [environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.html#mb_api_key)"
  [id :as {{:keys [table_id table_name scan synchronous?]} :body}]
  {id         ms/PositiveInt
   table_id   [:maybe ms/PositiveInt]
   table_name [:maybe ms/NonBlankString]
   scan       [:maybe [:enum "full" "schema"]]}
  (let [schema?       (when scan (#{"schema" :schema} scan))
        table-sync-fn (if schema? sync-metadata/sync-table-metadata! sync/sync-table!)
        db-sync-fn    (if schema? sync-metadata/sync-db-metadata! sync/sync-database!)]
    (api/let-404 [database (t2/select-one Database :id id)]
      (cond-> (cond
                table_id   (api/let-404 [table (t2/select-one Table :db_id id, :id (int table_id))]
                             (future (table-sync-fn table)))
                table_name (api/let-404 [table (t2/select-one Table :db_id id, :name table_name)]
                             (future (table-sync-fn table)))
                :else      (future (db-sync-fn database)))
        synchronous? deref)))
  {:success true})

(defn- without-stacktrace [^Throwable throwable]
  (doto throwable
    (.setStackTrace (make-array StackTraceElement 0))))

(api/defendpoint POST "/db/:id/new-table"
  "Sync a new table without running a full database sync. Requires `schema_name` and `table_name`. Will throw an error
  if the table already exists in Metabase or cannot be found."
  [id :as {{:keys [schema_name table_name]} :body}]
  {id          ms/PositiveInt
   schema_name ms/NonBlankString
   table_name  ms/NonBlankString}
  (api/let-404 [database (t2/select-one Database :id id)]
    (if-not (t2/select-one Table :db_id id :name table_name :schema schema_name)
      (let [driver (driver.u/database->driver database)
            {db-tables :tables} (driver/describe-database driver database)]
        (if-let [table (some (fn [table-in-db]
                               (when (and (= schema_name (:schema table-in-db))
                                          (= table_name (:name table-in-db)))
                                 table-in-db))
                             db-tables)]
          (let [created (sync-tables/create-or-reactivate-table! database table)]
            (doto created
              sync/sync-table!
              sync-util/set-initial-table-sync-complete!))
          (throw (without-stacktrace
                  (ex-info (trs "Unable to identify table ''{0}.{1}''"
                                schema_name table_name)
                           {:status-code 404
                            :schema_name schema_name
                            :table_name  table_name})))))
      (throw (without-stacktrace
              (ex-info (trs "Table ''{0}.{1}'' already exists"
                            schema_name table_name)
                       {:status-code 400
                        :schema_name schema_name
                        :table_name  table_name}))))))

(api/define-routes)
