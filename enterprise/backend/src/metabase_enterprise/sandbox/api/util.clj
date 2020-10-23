(ns metabase-enterprise.sandbox.api.util
  "Enterprise specific API utility functions"
  (:require [metabase.api.common :refer [*current-user-permissions-set* *is-superuser?*]]
            [metabase.models.permissions :as perms]
            [metabase.util.i18n :refer [tru]]))

(defn segmented-user?
  "Returns true if the currently logged in user has segmented permissions"
  []
  (boolean
   (when-not *is-superuser?*
     (if-let [current-user-perms @*current-user-permissions-set*]
       (boolean (some #(re-matches perms/segmented-perm-regex %) current-user-perms))
       ;; If the current permissions are nil, then we would return false which could give a potentially segmented user
       ;; access they shouldn't have. If we don't have permissions, we can't determine whether they are segmented, so
       ;; throw.
       (throw (ex-info (str (tru "No permissions found for current user"))
                {:status-code 403}))))))
