(ns metabase-enterprise.sandbox.api.util
  "Enterprise specific API utility functions"
  (:require
   [clojure.set :as set]
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :refer [GroupTableAccessPolicy]]
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- enforce-sandbox?
  "Takes the permission set for each group a user is in, and a sandbox, and determines whether the sandbox should be
  enforced for the current user. This is done by checking whether the union of permissions in all *other* groups
  provides full data access to the sandboxed table. If so, we don't enforce the sandbox, because the other groups'
  permissions supercede it."
  [group-id->perms-set {group-id :group_id, table-id :table_id}]
  (let [perms-set (->> (dissoc group-id->perms-set group-id)
                       (vals)
                       (apply set/union))]
    (not (perms/set-has-full-permissions? perms-set (perms/table-query-path table-id)))))

(defn enforced-sandboxes
  "Given a list of sandboxes and a list of permission group IDs that the current user is in, filter the sandboxes to
  only include ones that should be enforced for the current user. A sandbox is not enforced if the user is in a
  different permissions group that grants full access to the table."
  [sandboxes group-ids]
  (let [perms               (when (seq group-ids)
                             (t2/select Permissions {:where [:in :group_id group-ids]}))
        group-id->perms-set (-> (group-by :group_id perms)
                                (update-vals (fn [perms] (into #{} (map :object) perms))))]
    (filter (partial enforce-sandbox? group-id->perms-set)
            sandboxes)))

(defenterprise sandboxed-user?
  "Returns true if the currently logged in user has segmented permissions. Throws an exception if no current user
  is bound."
  :feature :sandboxes
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (let [group-ids          (t2/select-fn-set :group_id PermissionsGroupMembership :user_id *current-user-id*)
             sandboxes          (when (seq group-ids)
                                  (t2/select GroupTableAccessPolicy :group_id [:in group-ids]))]
         (seq (enforced-sandboxes sandboxes group-ids)))
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
