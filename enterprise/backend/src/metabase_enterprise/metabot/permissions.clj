(ns metabase-enterprise.metabot.permissions
  "Enterprise implementation of metabot permission resolution.
  Resolves per-group permissions from the database, taking the most permissive value across the user's groups
  that the active permission mode shows."
  (:require
   [metabase-enterprise.metabot.settings :as metabot-settings]
   [metabase.metabot.scope :as scope]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- group-id-clause
  "HoneySQL clause restricting resolution to the groups the current permission mode exposes in the admin UI.
  Simple mode only shows Administrators, All Users and All tenant users; group-level mode shows every group
  except All Users and All tenant users. Group-level mode keeps the rows it hides, so they are back in force
  if simple mode is restored; the switch back to simple mode drops the group-level rows. Hidden rows must not
  resolve while they are hidden: a :yes nobody can see would override every visible :no (#80394)."
  []
  (let [default-group-ids [(u/the-id (perms/all-users-group)) (u/the-id (perms/all-external-users-group))]]
    (if (metabot-settings/metabot-advanced-permissions)
      [:not-in :group_id default-group-ids]
      [:in :group_id (conj default-group-ids (u/the-id (perms/admin-group)))])))

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
                                      (group-id-clause)]})
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
