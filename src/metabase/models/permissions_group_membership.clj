(ns metabase.models.permissions-group-membership
  (:require [metabase.models.permissions-group :as group]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel PermissionsGroupMembership :permissions_group_membership)

(defn- check-not-metabot-group
  "Throw an Exception if we're trying to add or remove a user to the MetaBot group."
  [group-id]
  (when (= group-id (:id (group/metabot)))
    (throw (ex-info (tru "You cannot add or remove users to/from the 'MetaBot' group.")
                    {:status-code 400}))))

(def ^:dynamic ^Boolean *allow-changing-all-users-group-members*
  "Should we allow people to be added to or removed from the All Users permissions group?
   By default, this is `false`, but enable it when adding or deleting users."
  false)

(defn- check-not-all-users-group
  "Throw an Exception if we're trying to add or remove a user to the All Users group."
  [group-id]
  (when (= group-id (:id (group/all-users)))
    (when-not *allow-changing-all-users-group-members*
      (throw (ex-info (tru "You cannot add or remove users to/from the 'All Users' group.")
               {:status-code 400})))))

(defn- check-not-last-admin []
  (when (<= (db/count PermissionsGroupMembership
              :group_id (:id (group/admin)))
            1)
    (throw (ex-info (tru "You cannot remove the last member of the 'Admin' group!")
             {:status-code 400}))))

(defn- pre-delete [{:keys [group_id user_id]}]
  (check-not-metabot-group group_id)
  (check-not-all-users-group group_id)
  ;; Otherwise if this is the Admin group...
  (when (= group_id (:id (group/admin)))
    ;; ...and this is the last membership throw an exception
    (check-not-last-admin)
    ;; ...otherwise we're ok. Unset the `:is_superuser` flag for the user whose membership was revoked
    (db/update! 'User user_id
      :is_superuser false)))

(defn- pre-insert [{:keys [group_id], :as membership}]
  (u/prog1 membership
    (check-not-metabot-group group_id)
    (check-not-all-users-group group_id)))

(defn- post-insert [{:keys [group_id user_id], :as membership}]
  (u/prog1 membership
    ;; If we're adding a user to the admin group, set athe `:is_superuser` flag for the user to whom membership was granted
    (when (= group_id (:id (group/admin)))
      (db/update! 'User user_id
        :is_superuser true))))

(u/strict-extend (class PermissionsGroupMembership)
  models/IModel
  (merge models/IModelDefaults
         {:pre-delete  pre-delete
          :pre-insert  pre-insert
          :post-insert post-insert}))
