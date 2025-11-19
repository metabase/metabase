(ns metabase.permissions.models.permissions-group-membership-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as pgm]
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
  ;; This will need to get moved to EE
  (mt/with-temp [:model/Tenant {tenant-id :id} {:slug "tenant" :name "tenant"}
                 :model/User {tenant-user :id} {:tenant_id tenant-id}
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

(deftest permissions-group-membership-audit-add-test
  (testing "PermissionsGroupMembership audit events"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (let [initial-audit-count (t2/count :model/AuditLog)]
          (testing "adding user to group is audited"
            (perms/add-user-to-group! user-id group-id)
            (is (> (t2/count :model/AuditLog) initial-audit-count))
            (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-create" {:order-by [[:id :desc]]})]
              (is (some? audit-entry))
              (is (= "PermissionsGroupMembership" (:model audit-entry)))
              (is (= user-id (get-in audit-entry [:details :user_id])))
              (is (= group-id (get-in audit-entry [:details :group_id])))))

          (testing "removing user from group is audited"
            (let [before-remove-count (t2/count :model/AuditLog)]
              (perms/remove-user-from-group! user-id group-id)
              (is (> (t2/count :model/AuditLog) before-remove-count))
              (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-delete" {:order-by [[:id :desc]]})]
                (is (some? audit-entry))
                (is (= "PermissionsGroupMembership" (:model audit-entry)))
                (is (= user-id (get-in audit-entry [:details :user_id])))
                (is (= group-id (get-in audit-entry [:details :group_id])))))))))))
(deftest tenant-users-cannot-be-group-managers-test
  (testing "External/tenant users cannot be made group managers"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/User {external-user-id :id} {:tenant_id tenant-id}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}
                       :model/PermissionsGroup {normal-group-id :id} {:name "Normal Group"
                                                                      :is_tenant_group false}]

          (testing "cannot make external user group manager of tenant group"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"External users cannot be made group managers"
                 (pgm/add-users-to-groups! [{:user external-user-id
                                             :group tenant-group-id
                                             :is-group-manager? true}]))))

          (testing "cannot make external user group manager of normal group"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"External users cannot be made group managers"
                 (pgm/add-users-to-groups! [{:user external-user-id
                                             :group normal-group-id
                                             :is-group-manager? true}]))))

          (testing "external user can be regular member of tenant group"
            (is (nil? (pgm/add-users-to-groups! [{:user external-user-id
                                                  :group tenant-group-id
                                                  :is-group-manager? false}]))))

          (testing "external user cannot be member of normal group at all"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Cannot add non-tenant user to tenant-group or vice versa"
                 (pgm/add-users-to-groups! [{:user external-user-id
                                             :group normal-group-id
                                             :is-group-manager? false}])))))))))
