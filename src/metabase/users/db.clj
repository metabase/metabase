(ns metabase.users.db
  "Application database queries for the users module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn set-user-last-login-now!
  "Set `last_login` of the User with `user-id` to now."
  [user-id]
  (t2/update! :model/User user-id {:last_login :%now}))

(defn user-settings-row
  "The `:settings` of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :settings] :id user-id))

(defn delete-pulse-channel-recipients-for-user!
  "Delete every PulseChannelRecipient of the User with `user-id`."
  [user-id]
  (t2/delete! :model/PulseChannelRecipient :user_id user-id))

(defn group-membership-exists?
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [group-id user-id]
  (t2/exists? :model/PermissionsGroupMembership :group_id group-id :user_id user-id))

(defn user-group-ids
  "The ids of the PermissionsGroups the User with `user-id` belongs to."
  [user-id]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(defn group-memberships-for-users
  "The user id, group id (as `:id`), and group manager flag of the PermissionsGroupMemberships of the Users with
  `user-ids`."
  [user-ids]
  (t2/select [:model/PermissionsGroupMembership :user_id [:group_id :id] :is_group_manager] :user_id [:in user-ids]))

(defn user-group-ids-for-users
  "The user id and group id of the PermissionsGroupMemberships of the Users with `user-ids`."
  [user-ids]
  (t2/select [:model/PermissionsGroupMembership :user_id :group_id] :user_id [:in user-ids]))

(defn user-count
  "The number of Users."
  []
  (t2/count :model/User))

(defn tenant-collection-ids
  "A map of Tenant id to tenant Collection id for the Tenants with `tenant-ids`."
  [tenant-ids]
  (t2/select-pk->fn :tenant_collection_id :model/Tenant :id [:in tenant-ids]))

(defn insert-user!
  "Insert the User `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/User row))

(defn same-groups-user-ids
  "The `:user_id`s of the Users sharing a PermissionsGroup other than the one with `all-users-group-id` with the User
  with `user-id`."
  [user-id all-users-group-id]
  (t2/query {:select-distinct [:permissions_group_membership.user_id]
             :from [:permissions_group_membership]
             :where [:in :permissions_group_membership.group_id
                     ^:allow-subquery
                     {:select-distinct [:permissions_group_membership.group_id]
                      :from  [:permissions_group_membership]
                      :where [:and [:= :permissions_group_membership.user_id user-id]
                              [:not= :permissions_group_membership.group_id all-users-group-id]]}]}))

(defn delete-user-parameter-values!
  "Delete the UserParameterValues identified by the `:user_id`, `:dashboard_id`, and `:parameter_id` of `parameters`."
  [parameters]
  (t2/delete! :model/UserParameterValue
              {:where (into [:or] (for [p parameters]
                                    [:and
                                     [:= :user_id (:user_id p)]
                                     [:= :dashboard_id (:dashboard_id p)]
                                     [:= :parameter_id (:parameter_id p)]]))}))

(defn insert-user-parameter-values!
  "Insert the UserParameterValue `rows`."
  [rows]
  (t2/insert! :model/UserParameterValue rows))

(defn user-parameter-values-for-dashboards
  "The UserParameterValues of the User with `user-id` for the Dashboards with `dashboard-ids`."
  [user-id dashboard-ids]
  (t2/select :model/UserParameterValue :dashboard_id [:in dashboard-ids] :user_id user-id))

(defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id]
  (t2/exists? :model/Database :id database-id))

(defn admin-or-self-visible-user
  "The User matching the key-value `conditions`, with the columns an admin or the user themselves may see, or nil."
  [columns & conditions]
  (apply t2/select-one (into [:model/User] columns) conditions))

(defn user-email-exists?
  "Whether a User whose lower-cased email is `lower-case-email` exists."
  [lower-case-email]
  (t2/exists? :model/User :%lower.email lower-case-email))
