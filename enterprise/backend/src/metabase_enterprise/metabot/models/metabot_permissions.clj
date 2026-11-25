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
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotPermissions [_model] :metabot_permissions)

(doto :model/MetabotPermissions
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(t2/deftransforms :model/MetabotPermissions
  {:perm_type  mi/transform-keyword
   :perm_value mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/MetabotPermissions
  [row]
  (let [changes (t2/changes row)]
    (when (some #(contains? changes %) [:perm_type :perm_value])
      (metabot-ee.schema/check-perm-value-fits-type (select-keys row [:perm_type :perm_value]))))
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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- stored-advanced-mode?
  "Whether the stored permission mode is group-level, read whatever the premium token says."
  []
  (boolean (setting/get-value-of-type :boolean :metabot-advanced-permissions)))

(defn- check-visible-group
  "Throws a 400 unless the permission mode selected by `advanced?` shows the group with `group-id`, since a row written
  for a hidden group would take effect unseen on the next mode switch."
  [group-id advanced?]
  (when-not (usage-controls/visible-group? group-id advanced?)
    (throw (ex-info (tru "Group {0} has no AI permissions in the current permission mode." (str group-id)) {:status-code 400}))))

(defn- permission-changes
  "The value of each `[group-id perm-type]` pair after applying `permissions` in order to the `stored` rows by pair,
  and the pairs each permission changed, in order."
  [stored permissions]
  (reduce (fn [acc {:keys [group_id perm_type perm_value]}]
            (let [k [group_id perm_type]]
              (if (= perm_value (get-in acc [:values k]))
                acc
                (-> acc
                    (assoc-in [:values k] perm_value)
                    (update :changed conj k)))))
          {:values (update-vals stored :perm_value) :changed []}
          permissions))

(mu/defn set-metabot-permissions!
  "Set the `:perm_value` of each of `permissions` for its `:group_id` and `:perm_type`, in order, creating the rows
  groups lack, and refuse with a 400, before writing anything, a change for a group the stored permission mode hides."
  [permissions :- [:sequential [:map {:closed true}
                                [:group_id   ms/PositiveInt]
                                [:perm_type  ::metabot-ee.schema/metabot-permissions.perm-type]
                                [:perm_value ::metabot-ee.schema/metabot-permissions.perm-value]]]]
  (when (seq permissions)
    (let [stored                   (u/index-by (juxt :group_id :perm_type)
                                               (metabot.db/permissions-of-groups (vec (distinct (map :group_id permissions)))))
          {:keys [values changed]} (permission-changes stored permissions)
          advanced?                (stored-advanced-mode?)
          changed                  (distinct changed)]
      (run! (fn [[group-id]] (check-visible-group group-id advanced?)) changed)
      (when-let [rows (seq (for [[group-id perm-type :as k] changed
                                 :when (not (stored k))]
                             {:group_id group-id :perm_type perm-type :perm_value (values k)}))]
        (metabot.db/insert-permissions! rows))
      (metabot.db/update-permission-values! (for [k     changed
                                                  :let  [row (stored k)]
                                                  :when (and row (not= (values k) (:perm_value row)))]
                                              {:id (:id row) :perm_value (values k)})))))

(mu/defn delete-hidden-metabot-permissions!
  "Delete the MetabotPermissions rows of the groups the mode selected by `advanced?` hides."
  [advanced? :- :boolean]
  (metabot.db/delete-hidden-group-permissions! advanced?))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotPermissions [_model]
  {:skip? true})
