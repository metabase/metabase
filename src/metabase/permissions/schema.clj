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

(mr/def ::application-permissions-graph.groups
  "Application permissions by group, or the part of them a change touches: group id -> permission type -> level."
  [:map-of ms/PositiveInt [:map {:closed true}
                           [:setting      {:optional true} [:enum :yes :no]]
                           [:monitoring   {:optional true} [:enum :yes :no]]
                           [:subscription {:optional true} [:enum :yes :no]]]])

(mr/def ::application-permissions-revision.before
  "The `:before` column of a ApplicationPermissionsRevision, decoded."
  ::application-permissions-graph.groups)

(mr/def ::application-permissions-revision.after
  "The `:after` column of a ApplicationPermissionsRevision, decoded."
  ::application-permissions-graph.groups)

(mr/def ::application-permissions-revision
  "A ApplicationPermissionsRevision as selected from the app DB: every column of `:application_permissions_revision`."
  [:merge
   ::application-permissions-revision.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::application-permissions-revision.update
  "What an update (or insert) of a ApplicationPermissionsRevision accepts: every column of `:application_permissions_revision` except `id`, all optional."
  [:map {:closed true}
   [:before     {:optional true} [:maybe ::application-permissions-revision.before]]
   [:after      {:optional true} [:maybe ::application-permissions-revision.after]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:remark     {:optional true} [:maybe :string]]])

(mr/def ::collection-permission-graph.groups
  "Collection permissions by group, or the part of them a change touches: group id -> collection id (or `:root`) -> level."
  [:map-of ms/PositiveInt [:map-of [:or [:= :root] ms/PositiveInt] [:enum :write :read :none]]])

(mr/def ::collection-permission-graph-revision.before
  "The `:before` column of a CollectionPermissionGraphRevision, decoded."
  [:or
   [:= ""]
   [:map {:closed true}
    [:revision  {:optional true} [:maybe :int]]
    [:namespace {:optional true} [:maybe [:or :keyword :string]]]
    [:groups    {:optional true} ::collection-permission-graph.groups]]])

(mr/def ::collection-permission-graph-revision.after
  "The `:after` column of a CollectionPermissionGraphRevision, decoded."
  [:or [:= ""] ::collection-permission-graph.groups])

(mr/def ::collection-permission-graph-revision
  "A CollectionPermissionGraphRevision as selected from the app DB: every column of `:collection_permission_graph_revision`."
  [:merge
   ::collection-permission-graph-revision.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::collection-permission-graph-revision.update
  "What an update (or insert) of a CollectionPermissionGraphRevision accepts: every column of `:collection_permission_graph_revision` except `id`, all optional."
  [:map {:closed true}
   [:before     {:optional true} [:maybe ::collection-permission-graph-revision.before]]
   [:after      {:optional true} [:maybe ::collection-permission-graph-revision.after]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:remark     {:optional true} [:maybe :string]]])

(mr/def ::data-permissions
  "A DataPermissions as selected from the app DB: every column of `:data_permissions`."
  [:merge
   ::data-permissions.update
   [:map {:closed true}
    [:id                  ms/PositiveInt]
    [:unique_perms_helper {:optional true} [:maybe :int]]]])

(mr/def ::data-permissions.update
  "What an update (or insert) of a DataPermissions accepts: every column of `:data_permissions` except `id`, all optional."
  [:map {:closed true}
   [:group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:perm_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:db_id       {:optional true} [:maybe ::lib.schema.id/database]]
   [:schema_name {:optional true} [:maybe :string]]
   [:table_id    {:optional true} [:maybe ::lib.schema.id/table]]
   [:perm_value  {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::permissions
  "A Permissions as selected from the app DB: every column of `:permissions`."
  [:merge
   ::permissions.update
   [:map {:closed true}
    [:id            ms/PositiveInt]]])

(mr/def ::permissions.update
  "What an update (or insert) of a Permissions accepts: every column of `:permissions` except `id`, all optional."
  [:map {:closed true}
   [:object        {:optional true} [:maybe :string]]
   [:group_id      {:optional true} [:maybe ms/PositiveInt]]
   [:perm_value    {:optional true} [:maybe [:or :keyword :string]]]
   [:perm_type     {:optional true} [:maybe [:or :keyword :string]]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])

(mr/def ::data-access-token
  "A persisted [[metabase.permissions.data-access-token/data-access-token]]: the lens a piece of content was produced
  under, as digests of the sandbox, impersonation and routing tokens that applied, keyed by table or database id. A
  lens with nothing applied is `{}`."
  [:map {:closed true}
   [:sandbox       {:optional true} [:map-of ms/PositiveInt :string]]
   [:impersonation {:optional true} [:map-of ms/PositiveInt :string]]
   [:routing       {:optional true} [:map-of ms/PositiveInt :string]]])

(mr/def ::permissions-group
  "A PermissionsGroup as selected from the app DB: every column of `:permissions_group`, plus `:members` some
  callers hydrate onto it."
  [:merge
   ::permissions-group.update
   [:map {:closed true}
    [:id                ms/PositiveInt]
    [:members           {:optional true} [:sequential [:map {:closed true} [:email :string] [:entity_id :string]]]]]])

(mr/def ::permissions-group.member
  "A member of a PermissionsGroup as `metabase.permissions.db/group-members` selects it: the User columns the group
  member list shows, the membership it comes from, and `:is_group_manager` when advanced permissions are enabled."
  [:map {:closed true}
   [:id                                ms/PositiveInt]
   [:user_id                           ms/PositiveInt]
   [:first_name                        [:maybe :string]]
   [:last_name                         [:maybe :string]]
   [:email                             :string]
   [:is_superuser                      :boolean]
   [:type                              [:or :keyword :string]]
   [:group_id                          ms/PositiveInt]
   [:membership_id                     ms/PositiveInt]
   [:is_group_manager {:optional true} [:maybe :boolean]]
   [:common_name      {:optional true} [:maybe :string]]])

(mr/def ::permissions-group.update
  "What an update (or insert) of a PermissionsGroup accepts: every column of `:permissions_group` except `id`, all optional."
  [:map {:closed true}
   [:name              {:optional true} [:maybe :string]]
   [:entity_id         {:optional true} [:maybe :string]]
   [:magic_group_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:is_tenant_group   {:optional true} [:maybe :boolean]]
   [:is_data_app_group {:optional true} [:maybe :boolean]]])

(mr/def ::permissions-group-membership
  "A PermissionsGroupMembership as selected from the app DB: every column of `:permissions_group_membership`."
  [:merge
   ::permissions-group-membership.update
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::permissions-group-membership.update
  "What an update (or insert) of a PermissionsGroupMembership accepts: every column of `:permissions_group_membership` except `id`, all optional."
  [:map {:closed true}
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:group_id         {:optional true} [:maybe ms/PositiveInt]]
   [:is_group_manager {:optional true} [:maybe :boolean]]])

(mr/def ::data-permissions-graph.schemas
  "An API-style data permission on one database: a level for all of it, or schema name -> a level or table id -> level."
  [:or
   :keyword
   [:map-of :string [:or
                     :keyword
                     [:map-of ms/PositiveInt [:or
                                              :keyword
                                              [:map {:closed true}
                                               [:read  {:optional true} :keyword]
                                               [:query {:optional true} :keyword]]]]]]])

(mr/def ::data-permissions-graph.native-and-schemas
  "An API-style data permission split into its native-query level and its per-schema levels."
  [:map {:closed true}
   [:native  {:optional true} [:maybe :keyword]]
   [:schemas {:optional true} ::data-permissions-graph.schemas]])

(mr/def ::data-permissions-graph.groups
  "API-style data permissions by group, or the part of them a change touches: group id -> database id -> permissions."
  [:map-of ms/PositiveInt [:maybe [:map-of ms/PositiveInt [:map {:closed true}
                                                           [:view-data      {:optional true} ::data-permissions-graph.schemas]
                                                           [:create-queries {:optional true} ::data-permissions-graph.schemas]
                                                           [:data           {:optional true} ::data-permissions-graph.native-and-schemas]
                                                           [:download       {:optional true} ::data-permissions-graph.native-and-schemas]
                                                           [:data-model     {:optional true} ::data-permissions-graph.native-and-schemas]
                                                           [:details        {:optional true} [:enum :yes :no]]
                                                           [:transforms     {:optional true} [:enum :yes :no]]]]]])

(mr/def ::permissions-revision.before
  "The `:before` column of a PermissionsRevision, decoded."
  ::data-permissions-graph.groups)

(mr/def ::permissions-revision.after
  "The `:after` column of a PermissionsRevision, decoded."
  ::data-permissions-graph.groups)

(mr/def ::permissions-revision
  "A PermissionsRevision as selected from the app DB: every column of `:permissions_revision`."
  [:merge
   ::permissions-revision.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::permissions-revision.update
  "What an update (or insert) of a PermissionsRevision accepts: every column of `:permissions_revision` except `id`, all optional."
  [:map {:closed true}
   [:before     {:optional true} [:maybe ::permissions-revision.before]]
   [:after      {:optional true} [:maybe ::permissions-revision.after]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:remark     {:optional true} [:maybe :string]]])
