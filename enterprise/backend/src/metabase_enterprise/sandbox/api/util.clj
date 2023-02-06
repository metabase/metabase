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
   [metabase.util.i18n :refer [tru]]
   [toucan.db :as db]))

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
  "Given a list of sandboxes, filters it to only include sandboxes that should be enforced for the current user.
  A sandbox is not enforced if the user is in a different permissions group that grants full access to the table."
  [sandboxes]
  (let [group-ids           (dedupe (map :group_id sandboxes))
        perms               (when (seq group-ids)
                             (db/select Permissions {:where [:in :group_id group-ids]}))
        group-id->perms-set (-> (group-by :group_id perms)
                                (update-vals (fn [perms] (into #{} (map :object) perms))))]
    (filter (partial enforce-sandbox? group-id->perms-set)
            sandboxes)))

(defn segmented-user?
  "Returns true if the currently logged in user has segmented permissions. Throws an exception if no current user
  is bound."
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (let [group-ids          (db/select-field :group_id PermissionsGroupMembership :user_id *current-user-id*)
             sandboxes          (when (seq group-ids)
                                  (db/select GroupTableAccessPolicy :group_id [:in group-ids]))]
           (seq (enforced-sandboxes sandboxes)))
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
