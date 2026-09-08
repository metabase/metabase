(ns metabase.permissions.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; ---------------------------------------- Permission definitions ---------------------------------------------------

;; IMPORTANT: If you add a new permission type, `:values` must be ordered from *most* permissive to *least* permissive.
;;
;;  - When fetching a user's permissions, the default behavior is to return the *most* permissive value from any group the
;;    user is in. This can be overridden by defining a custom implementation of `coalesce`.
;;
;;  - If a user does not have any value for the permission when it is fetched, the *least* permissive value is used as a
;;    fallback.

(def data-permissions
  "Permissions which apply to individual databases or tables."
  ;; `legacy-no-self-service` is a deprecated permission which behaves the same as `:unrestricted` but does not override
  ;; `:blocked` in other groups
  {:perms/view-data             {:model :model/Table,    :values [:unrestricted :legacy-no-self-service :blocked]}
   :perms/create-queries        {:model :model/Table,    :values [:query-builder-and-native :query-builder :no]}
   :perms/download-results      {:model :model/Table,    :values [:one-million-rows :ten-thousand-rows :no]}
   :perms/manage-table-metadata {:model :model/Table,    :values [:yes :no]}
   :perms/manage-database       {:model :model/Database, :values [:yes :no]}
   :perms/transforms            {:model :model/Database, :values [:yes :no]}})

(mr/def ::data-permission-type
  "Malli spec for valid permission types."
  (into [:enum {:error/message "Invalid permission type"}]
        (keys data-permissions)))

(mr/def ::data-permission-value
  "Malli spec for a keyword that matches any value in [[Permissions]]."
  (into [:enum {:error/message "Invalid permission value"}]
        (distinct (mapcat :values (vals data-permissions)))))

(mr/def ::application-permissions-revision
  "A ApplicationPermissionsRevision as selected from the app DB: every column of `:application_permissions_revision`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:before     [:or :string :map sequential?]]
   [:after      [:or :string :map sequential?]]
   [:user_id    ::lib.schema.id/user]
   [:created_at ms/TemporalInstant]
   [:remark     [:maybe [:or :string :map sequential?]]]])

(mr/def ::application-permissions-revision.update
  "What an update (or insert) of a ApplicationPermissionsRevision accepts: every column of `:application_permissions_revision` except `id`, all optional."
  [:map {:closed true}
   [:before     {:optional true} [:maybe [:or :string :map sequential?]]]
   [:after      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:remark     {:optional true} [:maybe [:or :string :map sequential?]]]])

(mr/def ::collection-permission-graph-revision
  "A CollectionPermissionGraphRevision as selected from the app DB: every column of `:collection_permission_graph_revision`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:before     [:or :string :map sequential?]]
   [:after      [:or :string :map sequential?]]
   [:user_id    ::lib.schema.id/user]
   [:created_at ms/TemporalInstant]
   [:remark     [:maybe [:or :string :map sequential?]]]])

(mr/def ::collection-permission-graph-revision.update
  "What an update (or insert) of a CollectionPermissionGraphRevision accepts: every column of `:collection_permission_graph_revision` except `id`, all optional."
  [:map {:closed true}
   [:before     {:optional true} [:maybe [:or :string :map sequential?]]]
   [:after      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:remark     {:optional true} [:maybe [:or :string :map sequential?]]]])

(mr/def ::data-permissions
  "A DataPermissions as selected from the app DB: every column of `:data_permissions`."
  [:map {:closed true}
   [:id                  ms/PositiveInt]
   [:group_id            ms/PositiveInt]
   [:perm_type           [:or :keyword :string]]
   [:db_id               ::lib.schema.id/database]
   [:schema_name         [:maybe :string]]
   [:table_id            [:maybe ::lib.schema.id/table]]
   [:perm_value          [:or :keyword :string :map sequential?]]
   [:unique_perms_helper {:optional true} [:maybe :int]]])

(mr/def ::data-permissions.update
  "What an update (or insert) of a DataPermissions accepts: every column of `:data_permissions` except `id`, all optional."
  [:map {:closed true}
   [:group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:perm_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:db_id       {:optional true} [:maybe ::lib.schema.id/database]]
   [:schema_name {:optional true} [:maybe :string]]
   [:table_id    {:optional true} [:maybe ::lib.schema.id/table]]
   [:perm_value  {:optional true} [:maybe [:or :keyword :string :map sequential?]]]])

(mr/def ::permissions
  "A Permissions as selected from the app DB: every column of `:permissions`."
  [:map {:closed true}
   [:id            ms/PositiveInt]
   [:object        :string]
   [:group_id      ms/PositiveInt]
   [:perm_value    [:maybe [:or :keyword :string :map sequential?]]]
   [:perm_type     [:maybe [:or :keyword :string]]]
   [:collection_id [:maybe ::lib.schema.id/collection]]])

(mr/def ::permissions.update
  "What an update (or insert) of a Permissions accepts: every column of `:permissions` except `id`, all optional."
  [:map {:closed true}
   [:object        {:optional true} [:maybe :string]]
   [:group_id      {:optional true} [:maybe ms/PositiveInt]]
   [:perm_value    {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:perm_type     {:optional true} [:maybe [:or :keyword :string]]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])

(mr/def ::permissions-group
  "A PermissionsGroup as selected from the app DB: every column of `:permissions_group`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:name             :string]
   [:entity_id        :string]
   [:magic_group_type [:maybe [:or :keyword :string]]]
   [:is_tenant_group  :boolean]])

(mr/def ::permissions-group.update
  "What an update (or insert) of a PermissionsGroup accepts: every column of `:permissions_group` except `id`, all optional."
  [:map {:closed true}
   [:name             {:optional true} [:maybe :string]]
   [:entity_id        {:optional true} [:maybe :string]]
   [:magic_group_type {:optional true} [:maybe [:or :keyword :string]]]
   [:is_tenant_group  {:optional true} [:maybe :boolean]]])

(mr/def ::permissions-group-membership
  "A PermissionsGroupMembership as selected from the app DB: every column of `:permissions_group_membership`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:user_id          ::lib.schema.id/user]
   [:group_id         ms/PositiveInt]
   [:is_group_manager :boolean]])

(mr/def ::permissions-group-membership.update
  "What an update (or insert) of a PermissionsGroupMembership accepts: every column of `:permissions_group_membership` except `id`, all optional."
  [:map {:closed true}
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:group_id         {:optional true} [:maybe ms/PositiveInt]]
   [:is_group_manager {:optional true} [:maybe :boolean]]])

(mr/def ::permissions-revision
  "A PermissionsRevision as selected from the app DB: every column of `:permissions_revision`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:before     [:or :string :map sequential?]]
   [:after      [:or :string :map sequential?]]
   [:user_id    ::lib.schema.id/user]
   [:created_at ms/TemporalInstant]
   [:remark     [:maybe [:or :string :map sequential?]]]])

(mr/def ::permissions-revision.update
  "What an update (or insert) of a PermissionsRevision accepts: every column of `:permissions_revision` except `id`, all optional."
  [:map {:closed true}
   [:before     {:optional true} [:maybe [:or :string :map sequential?]]]
   [:after      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:remark     {:optional true} [:maybe [:or :string :map sequential?]]]])
