(ns metabase.warehouse-schema-rest.api.table-symlink
  "/api/table-symlink endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::table-symlink
  [:map
   [:collection_id ::lib.schema.id/collection]
   [:table_id      ::lib.schema.id/collection]
   [:creator_id    ::lib.schema.id/user]
   [:created_at    ::lib.schema.literal/string.datetime]])

(defn- check-table-query-permissions [table-id]
  (let [database-id (api/check-404 (t2/select-one-fn :db_id :model/Table :id table-id))]
    (when-not (query-perms/can-query-table? database-id table-id)
      (throw (ex-info (i18n/tru "You must have data permissions to create a symlink for Table {0}."
                                (pr-str (t2/select-one-fn :name :model/Table :id table-id)))
                      {:status-code        403
                       :database-id        database-id
                       :table-id           table-id
                       :actual-permissions @api/*current-user-permissions-set*})))))

(api.macros/defendpoint :post "/" :- ::table-symlink
  "Create a new Table Symlink (add a Table to a Collection). Only one symlink per Table + Collection is allowed.

  To create a Table Symlink you must have Collection curate permissions for the Collection in question as well as
  full Table data permissions (full query permissions) for the Table in question."
  [_route-params
   _query-params
   {collection-id :collection_id, table-id :table_id, :as _body-params} :- [:map
                                                                            [:collection_id ::lib.schema.id/collection]
                                                                            [:table_id      ::lib.schema.id/table]]]
  (api/write-check :model/Collection collection-id)
  (check-table-query-permissions table-id)
  (t2/insert-returning-instance! :model/TableSymlink {:collection_id collection-id
                                                      :table_id      table-id
                                                      :creator_id    api/*current-user-id*}))

;;; I'm putting the the params here in the body in the endpoints rather than the route for uniformity with the POST
;;; endpoint above -- Cam

(api.macros/defendpoint :delete "/"
  "Delete a Table Symlink.

  To delete a Table Symlink you must have Collection curate permissions."
  [_route-params
   _query-params
   {collection-id :collection_id, table-id :table_id, :as _body-params} :- [:map
                                                                            [:collection_id ::lib.schema.id/collection]
                                                                            [:table_id      ::lib.schema.id/table]]]
  (api/write-check :model/Collection collection-id)
  (t2/delete! :model/TableSymlink {:collection_id collection-id
                                   :table_id      table-id})
  api/generic-204-no-content)

(api.macros/defendpoint :post "/move" :- ::table-symlink
  "Move a Table Symlink from one Collection to another.

  To move a Table Symlink you must have Collection curate permissions for both Collections as well as full Table data
  permissions for the Table."
  [_route-params
   _query-params
   {old-collection-id :old_collection_id
    new-collection-id :new_collection_id
    table-id          :table_id
    :as               _body-params} :- [:and
                                        [:map
                                         [:old_collection_id ::lib.schema.id/collection]
                                         [:new_collection_id ::lib.schema.id/collection]
                                         [:table_id          ::lib.schema.id/table]]
                                        [:fn
                                         {:description   "old_collection_id and new_collection_id must be different"
                                          :error/message "old_collection_id and new_collection_id must be different"}
                                         #(not= (:old_collection_id %) (:new-collection_id %))]]]
  (api/write-check :model/Collection old-collection-id)
  (api/write-check :model/Collection new-collection-id)
  (check-table-query-permissions table-id)
  (t2/with-transaction [_]
    (t2/delete! :model/TableSymlink {:collection_id old-collection-id
                                     :table_id      table-id})
    (t2/insert-returning-instance! :model/TableSymlink {:collection_id new-collection-id
                                                        :table_id      table-id
                                                        :creator_id    api/*current-user-id*})))
