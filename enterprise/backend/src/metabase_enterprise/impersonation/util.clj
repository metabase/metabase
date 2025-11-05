(ns metabase-enterprise.impersonation.util
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defenterprise impersonation-enforced-for-db?
  "Returns a boolean if the current user has a connection impersonation policy which should be enforced for the provided
  database. Will throw an error if [[api/*current-user-id*]] is not bound."
  :feature :advanced-permissions
  [db-or-id]
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (seq (impersonation.driver/enforced-impersonations-for-db db-or-id))
       ;; If no *current-user-id* is bound we can't check for impersonations, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be using impersonation.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))

;; TODO: this function should only return true if an impersonation policy is enforced for the user
(defenterprise impersonated-user?
  "Returns a boolean if the current user is in a group that has a connection impersonation in place for any database.
  Note: this function does not check whether the impersonation is *enforced* for the current user, since another group's
  permissions may supersede it. Will throw an error if [[api/*current-user-id*]] is not bound."
  :feature :advanced-permissions
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (let [group-ids (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id *current-user-id*)]
         (seq
          (when (seq group-ids)
            (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))))
       ;; If no *current-user-id* is bound we can't check for impersonations, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be using impersonation.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
