(ns metabase-enterprise.tenants.permissions-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest tenant-users-are-added-to-correct-groups
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "name" :slug "name"}
                 :model/User {user-id :id} {:tenant_id tenant-id}]
    (testing "Should NOT be added to the 'All Users' group"
      (is (not (t2/exists? :model/PermissionsGroupMembership
                           :user_id user-id
                           :group_id (u/the-id (perms/all-users-group))))))
    (testing "Should be added to the 'All tenant users' group"
      (is (t2/exists? :model/PermissionsGroupMembership
                      :user_id user-id
                      :group_id (u/the-id (perms/all-external-users-group)))))))

(deftest tenant-groups-get-no-perms-on-new-dbs
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:is_tenant_group true}
                 :model/Database {db-id :id} {}]
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/view-data :perm_value :blocked))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/create-queries :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/download-results :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-table-metadata :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-database :perm_value :no))))

(deftest new-tenant-groups-get-no-perms-on-existing-dbs
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/PermissionsGroup {group-id :id} {:is_tenant_group true}]
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/view-data :perm_value :blocked))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/create-queries :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/download-results :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-table-metadata :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-database :perm_value :no))))

(deftest tenant-users-and-groups
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "name" :slug "slug"}
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

(deftest tenant-users-cannot-be-group-managers-of-tenant-group-test
  (testing "External/tenant users cannot be made group managers of tenant groups"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/User {external-user-id :id} {:tenant_id tenant-id}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Tenant users cannot be made group managers"
               (perms/add-users-to-groups! [{:user external-user-id
                                             :group tenant-group-id
                                             :is-group-manager? true}]))))))))

(deftest tenant-users-cannot-be-group-managers-of-normal-group-test
  (testing "External/tenant users cannot be made group managers of normal groups"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/User {external-user-id :id} {:tenant_id tenant-id}
                       :model/PermissionsGroup {normal-group-id :id} {:name "Normal Group"
                                                                      :is_tenant_group false}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Tenant users cannot be made group managers"
               (perms/add-users-to-groups! [{:user external-user-id
                                             :group normal-group-id
                                             :is-group-manager? true}]))))))))

(deftest tenant-users-can-be-regular-members-of-tenant-group-test
  (testing "External user can be regular member of tenant group"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/User {external-user-id :id} {:tenant_id tenant-id}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}]
          (is (nil? (perms/add-users-to-groups! [{:user external-user-id
                                                  :group tenant-group-id
                                                  :is-group-manager? false}]))))))))

(deftest tenant-users-cannot-be-members-of-normal-group-test
  (testing "External user cannot be member of normal group at all"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/User {external-user-id :id} {:tenant_id tenant-id}
                       :model/PermissionsGroup {normal-group-id :id} {:name "Normal Group"
                                                                      :is_tenant_group false}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Cannot add non-tenant user to tenant-group or vice versa"
               (perms/add-users-to-groups! [{:user external-user-id
                                             :group normal-group-id
                                             :is-group-manager? false}]))))))))
