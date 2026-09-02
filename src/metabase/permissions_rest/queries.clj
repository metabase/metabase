(ns metabase.permissions-rest.queries
  "Application database queries for the permissions REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn permissions-groups
  "The PermissionsGroups selected by the Honey SQL `query`."
  [query]
  (t2/select :model/PermissionsGroup query))

(defn hydrate-member-count
  "Hydrate `:member_count` onto `groups`."
  [groups]
  (t2/hydrate groups :member_count))

(defn hydrate-members
  "Hydrate `:members` onto `group`."
  [group]
  (t2/hydrate group :members))

(defn permissions-group
  "The PermissionsGroup with `id`, or nil."
  [id]
  (t2/select-one :model/PermissionsGroup :id id))

(defn permissions-group-exists?
  "Whether a PermissionsGroup with `id` exists."
  [id]
  (t2/exists? :model/PermissionsGroup :id id))

(defn insert-permissions-group!
  "Insert a PermissionsGroup and return the inserted instance."
  [group-name tenant-group?]
  (t2/insert-returning-instance! :model/PermissionsGroup :name group-name :is_tenant_group tenant-group?))

(defn rename-permissions-group!
  "Set the name of the PermissionsGroup with `id`."
  [id group-name]
  (t2/update! :model/PermissionsGroup id {:name group-name}))

(defn delete-permissions-group!
  "Delete the PermissionsGroup with `id`."
  [id]
  (t2/delete! :model/PermissionsGroup :id id))

(defn group-memberships
  "The membership id, group id, user id, and group manager flag of the PermissionsGroupMemberships selected by the
  Honey SQL `query`."
  [query]
  (t2/select [:model/PermissionsGroupMembership [:id :membership_id] :group_id :user_id :is_group_manager] query))

(defn non-admin-user-exists?
  "Whether the User with `user-id` exists and is not a superuser."
  [user-id]
  (t2/exists? :model/User :id user-id :is_superuser false))

(defn group-membership
  "The PermissionsGroupMembership with `id`, or nil."
  [id]
  (t2/select-one :model/PermissionsGroupMembership :id id))

(defn set-group-membership-manager!
  "Set the group manager flag of the PermissionsGroupMembership with `id`."
  [id group-manager?]
  (t2/update! :model/PermissionsGroupMembership id {:is_group_manager group-manager?}))

(defn non-destination-database-ids
  "The ids of the Databases that are not routing destinations and also match the Honey SQL `extra-clause` (nil for
  no restriction)."
  [extra-clause]
  (t2/select-pks-vec :model/Database {:where [:and extra-clause [:= :router_database_id nil]]}))

(defn data-permissions-reducible
  "A reducible of the type, group id, value, database id, schema, and table id of the DataPermissions rows of
  non-destination Databases also matching each of the Honey SQL `clauses` (nils ignored), ordered by group and
  database."
  [clauses]
  (t2/reducible-query
   {:select   [[:perm_type :type]
               [:group_id :group-id]
               [:perm_value :value]
               [:db_id :db-id]
               [:schema_name :schema]
               [:table_id :table-id]]
    :from     [(t2/table-name :model/DataPermissions)]
    :where    (conj (into [:and] clauses)
                    [:not [:exists ^:allow-subquery {:select [1]
                                                     :from   [[(t2/table-name :model/Database) :router_db]]
                                                     :where  [:and
                                                              [:not= :router_db.router_database_id nil]
                                                              [:= :router_db.id :db_id]]}]])
    :order-by [:group_id :db_id]}))

(defn tables-for-databases
  "The id, Database id, and schema of the Tables of the Databases with `database-ids`."
  [database-ids]
  (t2/select [:model/Table :id :db_id :schema] :db_id [:in database-ids]))
