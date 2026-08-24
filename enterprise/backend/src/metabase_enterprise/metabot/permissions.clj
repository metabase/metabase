(ns metabase-enterprise.metabot.permissions
  "Enterprise implementation of metabot permission resolution.
  Resolves per-group permissions from the database, taking the most permissive value across the user's groups
  that the active permission mode shows."
  (:require
   [metabase-enterprise.metabot.models.metabot-permissions :as metabot-perms]
   [metabase-enterprise.metabot.settings :as metabot-settings]
   [metabase.metabot.scope :as scope]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise resolve-user-permissions
  "Resolve the effective metabot permissions for a user by taking the most permissive value across the groups
  the active permission mode shows. Returns a map of perm-type → value, with defaults filled in for any unset
  permission types."
  :feature :ai-controls
  [user-id]
  (if-not user-id
    scope/all-yes-permissions
    (let [stored  (t2/select :model/MetabotPermissions
                             {:where [:and
                                      [:in :group_id
                                       ^:allow-subquery
                                       {:select [:group_id]
                                        :from   [(t2/table-name :model/PermissionsGroupMembership)]
                                        :where  [:= :user_id user-id]}]
                                      ;; Rows for a group the active mode hides must not resolve, since a :yes
                                      ;; nobody can see would override every visible :no (#80394). Switching
                                      ;; modes deletes them, but they come back: a serialization import, a
                                      ;; `PUT /api/setting` mode change, or an API write against a hidden group
                                      ;; all make them, and instances that switched modes before this fix still
                                      ;; hold theirs.
                                      (metabot-perms/visible-groups-clause
                                       (metabot-settings/metabot-advanced-permissions))]})
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
