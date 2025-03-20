(ns metabase-enterprise.data-editing.api
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events :as events]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- perform-bulk-action! [action-kw table-id rows]
  (api/check-superuser)
  (actions/perform-action! action-kw
                           {:database (api/check-404 (t2/select-one-fn :db_id [:model/Table :db_id] table-id))
                            :table-id table-id
                            :arg      rows}
                           :policy   :data-editing))

(api.macros/defendpoint :post "/table/:table-id"
  "Insert row(s) into the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (let [created-rows (:created-rows (perform-bulk-action! :bulk/create table-id rows))]
    (doseq [row created-rows]
      (events/publish-event! :event/data-editing-row-create
                             {:table_id    table-id
                              :created_row row
                              :actor_id    api/*current-user-id*}))))

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (doseq [row rows]
    (let [before {} ;; TODO fetch this
          ;; well, this is a trick, but I haven't figured out how to do single row update
          result (:rows-updated (perform-bulk-action! :bulk/update table-id [row]))]
      (when (pos-int? result)
        (events/publish-event! :event/data-editing-row-update
                               {:table_id    table-id
                                :updated_row row
                                :before_row  before
                                :actor_id    api/*current-user-id*})))))

(api.macros/defendpoint :delete "/table/:table-id"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (perform-bulk-action! :bulk/delete table-id rows)
  (doseq [row rows]
    (events/publish-event! :event/data-editing-row-delete
                           {:table_id    table-id
                            :deleted_row row ;; TODO, enrich these rows with data before deletion
                            :actor_id    api/*current-user-id*})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
