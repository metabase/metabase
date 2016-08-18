(ns metabase.models.permissions-group-membership
  (:require [metabase.db :as db]
            (metabase.models [interface :as i]
                             [permissions-group :as group])
            [metabase.util :as u]))

(i/defentity PermissionsGroupMembership :permissions_group_membership)


(defn- pre-cascade-delete [{:keys [group_id user_id]}]
  (when (= group_id (:id (group/admin)))
    ;; if this is the last membership in the Admin group throw an exception
    (when (<= (db/select-one-count PermissionsGroupMembership
                :group_id (:id (group/admin)))
              1)
      (throw (ex-info "You cannot delete the last member of the 'Admin' group!"
               {:status-code 400})))
    ;; unset the :is_superuser flag for the user whose membership was revoked
    (db/update! 'User user_id
      :is_superuser false)))

(defn- post-insert [{:keys [group_id user_id], :as membership}]
  (u/prog1 membership
    ;; If we're adding a user to the admin group, set athe `:is_superuser` flag for the user to whom membership was granted
    (when (= group_id (:id (group/admin)))
      (db/update! 'User user_id
        :is_superuser true))))

(u/strict-extend (class PermissionsGroupMembership)
  i/IEntity
  (merge i/IEntityDefaults
         {:pre-cascade-delete pre-cascade-delete
          :post-insert        post-insert}))
