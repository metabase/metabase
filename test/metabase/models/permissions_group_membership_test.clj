(ns metabase.models.permissions-group-membership-test
  (:require [clojure.test :refer :all]
            [metabase.models.permissions-group :as group]
            [metabase.models.permissions-group-membership :as pgm :refer [PermissionsGroupMembership]]
            [metabase.models.user :refer [User]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest set-is-superuser-test
  (testing "when you create a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-temp User [user]
      (db/insert! PermissionsGroupMembership {:user_id (u/the-id user), :group_id (u/the-id (group/admin))})
      (is (= true
             (db/select-one-field :is_superuser User :id (u/the-id user)))))))

(deftest remove-is-superuser-test
  (testing "when you delete a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-temp User [user {:is_superuser true}]
      (db/delete! PermissionsGroupMembership :user_id (u/the-id user), :group_id (u/the-id (group/admin)))
      (is (= false
             (db/select-one-field :is_superuser User :id (u/the-id user)))))))
