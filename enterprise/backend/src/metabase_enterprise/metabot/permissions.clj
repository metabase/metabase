(ns metabase-enterprise.metabot.permissions
  "Enterprise implementation of metabot permission resolution.
  Resolves per-group permissions from the database, taking the most permissive
  value across all of a user's groups. Also registers the Toucan2 model for
  `:model/MetabotPermissions`."
  (:require
   [metabase.metabot.models.metabot-permissions :as metabot-permissions]
   [metabase.metabot.scope :as scope]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.users.models.user :as user]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ──────────────────────────────────────────────────────────────────
;;; Model registration
;;; ──────────────────────────────────────────────────────────────────

(methodical/defmethod t2/table-name :model/MetabotPermissions [_model] :metabot_permissions)

(doto :model/MetabotPermissions
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/MetabotPermissions
  {:perm_type  mi/transform-keyword
   :perm_value mi/transform-keyword})

(defenterprise resolve-user-permissions
  "Resolve the effective metabot permissions for a user by taking the most
  permissive value across all their groups. Returns a map of perm-type → value,
  with defaults filled in for any unset permission types."
  :feature :ai-controls
  [user-id]
  (if-not user-id
    metabot-permissions/perm-type-defaults
    (let [group-ids (user/group-ids user-id)
          stored    (when (seq group-ids)
                      (t2/select :model/MetabotPermissions
                                 :group_id [:in group-ids]))
          by-type   (group-by :perm_type stored)]
      (reduce-kv
       (fn [acc perm-type default-value]
         (let [values (map :perm_value (get by-type perm-type))]
           (assoc acc perm-type
                  (if (seq values)
                    (scope/most-permissive-value perm-type values)
                    default-value))))
       {}
       metabot-permissions/perm-type-defaults))))
