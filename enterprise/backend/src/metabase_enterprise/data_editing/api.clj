(ns metabase-enterprise.data-editing.api
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(setting/defsetting database-enable-table-editing
  (i18n/deferred-tru "Whether to enable table data editing for a specific Database.")
  :default false
  :type :boolean
  :visibility :public
  :database-local :only
  :export? true)

(defn- check-driver-support! [{driver :engine, db-id :id, db-name :name :as db}]
  ;; note for now we reuse the :actions driver feature
  (when-not (driver.u/supports? driver :actions db)
    (throw (ex-info (i18n/tru "{0} Database {1} does not support data editing."
                              (u/qualified-name driver)
                              (format "%d %s" db-id (pr-str db-name)))
                    {:status-code 400, :database-id db-id}))))

(defn- check-data-editing-enabled! [{db-id :id db-settings :settings}]
  (binding [setting/*database-local-values* db-settings]
    (when-not (database-enable-table-editing)
      (throw (ex-info (i18n/tru "Data editing is not enabled.")
                      {:status-code 400, :database-id db-id})))))

(defn- perform-bulk-action! [action-kw table-id rows]
  (api/check-superuser)
  (let [db-id (api/check-404 (t2/select-one-fn :db_id [:model/Table :db_id] table-id))
        {:keys [db] :as perform-action-reqs}
        (actions/prepare-perform-action action-kw {:database db-id
                                                   :table-id table-id
                                                   :arg      rows})]
    (check-driver-support! db)
    (check-data-editing-enabled! db)
    (actions/do-perform-action! perform-action-reqs)))

(api.macros/defendpoint :post "/table/:table-id"
  "Insert row(s) into the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (perform-bulk-action! :bulk/create table-id rows))

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (perform-bulk-action! :bulk/update table-id rows))

(api.macros/defendpoint :delete "/table/:table-id"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (perform-bulk-action! :bulk/delete table-id rows))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
