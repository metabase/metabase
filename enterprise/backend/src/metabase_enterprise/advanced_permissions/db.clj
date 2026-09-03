(ns metabase-enterprise.advanced-permissions.db
  "Application database queries for the advanced-permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn group-manager?
  "Whether the User with `user-id` manages the PermissionsGroup with `group-id`."
  [user-id group-id]
  (t2/select-one-fn :is_group_manager :model/PermissionsGroupMembership :user_id user-id :group_id group-id))

(defn blocked-database-ids-for-group
  "The subset of `database-ids` the group with `group-id` is blocked from viewing."
  [group-id database-ids]
  (t2/select-fn-set :db_id :model/DataPermissions
                    :perm_type :perms/view-data
                    :perm_value :blocked
                    :group_id group-id
                    :db_id [:in database-ids]
                    {:select-distinct [:db_id]}))

(defn impersonated-database-ids-for-group
  "The subset of `database-ids` the group with `group-id` accesses through connection impersonation."
  [group-id database-ids]
  (t2/select-fn-set :db_id :model/ConnectionImpersonation :group_id group-id :db_id [:in database-ids]))

(defn sandboxed-database-ids-for-group
  "The `:db_id` rows of the Databases among `database-ids` the group with `group-id` has a sandbox on."
  [group-id database-ids]
  (t2/query {:select [[:t.db_id :db_id]]
             :from   [[(t2/table-name :model/Sandbox) :s]]
             :join   [[(t2/table-name :model/Table) :t] [:= :s.table_id :t.id]]
             :where  [:and
                      [:= :s.group_id group-id]
                      [:in :t.db_id database-ids]]}))

(defn blocked-group-ids
  "The subset of `group-ids` blocked from viewing some Database."
  [group-ids]
  (t2/select-fn-set :group_id :model/DataPermissions
                    :perm_type :perms/view-data
                    :perm_value :blocked
                    :group_id [:in group-ids]
                    {:select-distinct [:group_id]}))

(defn impersonated-group-ids
  "The subset of `group-ids` with a connection impersonation."
  [group-ids]
  (t2/select-fn-set :group_id :model/ConnectionImpersonation :group_id [:in group-ids]))

(defn sandboxed-group-ids
  "The subset of `group-ids` with a sandbox."
  [group-ids]
  (t2/select-fn-set :group_id :model/Sandbox :group_id [:in group-ids]))

(defn blocked-group-ids-for-database
  "The subset of `group-ids` blocked from viewing the Database with `database-id`."
  [database-id group-ids]
  (t2/select-fn-set :group_id :model/DataPermissions
                    :db_id database-id
                    :perm_type :perms/view-data
                    :perm_value :blocked
                    :group_id [:in group-ids]
                    {:select-distinct [:group_id]}))

(defn sandboxed-group-ids-for-database
  "The `:group_id` rows of the groups among `group-ids` with a sandbox on the Database with `database-id`."
  [database-id group-ids]
  (t2/query {:select [[:s.group_id :group_id]]
             :from   [[(t2/table-name :model/Sandbox) :s]]
             :join   [[(t2/table-name :model/Table) :t] [:= :t.id :s.table_id]]
             :where  [:and
                      [:in :s.group_id group-ids]
                      [:= :t.db_id database-id]]}))

(defn application-permissions
  "The Permissions rows for the root object and every application object."
  []
  (t2/select :model/Permissions
             {:where [:or
                      [:= :object "/"]
                      [:like :object (h2x/literal "/application/%")]]}))

(defn user-group-memberships
  "The group ID (as `:id`) and manager flag of the memberships of the User with `user-id`."
  [user-id]
  (t2/select [:model/PermissionsGroupMembership [:group_id :id] :is_group_manager] :user_id user-id))

(defn managed-group-ids
  "The IDs of the PermissionsGroups the User with `user-id` manages."
  [user-id]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id :is_group_manager true))
