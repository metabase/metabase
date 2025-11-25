(ns metabase-enterprise.tenants.user-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.users.models.user-test :as user-test]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- group-or-ids->user-group-memberships
  [group-or-ids]
  (map (fn [group-or-id] {:id (u/the-id group-or-id)}) group-or-ids))

(deftest create-tenant-user-auto-assigned-to-external-users-group-test
  (testing "POST /api/user"
    (testing "Creating a tenant user automatically assigns them to All External Users group even when no groups are specified"
      (mt/with-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test-tenant"}]
            (let [user-name (mt/random-name)
                  email     (mt/random-email)]
              (mt/with-model-cleanup [:model/User]
                (mt/with-fake-inbox
                  (let [resp (mt/user-http-request :crowberto :post 200 "user"
                                                   {:first_name             user-name
                                                    :last_name              user-name
                                                    :email                  email
                                                    :tenant_id              tenant-id})]
                    (testing "response includes user_group_memberships"
                      (is (= #{{:id (:id (perms/all-external-users-group))}}
                             (set (:user_group_memberships resp)))))

                    (testing "user is actually assigned to all expected groups in database"
                      (let [created-user (t2/select-one :model/User :email email)]
                        (is (= #{"All External Users"}
                               (user-test/user-group-names created-user)))))

                    (testing "tenant_id is set correctly"
                      (let [created-user (t2/select-one :model/User :email email)]
                        (is (= tenant-id (:tenant_id created-user)))))))))))))))

(deftest create-tenant-user-must-assign-to-external-users-group-test
  (testing "POST /api/user"
    (testing "Creating a tenant user automatically assigns them to All External Users group even when other groups are specified"
      (mt/with-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/PermissionsGroup group-1 {:name "Custom Group 1" :is_tenant_group true}
                         :model/PermissionsGroup group-2 {:name "Custom Group 2" :is_tenant_group true}
                         :model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test-tenant"}]
            (let [user-name (mt/random-name)
                  email     (mt/random-email)]
              (mt/with-model-cleanup [:model/User]
                (mt/with-fake-inbox
                  (let [resp (mt/user-http-request :crowberto :post 400 "user"
                                                   {:first_name             user-name
                                                    :last_name              user-name
                                                    :email                  email
                                                    :tenant_id              tenant-id
                                                    :user_group_memberships (group-or-ids->user-group-memberships
                                                                             [group-1 group-2])})]
                    (is (= "You cannot add or remove users to/from the 'All External Users' group." resp))))))))))))

(deftest create-user-tenant-group-restrictions-test
  (testing "POST /api/user with tenant groups"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}
                       :model/PermissionsGroup {normal-group-id :id} {:name "Normal Group"
                                                                      :is_tenant_group false}]
          (mt/with-model-cleanup [:model/User]
            (testing "external users cannot be added to non-tenant groups via POST"
              (is (=? {:message "Cannot add non-tenant user to tenant-group or vice versa"}
                      (mt/user-http-request :crowberto :post 400 "user"
                                            {:first_name "External"
                                             :last_name "User"
                                             :email (mt/random-email)
                                             :tenant_id tenant-id
                                             :user_group_memberships [{:id (u/the-id (perms/all-external-users-group))}
                                                                      {:id normal-group-id}]}))))

            (testing "internal users cannot be added to tenant groups via POST"
              (is (=? {:message "Cannot add non-tenant user to tenant-group or vice versa"}
                      (mt/user-http-request :crowberto :post 400 "user"
                                            {:first_name "Internal"
                                             :last_name "User"
                                             :email (mt/random-email)
                                             :user_group_memberships [{:id (u/the-id (perms/all-users-group))}
                                                                      {:id tenant-group-id}]}))))))))))

(deftest update-user-tenant-group-restrictions-test
  (testing "PUT /api/user/:id with tenant groups"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}
                       :model/PermissionsGroup {normal-group-id :id} {:name "Normal Group"
                                                                      :is_tenant_group false}]

          (testing "external users cannot be added to non-tenant groups via PUT"
            (mt/with-temp [:model/User {external-user-id :id} {:tenant_id tenant-id}]
              (is (=? {:message "Cannot add non-tenant user to tenant-group or vice versa"}
                      (mt/user-http-request :crowberto :put 400 (str "user/" external-user-id)
                                            {:user_group_memberships [{:id (u/the-id (perms/all-external-users-group))}
                                                                      {:id normal-group-id}]})))))

          (testing "internal users cannot be added to tenant groups via PUT"
            (mt/with-temp [:model/User {internal-user-id :id} {}]
              (is (=? {:message "Cannot add non-tenant user to tenant-group or vice versa"}
                      (mt/user-http-request :crowberto :put 400 (str "user/" internal-user-id)
                                            {:user_group_memberships [{:id (u/the-id (perms/all-users-group))}
                                                                      {:id tenant-group-id}]}))))))))))

(deftest external-user-group-manager-restrictions-test
  (testing "External users cannot be made group managers"
    (mt/with-premium-features #{:tenants :advanced-permissions}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}]

          (testing "cannot create external user as group manager via POST"
            (mt/with-model-cleanup [:model/User]
              (is (=? {:message "External users cannot be made group managers"}
                      (mt/user-http-request :crowberto :post 400 "user"
                                            {:first_name "External"
                                             :last_name "Manager"
                                             :email (mt/random-email)
                                             :tenant_id tenant-id
                                             :user_group_memberships [{:id (u/the-id (perms/all-external-users-group))}
                                                                      {:id tenant-group-id
                                                                       :is_group_manager true}]})))))

          (testing "cannot make external user group manager via PUT"
            (mt/with-temp [:model/User {external-user-id :id} {:tenant_id tenant-id}]
              ;; This test is expected to fail until group manager restrictions are implemented
              (is (=? {:message "External users cannot be made group managers"}
                      (mt/user-http-request :crowberto :put 400 (str "user/" external-user-id)
                                            {:user_group_memberships [{:id (u/the-id (perms/all-external-users-group))}
                                                                      {:id tenant-group-id
                                                                       :is_group_manager true}]}))))))))))
