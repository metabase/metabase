(ns metabase-enterprise.advanced-permissions.common
  (:require [metabase.api.common :as api]
            [metabase.models :refer [PermissionsGroupMembership]]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features :as premium-features]
            [toucan.db :as db]))

(defn friendly-user-name
  "Return a friendly name for  `user`."
  [user]
  (cond
   (keyword user)       user
   (:is_superuser user) "admin"
   :else                "non-admin"))

(defn with-advanced-permissions
  "Adds to `user` a set of boolean flag indiciate whether or not current user has access to an advanced permissions.
  This function is meant to be used for GET /api/user/current "
  [user]
  (let [permissions-set @api/*current-user-permissions-set*]
    (assoc user :permissions
           {:can_access_setting      (perms/set-has-general-permission-of-type? permissions-set :setting)
            :can_access_subscription (perms/set-has-general-permission-of-type? permissions-set :subscription)
            :can_access_monitoring   (perms/set-has-general-permission-of-type? permissions-set :monitoring)
            :can_access_data_model   (perms/set-has-partial-permissions? permissions-set "/data-model/")
            :can_access_db_details   (perms/set-has-partial-permissions? permissions-set "/details/")
            :is_group_manager        api/*is-group-manager?*})))

(defn current-user-has-general-permissions?
  "Check if `*current-user*` has permissions for a general permissions of type `perm-type`."
  [perm-type]
  (or api/*is-superuser?*
      (perms/set-has-general-permission-of-type? @api/*current-user-permissions-set* perm-type)))

(defn current-user-is-manager?
  "Return true if current-user is a manager of `group-id`.
  If `group-id` is `nil`, return true if current-user is manager of at least one group"
  [group-id]
  (if group-id
    (db/select-one-field :is_group_manager PermissionsGroupMembership :user_id api/*current-user-id* :group_id group-id)
    api/*is-group-manager?*))

(defn filter-tables-by-data-model-perms
  "Given a list of tables, removes the ones for which `*current-user*` does not have data model editing permissions.
  Returns the list unmodified if the :advanced-permissions feature flag is not enabled."
  [tables]
  (if (or api/*is-superuser?*
          (not (premium-features/enable-advanced-permissions?)))
    tables
    (filter
     (fn [{table-id :id db-id :db_id schema :schema}]
       (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                        (perms/feature-perms-path :data-model :all db-id schema table-id)))
     tables)))
