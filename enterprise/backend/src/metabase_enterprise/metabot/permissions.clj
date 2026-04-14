(ns metabase-enterprise.metabot.permissions
  "Enterprise implementation of metabot permission resolution.
  Resolves per-group permissions from the database, taking the most permissive
  value across all of a user's groups."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise resolve-user-permissions
  "Resolve the effective metabot permissions for a user by taking the most
  permissive value across all their groups. Returns a map of perm-type → value,
  with defaults filled in for any unset permission types."
  :feature :ai-controls
  [user-id]
  (if-not user-id
    scope/all-yes-permissions
    (let [stored  (t2/select :model/MetabotPermissions
                             {:where [:in :group_id
                                      {:select [:group_id]
                                       :from   [(t2/table-name :model/PermissionsGroupMembership)]
                                       :where  [:= :user_id user-id]}]})
          by-type (group-by :perm_type stored)]
      (reduce-kv
       (fn [acc perm-type default-value]
         (let [values (map :perm_value (get by-type perm-type))]
           (assoc acc perm-type
                  (if (seq values)
                    (scope/most-permissive-value perm-type values)
                    default-value))))
       {}
       scope/perm-type-defaults))))
