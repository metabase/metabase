(ns metabase.sync.api.notify
  "/api/notify/* endpoints which receive inbound etl server notifications."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/db/:id"
  "Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single
  `Table`. Optional Parameter `:scan` can be `\"full\"` or `\"schema\"` for a full sync or a schema sync, available
  regardless if a `:table_id` or `:table_name` is passed.
  This endpoint is secured by an API key that needs to be passed as a `X-METABASE-APIKEY` header which needs to be defined in
  the `MB_API_KEY` [environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.html#mb_api_key)"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [table_id table_name scan synchronous?]} :- [:map
                                                       [:table_id   {:optional true} [:maybe ms/PositiveInt]]
                                                       [:table_name {:optional true} [:maybe ms/NonBlankString]]
                                                       [:scan       {:optional true} [:maybe [:enum "full" "schema"]]]]]
  (let [schema?       (when scan (#{"schema" :schema} scan))
        table-sync-fn (if schema? sync-metadata/sync-table-metadata! sync/sync-table!)
        db-sync-fn    (if schema? sync-metadata/sync-db-metadata! sync/sync-database!)]
    (api/let-404 [database (t2/select-one :model/Database :id id)]
      (let [table (cond
                    table_id   (api/check-404 (t2/select-one :model/Table :db_id id, :id (int table_id)))
                    table_name (api/check-404 (t2/select-one :model/Table :db_id id, :name table_name)))]
        (cond-> (future (if table
                          (table-sync-fn table)
                          (db-sync-fn database)))
          synchronous? deref))))
  {:success true})

(defn- without-stacktrace [^Throwable throwable]
  (doto throwable
    (.setStackTrace (make-array StackTraceElement 0))))

(defn- find-and-sync-new-table
  [database table-name schema-name]
  (let [driver (driver.u/database->driver database)
        table  {:name   table-name
                :schema schema-name}]
    (if (driver/table-exists? driver database table)
      (let [created (sync-tables/create-or-reactivate-table! database table)]
        (doto created
          sync/sync-table!
          sync-util/set-initial-table-sync-complete!))
      (throw (without-stacktrace
              (ex-info (trs "Unable to identify table ''{0}.{1}''"
                            schema-name table-name)
                       {:status-code 404
                        :schema_name schema-name
                        :table_name  table-name}))))))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/db/attached_datawarehouse"
  "Sync the attached datawarehouse. Can provide in the body:
  - table_name and schema_name: both strings. Will look for an existing table and sync it, otherwise will try to find a
  new table with that name and sync it. If it cannot find a table it will throw an error. If table_name is empty or
  blank, will sync the entire database.
  - synchronous?: is a boolean value to indicate if this should block on the result."
  [_route-params
   _query-params
   {:keys [table_name schema_name synchronous?]} :- [:map
                                                     [:table_name   {:optional true} [:maybe ms/NonBlankString]]
                                                     [:schema_name  {:optional true} [:maybe string?]]
                                                     [:synchronous? {:default false} [:maybe ms/BooleanValue]]]]
  (api/let-404 [database (t2/select-one :model/Database :is_attached_dwh true)]
    (if (str/blank? table_name)
      (cond-> (future (sync-metadata/sync-db-metadata! database))
        synchronous? deref)
      (if-let [table (t2/select-one :model/Table :db_id (:id database), :name table_name :schema schema_name)]
        (cond-> (future (sync-metadata/sync-table-metadata! table))
          synchronous? deref)
        ;; find and sync is always synchronous. And we want it to be so since the "can't find this table" error is
        ;; rather informative. If it's on a future we won't see it.
        (find-and-sync-new-table database table_name schema_name))))
  {:success true})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/db/:id/new-table"
  "Sync a new table without running a full database sync. Requires `schema_name` and `table_name`. Will throw an error
  if the table already exists in Metabase or cannot be found."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [schema_name table_name]} :- [:map
                                        [:schema_name ms/NonBlankString]
                                        [:table_name  ms/NonBlankString]]]
  (api/let-404 [database (t2/select-one :model/Database :id id)]
    (if-not (t2/select-one :model/Table :db_id id :name table_name :schema schema_name)
      (find-and-sync-new-table database table_name schema_name)
      (throw (without-stacktrace
              (ex-info (trs "Table ''{0}.{1}'' already exists"
                            schema_name table_name)
                       {:status-code 400
                        :schema_name schema_name
                        :table_name  table_name}))))))
