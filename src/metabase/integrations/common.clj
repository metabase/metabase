(ns metabase.integrations.common
  "Shared functionality used by different integrations."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [metabase.models
             [permissions-group :as group]
             [permissions-group-membership :refer [PermissionsGroupMembership]]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(defn sync-group-memberships!
  "Update the PermissionsGroups a User belongs to, adding or deleting membership entries as needed so that Users is only
  in `new-groups-or-ids`. Ignores special groups like `admin` and `all-users`."
  [user-or-id new-groups-or-ids]
  (let [special-group-ids  #{(u/get-id (group/admin)) (u/get-id (group/all-users))}
        user-id            (u/get-id user-or-id)
        ;; Get a set of Group IDs the user currently belongs to
        current-group-ids  (db/select-field :group_id PermissionsGroupMembership
                             :user_id  user-id
                             :group_id [:not-in special-group-ids])
        new-group-ids      (set (map u/get-id new-groups-or-ids))
        ;; determine what's different between current groups and new groups
        [to-remove to-add] (data/diff current-group-ids new-group-ids)]
    ;; remove membership from any groups as needed
    (when (seq to-remove)
      (log/debugf "Removing user %s from group(s) %s" user-id to-remove)
      (db/delete! PermissionsGroupMembership :group_id [:in to-remove], :user_id user-id))
    ;; add new memberships for any groups as needed
    (doseq [id    to-add
            :when (not (special-group-ids id))]
      (log/debugf "Adding user %s to group %s" user-id id)
      ;; if adding membership fails for one reason or another (i.e. if the group doesn't exist) log the error add the
      ;; user to the other groups rather than failing entirely
      (try
        (db/insert! PermissionsGroupMembership :group_id id, :user_id user-id)
        (catch Throwable e
          (log/error e (trs "Error adding User {0} to Group {1}" user-id id)))))))
