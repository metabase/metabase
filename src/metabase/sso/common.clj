(ns metabase.sso.common
  "Shared functionality used by different integrations."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- excluded-group-ids
  []
  #{(u/the-id (perms/all-users-group))
    (u/the-id (perms/all-external-users-group))})

(defn- sync-group-memberships*!
  [user-or-id to-remove to-add]
  (when (seq to-remove)
    (log/debugf "Removing user %s from group(s) %s" (u/the-id user-or-id) to-remove)
    (try
      (perms/remove-user-from-groups! user-or-id to-remove)
      (catch clojure.lang.ExceptionInfo e
        ;; in case sync attempts to delete the last admin, the pre-delete hooks of
        ;; [[metabase.permissions.models.permissions-group-membership/PermissionsGroupMembership]] will throw an exception.
        ;; but we don't want to block user from logging-in, so catch this exception and log a warning
        (if (= (ex-message e) (str perms/fail-to-remove-last-admin-msg))
          (log/warn "Attempted to remove the last admin during group sync!"
                    "Check your SSO group mappings and make sure the Administrators group is mapped correctly.")
          ;; Raise an error rather than swallowing it since it's worse to leave a user with more permissions than we expect them have
          (throw e)))))
  ;; When adding a user to a group we want to allow individual adds to fail with exceptions
  ;; that we will log
  (doseq [group-or-id to-add]
    (log/debugf "Adding user %s to group %s" (u/the-id user-or-id) (u/the-id group-or-id))
    (try
      (perms/add-user-to-group! user-or-id group-or-id)
      (catch Throwable e
        (log/errorf e "Error adding user %s to group %s" (u/the-id user-or-id) (u/the-id group-or-id))))))

(defn sync-group-memberships!
  "Update the PermissionsGroups a User belongs to, adding or deleting membership entries as needed so that Users is
  only in `new-groups-or-ids`. Ignores special groups like `all-users`, and only optionally only touches groups with mappings set."
  ([user-or-id new-groups-or-ids]
   (let [current-group-ids  (t2/select-fn-set :group_id :model/PermissionsGroupMembership
                                              {:where
                                               [:and
                                                [:= :user_id  (u/the-id user-or-id)]
                                                [:not-in :group_id (excluded-group-ids)]]})
         [to-remove to-add] (data/diff current-group-ids (set/difference (set (map u/the-id new-groups-or-ids))
                                                                         (excluded-group-ids)))]

     (sync-group-memberships*! user-or-id to-remove to-add)))
  ([user-or-id new-groups-or-ids mapped-groups-or-ids]
   (let [mapped-group-ids   (set (map u/the-id mapped-groups-or-ids))
         current-group-ids  (when (seq mapped-group-ids)
                              (t2/select-fn-set :group_id :model/PermissionsGroupMembership
                                                {:where
                                                 [:and
                                                  [:= :user_id (u/the-id user-or-id)]
                                                  [:in :group_id mapped-group-ids]
                                                  [:not-in :group_id (excluded-group-ids)]]}))
         new-group-ids      (-> (set (map u/the-id new-groups-or-ids))
                                (set/intersection mapped-group-ids)
                                (set/difference (excluded-group-ids)))
         [to-remove to-add] (data/diff current-group-ids new-group-ids)]
     (sync-group-memberships*! user-or-id to-remove to-add))))
