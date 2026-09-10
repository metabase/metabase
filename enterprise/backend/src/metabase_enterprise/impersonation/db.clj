(ns metabase-enterprise.impersonation.db
  "Application database queries for the impersonation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [toucan2.core :as t2]))

(defn impersonation
  "The ConnectionImpersonation with `impersonation-id`, or nil."
  [impersonation-id]
  (t2/select-one :model/ConnectionImpersonation :id impersonation-id))

(defn impersonation-for-group-and-database
  "The ConnectionImpersonation of the group with `group-id` on the Database with `database-id`, or nil."
  [group-id database-id]
  (t2/select-one :model/ConnectionImpersonation :group_id group-id :db_id database-id))

(defn all-impersonations
  "Every ConnectionImpersonation, in ID order."
  []
  (t2/select :model/ConnectionImpersonation {:order-by [[:id :asc]]}))

(defn impersonations-for-groups
  "The ConnectionImpersonations of the groups with `group-ids`."
  [group-ids]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))

(defn impersonations-for-groups-and-database
  "The ConnectionImpersonations of the groups with `group-ids` on the Database with `database-id`."
  [group-ids database-id]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids] :db_id database-id))

(defn impersonations-matching
  "The ConnectionImpersonations narrowed by the optional `database-id`, `group-id`, and `group-ids`, excluding the
  Database with `excluded-database-id` when given."
  [database-id group-id group-ids excluded-database-id]
  (t2/select :model/ConnectionImpersonation
             {:where [:and
                      (when database-id [:= :db_id database-id])
                      (when group-id [:= :group_id group-id])
                      (when group-ids [:in :group_id group-ids])
                      (when excluded-database-id [:not [:= :db_id excluded-database-id]])]}))

(defn impersonation-exists-for-database?
  "Whether the Database with `database-id` has a ConnectionImpersonation."
  [database-id]
  (t2/exists? :model/ConnectionImpersonation :db_id database-id))

(defn insert-impersonation!
  "Insert `impersonation` and return the new instance."
  [impersonation]
  (first (t2/insert-returning-instances! :model/ConnectionImpersonation impersonation)))

(defn delete-impersonation!
  "Delete the ConnectionImpersonation with `impersonation-id`."
  [impersonation-id]
  (t2/delete! :model/ConnectionImpersonation :id impersonation-id))

(defn delete-impersonations-for-group-and-database!
  "Delete the ConnectionImpersonations of the group with `group-id` on the Database with `database-id`."
  [group-id database-id]
  (t2/delete! :model/ConnectionImpersonation :group_id group-id :db_id database-id))

(defn view-data-permission-values
  "The set of database-level view-data permission values `group-ids` hold on the Database with `database-id`."
  [database-id group-ids]
  (t2/select-fn-set :perm_value :model/DataPermissions
                    {:where [:and
                             [:= :db_id database-id]
                             [:= :table_id nil]
                             [:= :perm_type "perms/view-data"]
                             [:in :group_id group-ids]]}))

(defn group-ids-for-user
  "The IDs of the PermissionsGroups the User with `user-id` belongs to."
  [user-id]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))
