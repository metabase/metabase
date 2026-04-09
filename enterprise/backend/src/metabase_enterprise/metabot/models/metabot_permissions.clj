(ns metabase-enterprise.metabot.models.metabot-permissions
  "Toucan2 model registration and DB helpers for `:model/MetabotPermissions`."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotPermissions [_model] :metabot_permissions)

(doto :model/MetabotPermissions
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/MetabotPermissions
  {:perm_type  mi/transform-keyword
   :perm_value mi/transform-keyword})

(defn permissions-for-group
  "Returns the full set of permissions for a group, filling in defaults for any missing perm types."
  [group-id stored-perms]
  (let [stored-by-type (into {} (map (juxt :perm_type identity)) stored-perms)]
    (for [[perm-type default-value] (sort-by key scope/perm-type-defaults)]
      (or (get stored-by-type perm-type)
          {:group_id   group-id
           :perm_type  perm-type
           :perm_value default-value}))))

(defn all-permissions
  "Returns all metabot permissions for all groups, filling in defaults for missing entries."
  []
  (let [groups     (t2/select :model/PermissionsGroup {:order-by [[:id :asc]]})
        stored     (t2/select :model/MetabotPermissions {:order-by [[:group_id :asc] [:perm_type :asc]]})
        by-group   (group-by :group_id stored)]
    {:permissions (vec (mapcat (fn [{:keys [id]}]
                                 (permissions-for-group id (get by-group id [])))
                               groups))}))
