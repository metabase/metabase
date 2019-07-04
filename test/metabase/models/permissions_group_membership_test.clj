(ns metabase.models.permissions-group-membership-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [permissions-group :as group]
             [permissions-group-membership :as pgm :refer [PermissionsGroupMembership]]
             [user :refer [User]]]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; when you create a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag
(expect
  true
  (do
    ;; make sure the test users are Created, otherwise `with-temp` will fail when it tries to delete the temporary
    ;; user, because deleting the last admin user is disallowed
    (test-users/create-users-if-needed!)
    (tt/with-temp User [user]
      (db/insert! PermissionsGroupMembership {:user_id (u/get-id user), :group_id (u/get-id (group/admin))})
      (db/select-one-field :is_superuser User :id (u/get-id user)))))

;; when you delete a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag
(expect
  false
  (do
    (test-users/create-users-if-needed!)
    (tt/with-temp User [user {:is_superuser true}]
      (db/delete! PermissionsGroupMembership :user_id (u/get-id user), :group_id (u/get-id (group/admin)))
      (db/select-one-field :is_superuser User :id (u/get-id user)))))
