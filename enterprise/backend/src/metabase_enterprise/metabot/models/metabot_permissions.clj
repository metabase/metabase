(ns metabase-enterprise.metabot.models.metabot-permissions
  "Toucan2 model registration and DB helpers for `:model/MetabotPermissions`."
  (:require
   [metabase-enterprise.metabot.db :as metabot.db]
   [metabase-enterprise.metabot.schema :as metabot-ee.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.usage-controls :as usage-controls]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotPermissions [_model] :metabot_permissions)

(doto :model/MetabotPermissions
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(defmethod app-db-copy/spec :model/MetabotPermissions [_model]
  {:skip? true})

(t2/deftransforms :model/MetabotPermissions
  {:perm_type  mi/transform-keyword
   :perm_value mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- stored-advanced-mode?
  "Whether the stored permission mode is group-level, read whatever the premium token says."
  []
  (boolean (setting/get-value-of-type :boolean :metabot-advanced-permissions)))

(defn- check-visible-group
  "Throws a 400 unless the stored permission mode shows the group with `group-id`, since a row written for a hidden
  group would take effect unseen on the next mode switch."
  [group-id]
  (when-not (usage-controls/visible-group? group-id (stored-advanced-mode?))
    (throw (ex-info (tru "Group {0} has no AI permissions in the current permission mode." (str group-id)) {:status-code 400}))))

(t2/define-before-insert :model/MetabotPermissions
  [{:keys [group_id] :as row}]
  (check-visible-group group_id)
  row)

(t2/define-before-update :model/MetabotPermissions
  [row]
  (let [changes (t2/changes row)]
    (when (some #(contains? changes %) [:perm_type :perm_value])
      (metabot-ee.schema/check-perm-value-fits-type (select-keys row [:perm_type :perm_value])))
    (when (seq changes)
      (check-visible-group (:group_id row))))
  row)

(defn permissions-for-group
  "Returns the full set of permissions for a group, filling in defaults for any missing perm types."
  [group-id stored-perms]
  (let [stored-by-type (u/index-by :perm_type stored-perms)]
    (for [[perm-type default-value] (sort-by key scope/perm-type-defaults)]
      (or (get stored-by-type perm-type)
          {:group_id   group-id
           :perm_type  perm-type
           :perm_value default-value}))))

(defn all-permissions
  "Returns all metabot permissions for all groups, filling in defaults for missing entries."
  []
  (let [groups     (metabot.db/all-groups)
        stored     (metabot.db/all-stored-permissions)
        by-group   (group-by :group_id stored)]
    {:permissions (vec (mapcat (fn [{:keys [id]}]
                                 (permissions-for-group id (get by-group id [])))
                               groups))}))
