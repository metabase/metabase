(ns metabase-enterprise.advanced-permissions.common
  (:require [metabase.api.common :as api]
            [metabase.models.permissions :as perms]))

(defn with-advanced-permissions
  "Adds to `user` a set of boolean flag indiciate whether or not current user has access to an advanced permissions.
  This function is meant to be used for GET /api/user/current "
  [user]
  (let [permissions-set @api/*current-user-permissions-set*]
    (assoc user :permissions
           {:can_access_setting      (perms/set-has-general-permission-of-type? permissions-set :setting)
            :can_access_subscription (perms/set-has-general-permission-of-type? permissions-set :subscription)
            :can_access_monitoring   (perms/set-has-general-permission-of-type? permissions-set :monitoring)})))

(defn current-user-has-general-permissions?
  "Check if `*current-user*` has permissions for a general permissions of type `perm-type`."
  [perm-type]
  (or api/*is-superuser?*
      (perms/set-has-general-permission-of-type? @api/*current-user-permissions-set* perm-type)))
