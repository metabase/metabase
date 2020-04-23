(ns metabase.models.permissions-group-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as perm-group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [user :refer [User]]]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import metabase.models.permissions_group.PermissionsGroupInstance))

;;; -------------------------------- Check that the root entry for Admin was created ---------------------------------

(expect (db/exists? Permissions :group_id (:id (perm-group/admin)), :object "/"))


;;; ---------------- check that we can get the magic permissions groups through the helper functions -----------------

(expect PermissionsGroupInstance (perm-group/all-users))
(expect PermissionsGroupInstance (perm-group/admin))
(expect PermissionsGroupInstance (perm-group/metabot))

(expect "All Users"      (:name (perm-group/all-users)))
(expect "Administrators" (:name (perm-group/admin)))
(expect "MetaBot"        (:name (perm-group/metabot)))


;;; make sure we're not allowed to delete the magic groups
(expect Exception (db/delete! PermissionsGroup :id (:id (perm-group/all-users))))
(expect Exception (db/delete! PermissionsGroup :id (:id (perm-group/admin))))
(expect Exception (db/delete! PermissionsGroup :id (:id (perm-group/metabot))))


;;; make sure we're not allowed to edit the magic groups
(expect Exception (db/update! PermissionsGroup (:id (perm-group/all-users)) :name "Cool People"))
(expect Exception (db/update! PermissionsGroup (:id (perm-group/admin))     :name "Cool People"))
(expect Exception (db/update! PermissionsGroup (:id (perm-group/metabot))   :name "Cool People"))


;;; ---------------------- newly created users should get added to the appropriate magic groups ----------------------

(expect
  (tt/with-temp User [{user-id :id}]
    (db/exists? PermissionsGroupMembership
      :user_id  user-id
      :group_id (:id (perm-group/all-users)))))

(expect
  false
  (tt/with-temp User [{user-id :id}]
    (db/exists? PermissionsGroupMembership
      :user_id  user-id
      :group_id (:id (perm-group/admin)))))

(expect
  false
  (tt/with-temp User [{user-id :id}]
    (db/exists? PermissionsGroupMembership
      :user_id  user-id
      :group_id (:id (perm-group/metabot)))))

(expect
  (do
    ;; make sure Crowberto is in the DB because otherwise the code will get snippy when the temp user is deleted since
    ;; you're not allowed to delete the last member of Admin
    (test-users/user->id :crowberto)
    (tt/with-temp User [{user-id :id} {:is_superuser true}]
      (db/exists? PermissionsGroupMembership
        :user_id  user-id
        :group_id (:id (perm-group/all-users))))))

(expect
  (tt/with-temp User [{user-id :id} {:is_superuser true}]
    (db/exists? PermissionsGroupMembership
      :user_id  user-id
      :group_id (:id (perm-group/admin)))))


;;; ------------------------ magic groups should have permissions for newly created databases ------------------------

(defn- group-has-full-access?
  "Does a group have permissions for OBJECT and *all* of its children?"
  ^Boolean [^Integer group-id, ^String object]
  {:pre [(perms/valid-object-path? object)]}
  ;; e.g. WHERE (object || '%') LIKE '/db/1000/'
  (db/exists? Permissions
    :group_id group-id
    object    [:like (hx/concat :object (hx/literal "%"))]))

(expect
  (tt/with-temp Database [{database-id :id}]
    (group-has-full-access? (:id (perm-group/all-users)) (perms/object-path database-id))))

(expect
  (tt/with-temp Database [{database-id :id}]
    (group-has-full-access? (:id (perm-group/admin)) (perms/object-path database-id))))

;; (Except for the MetaBot, which doesn't get data permissions)
(expect
  false
  (tt/with-temp Database [{database-id :id}]
    (group-has-full-access? (:id (perm-group/metabot)) (perms/object-path database-id))))

;; Attempting to create a data permissions entry for the MetaBot should throw an Exception
(expect
  Exception
  (tt/with-temp Database [{database-id :id}]
    (db/insert! Permissions :group_id (u/get-id (perm-group/metabot)), :object (perms/object-path database-id))))


;;; -------------- flipping the is_superuser bit should add/remove user from Admin group as appropriate --------------

;; adding user to Admin should set is_superuser -> true
(expect
  (tt/with-temp User [{user-id :id}]
    (db/insert! PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin)))
    (db/select-one-field :is_superuser User, :id user-id)))

;; removing user from Admin should set is_superuser -> false
(expect
  false
  (do
    (test-users/user->id :crowberto)
    (tt/with-temp User [{user-id :id} {:is_superuser true}]
      (db/delete! PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin)))
      (db/select-one-field :is_superuser User, :id user-id))))

;; setting is_superuser -> true should add user to Admin
(expect
  false
  (do
    (test-users/user->id :crowberto)
    (tt/with-temp User [{user-id :id} {:is_superuser true}]
      (db/update! User user-id, :is_superuser false)
      (db/exists? PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin))))))

;; setting is_superuser -> false should remove user from Admin
(expect
  (do
    (test-users/user->id :crowberto)
    (tt/with-temp User [{user-id :id}]
      (db/update! User user-id, :is_superuser true)
      (db/exists? PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin))))))
