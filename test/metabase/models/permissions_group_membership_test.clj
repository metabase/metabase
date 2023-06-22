(ns metabase.models.permissions-group-membership-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.models.user :refer [User]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest set-is-superuser-test
  (testing "when you create a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (t2.with-temp/with-temp [User user]
      (t2/insert! PermissionsGroupMembership {:user_id (u/the-id user), :group_id (u/the-id (perms-group/admin))})
      (is (= true
             (t2/select-one-fn :is_superuser User :id (u/the-id user)))))))

(deftest remove-is-superuser-test
  (testing "when you delete a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (t2.with-temp/with-temp [User user {:is_superuser true}]
      (t2/delete! PermissionsGroupMembership :user_id (u/the-id user), :group_id (u/the-id (perms-group/admin)))
      (is (= false
             (t2/select-one-fn :is_superuser User :id (u/the-id user))))))

  (testing "it should not let you remove the last admin"
    (mt/with-single-admin-user [{id :id}]
      (is (thrown? Exception
                   (t2/delete! PermissionsGroupMembership :user_id id, :group_id (u/the-id (perms-group/admin)))))))

  (testing "it should not let you remove the last non-archived admin"
    (mt/with-single-admin-user [{id :id}]
      (t2.with-temp/with-temp [User _ {:is_active    false
                                       :is_superuser true}]
        (is (thrown? Exception
                     (t2/delete! PermissionsGroupMembership :user_id id, :group_id (u/the-id (perms-group/admin)))))))))
