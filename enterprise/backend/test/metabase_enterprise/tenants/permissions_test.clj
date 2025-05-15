(ns metabase-enterprise.tenants.permissions-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest tenant-users-are-added-to-correct-groups
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "name" :slug "name"}
                 :model/User {user-id :id} {:tenant_id tenant-id}]
    (testing "Should NOT be added to the 'All Users' group"
      (is (not (t2/exists? :model/PermissionsGroupMembership
                           :user_id user-id
                           :group_id (u/the-id (perms-group/all-users))))))
    (testing "Should be added to the 'All External Users' group"
      (is (t2/exists? :model/PermissionsGroupMembership
                      :user_id user-id
                      :group_id (u/the-id (perms-group/all-external-users)))))))

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
