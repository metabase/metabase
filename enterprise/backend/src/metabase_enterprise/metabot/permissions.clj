(ns metabase-enterprise.metabot.permissions
  "Enterprise implementation of metabot permission resolution.
  Resolves per-group permissions from the database, taking the most permissive value across the user's groups
  that the active permission mode shows."
  (:require
   [metabase-enterprise.metabot.db :as metabot.db]
   [metabase-enterprise.metabot.settings :as metabot-settings]
   [metabase.metabot.scope :as scope]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise resolve-user-permissions
  "Resolve the effective metabot permissions for a user by taking the most permissive value across the groups
  the active permission mode shows. Returns a map of perm-type → value, with defaults filled in for any unset
  permission types."
  :feature :ai-controls
  [user-id]
  (if-not user-id
    scope/all-yes-permissions
    ;; Ignore permission rows for groups hidden by the active mode. An unseen :yes would otherwise override every
    ;; visible :no (#80394). Mode switches delete these rows, but serialization imports and API writes for hidden
    ;; groups can recreate them. A mode change through `PUT /api/setting` can leave them behind. They can also
    ;; remain on instances that switched modes before this fix.
    (let [stored  (metabot.db/visible-permissions-for-user user-id (metabot-settings/metabot-advanced-permissions))
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
