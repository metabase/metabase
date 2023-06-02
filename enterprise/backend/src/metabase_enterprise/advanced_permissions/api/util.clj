(ns metabase-enterprise.advanced-permissions.api.util
  (:require
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defenterprise impersonated-user?
  "Returns a boolean if the current user uses connection impersonation for any database. Will throw an error if
  [[api/*current-user-id*]] is not bound."
  :feature :advanced-permissions
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (let [group-ids          (t2/select-fn-set :group_id PermissionsGroupMembership :user_id *current-user-id*)]
         (seq
          (when (seq group-ids)
            (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))))
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
