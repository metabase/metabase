(ns metabase.models.permissions-group-membership
  (:require [metabase.models.permissions-group :as perms-group]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel PermissionsGroupMembership :permissions_group_membership)

(def fail-to-remove-last-admin-msg
  "Exception message when try to remove the last admin."
  (deferred-tru "You cannot remove the last member of the ''Admin'' group!"))

(defonce ^:dynamic ^{:doc "Should we allow people to be added to or removed from the All Users permissions group? By
  default, this is `false`, but enable it when adding or deleting users."}
  *allow-changing-all-users-group-members*
  false)

(defn- check-not-all-users-group
  "Throw an Exception if we're trying to add or remove a user to the All Users group."
  [group-id]
  (when (= group-id (:id (perms-group/all-users)))
    (when-not *allow-changing-all-users-group-members*
      (throw (ex-info (tru "You cannot add or remove users to/from the ''All Users'' group.")
               {:status-code 400})))))

(defn- check-not-last-admin []
  (when (<= (db/count PermissionsGroupMembership
              :group_id (:id (perms-group/admin)))
            1)
    (throw (ex-info (str fail-to-remove-last-admin-msg)
                    {:status-code 400}))))

(defn- pre-delete [{:keys [group_id user_id]}]
  (check-not-all-users-group group_id)
  ;; Otherwise if this is the Admin group...
  (when (= group_id (:id (perms-group/admin)))
    ;; ...and this is the last membership throw an exception
    (check-not-last-admin)
    ;; ...otherwise we're ok. Unset the `:is_superuser` flag for the user whose membership was revoked
    (db/update! 'User user_id
      :is_superuser false)))

(defn- pre-insert [{:keys [group_id], :as membership}]
  (u/prog1 membership
    (check-not-all-users-group group_id)))

(defn- post-insert [{:keys [group_id user_id], :as membership}]
  (u/prog1 membership
    ;; If we're adding a user to the admin group, set the `:is_superuser` flag for the user to whom membership was
    ;; granted
    (when (= group_id (:id (perms-group/admin)))
      (db/update! 'User user_id
        :is_superuser true))))

(u/strict-extend (class PermissionsGroupMembership)
  models/IModel
  (merge models/IModelDefaults
         {:pre-delete  pre-delete
          :pre-insert  pre-insert
          :post-insert post-insert}))
