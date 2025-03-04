(ns metabase-enterprise.data-editing.api
  (:require
   [metabase.actions.actions :as actions]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- database-for-table-id [table-id]
  (t2/select-one :model/Database
                 {:select [:d.*]
                  :from   [[:metabase_table :t]]
                  :join   [[:metabase_database :d] [:= :d.id :t.db_id]]
                  :where  [:= :t.id table-id]}))

(defn- perform-bulk-action! [action-kw table-id rows]
  (actions/perform-action! action-kw
                           {:database (:id (database-for-table-id table-id))
                            :table-id table-id
                            :arg      rows}))

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

