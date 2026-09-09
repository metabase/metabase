(ns metabase-enterprise.advanced-permissions.db
  "Application database queries for the advanced-permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(mu/defn table :- [:maybe ::warehouse-schema.schema/table.row]
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id))

(mu/defn group-manager? :- [:maybe :boolean]
  "Whether the User with `user-id` manages the PermissionsGroup with `group-id`."
  [user-id  :- ::lib.schema.id/user
   group-id :- ms/PositiveInt]
  (t2/select-one-fn :is_group_manager :model/PermissionsGroupMembership :user_id user-id :group_id group-id))

(mu/defn blocked-database-ids-for-group :- [:maybe [:set ::lib.schema.id/database]]
  "The subset of `database-ids` the group with `group-id` is blocked from viewing."
  [group-id     :- ms/PositiveInt
   database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-fn-set :db_id :model/DataPermissions
                    :perm_type :perms/view-data
                    :perm_value :blocked
                    :group_id group-id
                    :db_id [:in database-ids]
                    {:select-distinct [:db_id]}))

(mu/defn impersonated-database-ids-for-group :- [:maybe [:set ::lib.schema.id/database]]
  "The subset of `database-ids` the group with `group-id` accesses through connection impersonation."
  [group-id     :- ms/PositiveInt
   database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-fn-set :db_id :model/ConnectionImpersonation :group_id group-id :db_id [:in database-ids]))

(mu/defn sandboxed-database-ids-for-group :- [:sequential [:map {:closed true} [:db_id ::lib.schema.id/database]]]
  "The `:db_id` rows of the Databases among `database-ids` the group with `group-id` has a sandbox on."
  [group-id     :- ms/PositiveInt
   database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/query {:select [[:t.db_id :db_id]]
             :from   [[(t2/table-name :model/Sandbox) :s]]
             :join   [[(t2/table-name :model/Table) :t] [:= :s.table_id :t.id]]
             :where  [:and
                      [:= :s.group_id group-id]
                      [:in :t.db_id database-ids]]}))

(mu/defn blocked-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The subset of `group-ids` blocked from viewing some Database."
  [group-ids :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :group_id :model/DataPermissions
                    :perm_type :perms/view-data
                    :perm_value :blocked
                    :group_id [:in group-ids]
                    {:select-distinct [:group_id]}))

(mu/defn impersonated-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The subset of `group-ids` with a connection impersonation."
  [group-ids :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :group_id :model/ConnectionImpersonation :group_id [:in group-ids]))

(mu/defn sandboxed-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The subset of `group-ids` with a sandbox."
  [group-ids :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :group_id :model/Sandbox :group_id [:in group-ids]))

(mu/defn blocked-group-ids-for-database :- [:maybe [:set ms/PositiveInt]]
  "The subset of `group-ids` blocked from viewing the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :group_id :model/DataPermissions
                    :db_id database-id
                    :perm_type :perms/view-data
                    :perm_value :blocked
                    :group_id [:in group-ids]
                    {:select-distinct [:group_id]}))

(mu/defn sandboxed-group-ids-for-database :- [:sequential [:map {:closed true} [:group_id ms/PositiveInt]]]
  "The `:group_id` rows of the groups among `group-ids` with a sandbox on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:sequential ms/PositiveInt]]
  (t2/query {:select [[:s.group_id :group_id]]
             :from   [[(t2/table-name :model/Sandbox) :s]]
             :join   [[(t2/table-name :model/Table) :t] [:= :t.id :s.table_id]]
             :where  [:and
                      [:in :s.group_id group-ids]
                      [:= :t.db_id database-id]]}))

(mu/defn application-permissions :- [:sequential ::permissions.schema/permissions]
  "The Permissions rows for the root object and every application object."
  []
  (t2/select :model/Permissions
             {:where [:or
                      [:= :object "/"]
                      [:like :object (h2x/literal "/application/%")]]}))

(def ^:private UserGroupMembership
  "Rows returned by [[user-group-memberships]]."
  (mu/rename-keys (mut/select-keys ::permissions.schema/permissions-group-membership
                                   [:group_id :is_group_manager])
                  {:group_id :id}))

(mu/defn user-group-memberships :- [:sequential UserGroupMembership]
  "The group ID (as `:id`) and manager flag of the memberships of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select [:model/PermissionsGroupMembership [:group_id :id] :is_group_manager] :user_id user-id))

(mu/defn managed-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the PermissionsGroups the User with `user-id` manages."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id :is_group_manager true))
