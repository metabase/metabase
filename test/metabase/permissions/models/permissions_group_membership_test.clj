(ns metabase.permissions.models.permissions-group-membership-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest set-is-superuser-test
  (testing "when you create a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-temp [:model/User user]
      (perms/add-user-to-group! user (perms-group/admin))
      (is (true? (t2/select-one-fn :is_superuser :model/User :id (u/the-id user)))))))

(deftest remove-is-superuser-test
  (testing "when you delete a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-temp [:model/User user {:is_superuser true}]
      (t2/delete! :model/PermissionsGroupMembership :user_id (u/the-id user), :group_id (u/the-id (perms-group/admin)))
      (is (= false
             (t2/select-one-fn :is_superuser :model/User :id (u/the-id user))))))

  (testing "it should not let you remove the last admin"
    (mt/with-single-admin-user! [{id :id}]
      (is (thrown? Exception
                   (t2/delete! :model/PermissionsGroupMembership :user_id id, :group_id (u/the-id (perms-group/admin)))))))

  (testing "it should not let you remove the last non-archived admin"
    (mt/with-single-admin-user! [{id :id}]
      (mt/with-temp [:model/User _ {:is_active    false
                                    :is_superuser true}]
        (is (thrown? Exception
                     (t2/delete! :model/PermissionsGroupMembership :user_id id, :group_id (u/the-id (perms-group/admin)))))))))

(deftest tenant-users-and-groups
  ;; This will need to get fixed once we have actual tenants - right now the `tenant_id` doesn't actually connect to
  ;; anything.
  (mt/with-temp [:model/User {tenant-user :id} {:tenant_id 1}
                 :model/User {normal-user :id} {}
                 :model/PermissionsGroup {tenant-group :id} {:is_tenant_group true}
                 :model/PermissionsGroup {normal-group :id} {:is_tenant_group false}]
    (testing "A tenant user"
      (testing "cannot be added to a normal group"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Cannot add non-tenant user to tenant-group or vice versa"
                              (perms/add-user-to-group! tenant-user normal-group))))
      (testing "can be added to tenant groups"
        (perms/add-user-to-group! tenant-user tenant-group)))
    (testing "A normal user"
      (testing "cannot be added to a tenant group"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Cannot add non-tenant user to tenant-group or vice versa"
                              (perms/add-user-to-group! normal-user tenant-group))))
      (testing "can be added to a normal group"
        (perms/add-user-to-group! normal-user normal-group)))))
