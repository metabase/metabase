(ns metabase-enterprise.impersonation.db
  "Application database queries for the impersonation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn impersonation :- [:maybe ::impersonation.schema/connection-impersonation]
  "The ConnectionImpersonation with `impersonation-id`, or nil."
  [impersonation-id :- ms/PositiveInt]
  (t2/select-one :model/ConnectionImpersonation :id impersonation-id))

(mu/defn impersonation-for-group-and-database :- [:maybe ::impersonation.schema/connection-impersonation]
  "The ConnectionImpersonation of the group with `group-id` on the Database with `database-id`, or nil."
  [group-id    :- ms/PositiveInt
   database-id :- ::lib.schema.id/database]
  (t2/select-one :model/ConnectionImpersonation :group_id group-id :db_id database-id))

(mu/defn all-impersonations :- [:sequential ::impersonation.schema/connection-impersonation]
  "Every ConnectionImpersonation, in ID order."
  []
  (t2/select :model/ConnectionImpersonation {:order-by [[:id :asc]]}))

(mu/defn impersonations-for-groups :- [:sequential ::impersonation.schema/connection-impersonation]
  "The ConnectionImpersonations of the groups with `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))

(mu/defn impersonations-for-groups-and-database :- [:sequential ::impersonation.schema/connection-impersonation]
  "The ConnectionImpersonations of the groups with `group-ids` on the Database with `database-id`."
  [group-ids   :- [:set ms/PositiveInt]
   database-id :- ::lib.schema.id/database]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids] :db_id database-id))

(mu/defn impersonations-matching :- [:sequential ::impersonation.schema/connection-impersonation]
  "The ConnectionImpersonations narrowed by the optional `database-id`, `group-id`, and `group-ids`, excluding the
  Database with `excluded-database-id` when given."
  [database-id           :- [:maybe ::lib.schema.id/database]
   group-id              :- [:maybe ms/PositiveInt]
   group-ids             :- [:maybe [:sequential ms/PositiveInt]]
   excluded-database-id  :- [:maybe ::lib.schema.id/database]]
  (t2/select :model/ConnectionImpersonation
             {:where [:and
                      (when database-id [:= :db_id database-id])
                      (when group-id [:= :group_id group-id])
                      (when group-ids [:in :group_id group-ids])
                      (when excluded-database-id [:not [:= :db_id excluded-database-id]])]}))

(mu/defn impersonation-exists-for-database? :- :boolean
  "Whether the Database with `database-id` has a ConnectionImpersonation."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/ConnectionImpersonation :db_id database-id))

(mu/defn insert-impersonation! :- ::impersonation.schema/connection-impersonation
  "Insert `impersonation` and return the new instance."
  [impersonation :- (mut/select-keys ::impersonation.schema/connection-impersonation.update [:db_id :group_id :attribute])]
  (first (t2/insert-returning-instances! :model/ConnectionImpersonation impersonation)))

(mu/defn delete-impersonation! :- :int
  "Delete the ConnectionImpersonation with `impersonation-id`."
  [impersonation-id :- ms/PositiveInt]
  (t2/delete! :model/ConnectionImpersonation :id impersonation-id))

(mu/defn delete-impersonations-for-group-and-database! :- :int
  "Delete the ConnectionImpersonations of the group with `group-id` on the Database with `database-id`."
  [group-id    :- ms/PositiveInt
   database-id :- ::lib.schema.id/database]
  (t2/delete! :model/ConnectionImpersonation :group_id group-id :db_id database-id))

(mu/defn view-data-permission-values :- [:maybe [:set [:or :keyword :string]]]
  "The set of database-level view-data permission values `group-ids` hold on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:set ms/PositiveInt]]
  (t2/select-fn-set :perm_value :model/DataPermissions
                    {:where [:and
                             [:= :db_id database-id]
                             [:= :table_id nil]
                             [:= :perm_type "perms/view-data"]
                             [:in :group_id group-ids]]}))

(mu/defn group-ids-for-user :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the PermissionsGroups the User with `user-id` belongs to, or nil when `user-id` is nil (e.g. no
  current user, such as an internal or unauthenticated context)."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))
