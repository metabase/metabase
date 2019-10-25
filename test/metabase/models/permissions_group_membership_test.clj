(ns metabase.models.permissions-group-membership-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.models
             [permissions-group :as group]
             [permissions-group-membership :as pgm :refer [PermissionsGroupMembership]]
             [user :refer [User]]]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :test-users))

;; when you create a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag
(expect
  true
  (tt/with-temp User [user]
    (db/insert! PermissionsGroupMembership {:user_id (u/get-id user), :group_id (u/get-id (group/admin))})
    (db/select-one-field :is_superuser User :id (u/get-id user))))

;; when you delete a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag
(expect
  false
  (tt/with-temp User [user {:is_superuser true}]
    (db/delete! PermissionsGroupMembership :user_id (u/get-id user), :group_id (u/get-id (group/admin)))
    (db/select-one-field :is_superuser User :id (u/get-id user))))
