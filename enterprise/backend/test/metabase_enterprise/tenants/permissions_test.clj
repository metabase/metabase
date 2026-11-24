(ns metabase-enterprise.tenants.permissions-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.tenants.permissions :as tenants.permissions]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.test :as mt]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest tenant-users-are-added-to-correct-groups
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "name" :slug "name"}]
    (mt/with-model-cleanup [:model/User]
      (let [[{user-id :id}] (user/create-users! [{:email (mt/random-email) :tenant_id tenant-id}])]
        (testing "Should NOT be added to the 'All Users' group"
          (is (not (t2/exists? :model/PermissionsGroupMembership
                               :user_id user-id
                               :group_id (u/the-id (perms/all-users-group))))))
        (testing "Should be added to the 'All tenant users' group"
          (is (t2/exists? :model/PermissionsGroupMembership
                          :user_id user-id
                          :group_id (u/the-id (perms/all-external-users-group)))))))))

(deftest tenant-groups-get-no-perms-on-new-dbs
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:is_tenant_group true}
                 :model/Database {db-id :id} {}]
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/view-data :perm_value :blocked))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/create-queries :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/download-results :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-table-metadata :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-database :perm_value :no))))

(deftest new-tenant-groups-get-no-perms-on-existing-dbs
  (mt/with-temp [:model/Database {db-id :id} {}]
    (mt/with-model-cleanup [:model/PermissionsGroup]
      (let [[{group-id :id}] (perms-group/create-permissions-groups! [{:name (mt/random-name) :is_tenant_group true}])]
        (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/view-data :perm_value :blocked))
        (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/create-queries :perm_value :no))
        (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/download-results :perm_value :no))
        (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-table-metadata :perm_value :no))
        (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-database :perm_value :no))))))

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
                              (perms-group-membership/add-users-to-groups! [{:user tenant-user :group normal-group}]))))
      (testing "can be added to tenant groups"
        (perms-group-membership/add-users-to-groups! [{:user tenant-user :group tenant-group}])))
    (testing "A normal user"
      (testing "cannot be added to a tenant group"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Cannot add non-tenant user to tenant-group or vice versa"
                              (perms-group-membership/add-users-to-groups! [{:user normal-user :group tenant-group}]))))
      (testing "can be added to a normal group"
        (perms-group-membership/add-users-to-groups! [{:user normal-user :group normal-group}])))))

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
               (perms-group-membership/add-users-to-groups! [{:user external-user-id
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
               (perms-group-membership/add-users-to-groups! [{:user external-user-id
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
          (perms-group-membership/add-users-to-groups! [{:user external-user-id
                                                         :group tenant-group-id
                                                         :is-group-manager? false}])
          (is (t2/exists? :model/PermissionsGroupMembership :user_id external-user-id :group_id tenant-group-id)))))))

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
               (perms-group-membership/add-users-to-groups! [{:user external-user-id
                                                              :group normal-group-id
                                                              :is-group-manager? false}]))))))))

(deftest tenant-member-cannot-become-group-manager-through-membership-update-test
  (testing "PUT /api/permissions/membership/:id refuses to make a tenant user a group manager"
    (mt/with-premium-features #{:tenants :advanced-permissions}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}]
          (perms-group-membership/add-users-to-groups! [{:user tenant-user-id :group tenant-group-id}])
          (let [membership-id (t2/select-one-pk :model/PermissionsGroupMembership
                                                :user_id tenant-user-id :group_id tenant-group-id)]
            (is (=? "Tenant users cannot be made group managers"
                    (mt/user-http-request :crowberto :put 400 (str "permissions/membership/" membership-id)
                                          {:is_group_manager true})))
            (is (false? (t2/select-one-fn :is_group_manager :model/PermissionsGroupMembership :id membership-id)))))))))

(deftest tenant-membership-rules-hold-for-membership-writes-test
  (mt/with-temp [:model/Tenant           {tenant-id :id}       {:name "Test Tenant" :slug "test"}
                 :model/PermissionsGroup {tenant-group-id :id} {:is_tenant_group true}
                 :model/PermissionsGroup {normal-group-id :id} {}]
    (mt/with-model-cleanup [:model/User]
      (let [[{tenant-user-id :id} {normal-user-id :id}] (user/create-users! [{:email (mt/random-email) :tenant_id tenant-id}
                                                                             {:email (mt/random-email) :tenant_id nil}])]
        (testing "adding a tenant user to a normal group is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add non-tenant user to tenant-group or vice versa"
                                (perms-group-membership/add-users-to-groups! [{:user tenant-user-id :group normal-group-id}]))))
        (testing "adding a normal user to a tenant group is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add non-tenant user to tenant-group or vice versa"
                                (perms-group-membership/add-users-to-groups! [{:user normal-user-id :group tenant-group-id}]))))
        (testing "adding a tenant user as group manager is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tenant users cannot be made group managers"
                                (perms-group-membership/add-users-to-groups! [{:user tenant-user-id :group tenant-group-id :is-group-manager? true}]))))
        (testing "making a tenant user's membership a group manager is refused"
          (perms-group-membership/add-users-to-groups! [{:user tenant-user-id :group tenant-group-id}])
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tenant users cannot be made group managers"
                                (perms-group-membership/update-permissions-group-memberships!
                                 [{:id               (t2/select-one-pk :model/PermissionsGroupMembership
                                                                       :user_id tenant-user-id :group_id tenant-group-id)
                                   :is_group_manager true}]))))
        (testing "removing a tenant user from All tenant users is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"'All tenant users' group"
                                (perms-group-membership/remove-users-from-groups! [tenant-user-id] [(perms/all-external-users-group)]))))
        (is (= #{tenant-group-id (u/the-id (perms/all-external-users-group))}
               (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id tenant-user-id)))
        (is (= #{(u/the-id (perms/all-users-group))}
               (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id normal-user-id)))))))

(deftest moving-out-of-tenant-specific-copies-the-parent-permissions-test
  (testing "a Collection and its descendants get the permissions of their new parent"
    (mt/with-temp [:model/PermissionsGroup {group-id :id}          {}
                   :model/Collection       parent                  {}
                   :model/Collection       {coll-id :id, :as coll} {}
                   :model/Collection       {child-id :id}          {:location (collection/children-location coll)}]
      (perms/grant-collection-read-permissions! group-id parent)
      (#'tenants.permissions/grant-perms-when-moving-out-of-tenant-specific! coll (collection/children-location parent))
      (doseq [id [coll-id child-id]]
        (is (t2/exists? :model/Permissions :group_id group-id :object (perms/collection-read-path id)))))))
