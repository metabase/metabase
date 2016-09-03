(ns metabase.models.permissions-group-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [database :refer [Database]]
                             [permissions :as perms]
                             [permissions-group :refer [PermissionsGroup], :as perm-group]
                             [permissions-group-membership :refer [PermissionsGroupMembership]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu])
  (:import metabase.models.permissions_group.PermissionsGroupInstance))

;;; ---------------------------------------- check that we can get the magic permissions groups through the helper functions ----------------------------------------
(expect PermissionsGroupInstance (perm-group/default))
(expect PermissionsGroupInstance (perm-group/admin))

(expect "Default" (:name (perm-group/default)))
(expect "Admin"   (:name (perm-group/admin)))


;;; make sure we're not allowed to delete the magic groups
(expect Exception (db/cascade-delete! PermissionsGroup :id (:id (perm-group/default))))
(expect Exception (db/cascade-delete! PermissionsGroup :id (:id (perm-group/admin))))


;;; make sure we're not allowed to edit the magic groups
(expect Exception (db/update! PermissionsGroup (:id (perm-group/default)) :name "Cool People"))
(expect Exception (db/update! PermissionsGroup (:id (perm-group/admin))   :name "Cool People"))


;;; ---------------------------------------- newly created users should get added to the appropriate magic groups ----------------------------------------
(expect
  (tu/with-temp User [{user-id :id}]
    (db/exists? PermissionsGroupMembership
      :user_id  user-id
      :group_id (:id (perm-group/default)))))

(expect
  false
  (tu/with-temp User [{user-id :id}]
    (db/exists? PermissionsGroupMembership
      :user_id  user-id
      :group_id (:id (perm-group/admin)))))

(expect
  (do
    ;; make sure Crowberto is in the DB because otherwise the code will get snippy when the temp user is deleted since you're not allowed to delete the last member of Admin
    (test-users/user->id :crowberto)
    (tu/with-temp User [{user-id :id} {:is_superuser true}]
      (db/exists? PermissionsGroupMembership
        :user_id  user-id
        :group_id (:id (perm-group/default))))))

(expect
  (tu/with-temp User [{user-id :id} {:is_superuser true}]
    (db/exists? PermissionsGroupMembership
      :user_id  user-id
      :group_id (:id (perm-group/admin)))))


;;; ---------------------------------------- magic groups should have permissions for newly created databases ----------------------------------------
(expect
  (tu/with-temp Database [{database-id :id}]
    (perms/group-has-full-access? (:id (perm-group/default)) (str "/db/" database-id "/"))))

(expect
  (tu/with-temp Database [{database-id :id}]
    (perms/group-has-full-access? (:id (perm-group/admin)) (str "/db/" database-id "/"))))



;;; ---------------------------------------- flipping the is_superuser bit should add/remove user from Admin group as appropriate ----------------------------------------
;; adding user to Admin should set is_superuser -> true
(expect
  (tu/with-temp User [{user-id :id}]
    (db/insert! PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin)))
    (db/select-one-field :is_superuser User, :id user-id)))

;; removing user from Admin should set is_superuser -> false
(expect
  false
  (do
    (test-users/user->id :crowberto)
    (tu/with-temp User [{user-id :id} {:is_superuser true}]
      (db/cascade-delete! PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin)))
      (db/select-one-field :is_superuser User, :id user-id))))

;; setting is_superuser -> true should add user to Admin
(expect
  false
  (do
    (test-users/user->id :crowberto)
    (tu/with-temp User [{user-id :id} {:is_superuser true}]
      (db/update! User user-id, :is_superuser false)
      (db/exists? PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin))))))

;; setting is_superuser -> false should remove user from Admin
(expect
  (do
    (test-users/user->id :crowberto)
    (tu/with-temp User [{user-id :id}]
      (db/update! User user-id, :is_superuser true)
      (db/exists? PermissionsGroupMembership, :user_id user-id, :group_id (:id (perm-group/admin))))))
