(ns metabase-enterprise.tenants.permissions-api-test
  "Tests for `/api/permissions` endpoints with EE features."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest create-group-test
  (testing "POST /permissions/group"
    (testing "creates tenant group when is_tenant_group is true (enterprise only)"
      (mt/with-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-model-cleanup [:model/PermissionsGroup]
            (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Tenants Group" :is_tenant_group true})
            (let [group (t2/select-one :model/PermissionsGroup :name "Tenants Group")]
              (is (some? group))
              (is (true? (:is_tenant_group group))))))))
    (testing "validates is_tenant_group parameter type"
      (testing "rejects invalid type"
        (is (= {:errors {:is_tenant_group "nullable boolean"}
                :specific-errors {:is_tenant_group '("should be a boolean, received: \"invalid\"")}}
               (mt/user-http-request :crowberto :post 400 "permissions/group" {:name "Invalid Group" :is_tenant_group "invalid"})))))))

(deftest create-group-test-enterprise-features
  (testing "POST /permissions/group enterprise feature enforcement"
    (testing "allows creating tenant groups with tenants feature enabled"
      (mt/with-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-model-cleanup [:model/PermissionsGroup]
            (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Tenant Group EE" :is_tenant_group true})
            (let [group (t2/select-one :model/PermissionsGroup :name "Tenant Group EE")]
              (is (some? group))
              (is (true? (:is_tenant_group group))))))))
    (testing "rejects tenant group creation when use-tenants setting is off, even with the premium feature"
      (mt/with-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants false]
          (let [response (mt/user-http-request :crowberto :post 400 "permissions/group"
                                               {:name "Tenant Group Disabled" :is_tenant_group true})]
            (is (re-find #"Tenant groups cannot be created" (pr-str response)))))))))

(deftest create-tenant-group-requires-use-tenants-test
  (testing "POST /api/permissions/group with is_tenant_group=true requires use-tenants on"
    (mt/with-premium-features #{:tenants}
      (mt/with-model-cleanup [:model/PermissionsGroup]
        (mt/with-temporary-setting-values [use-tenants false]
          (let [response (mt/user-http-request :crowberto :post 400 "permissions/group"
                                               {:name "Should Fail" :is_tenant_group true})]
            (is (re-find #"Tenant groups cannot be created" (pr-str response)))))
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/user-http-request :crowberto :post 200 "permissions/group"
                                {:name "Acme Tenant" :is_tenant_group true})
          (is (t2/exists? :model/PermissionsGroup :name "Acme Tenant" :is_tenant_group true)))))))

(deftest membership-list-hides-tenant-groups-test
  (testing "GET /api/permissions/membership filters memberships of tenant groups when use-tenants is off"
    (mt/with-premium-features #{:tenants}
      (mt/with-temp [:model/Tenant                    {tenant-id :id}        {:name "Test Tenant"}
                     :model/User                      {tenant-user-id :id}   {:tenant_id tenant-id}
                     :model/PermissionsGroup          {tenant-group-id :id}  {:name "Acme Tenant" :is_tenant_group true}
                     :model/PermissionsGroupMembership _                     {:group_id tenant-group-id :user_id tenant-user-id}]
        (mt/with-temporary-setting-values [use-tenants true]
          (testing "membership visible when on"
            (let [result (mt/user-http-request :crowberto :get 200 "permissions/membership")]
              (is (some #(= tenant-group-id (:group_id %)) (get result tenant-user-id))))))
        (mt/with-temporary-setting-values [use-tenants false]
          (testing "membership hidden when off"
            (let [result (mt/user-http-request :crowberto :get 200 "permissions/membership")
                  all-rows (mapcat val result)]
              (is (not-any? #(= tenant-group-id (:group_id %)) all-rows)))))))))

(deftest membership-writes-reject-tenant-groups-test
  (testing "Membership write endpoints reject tenant groups when use-tenants is off"
    (mt/with-premium-features #{:tenants}
      (mt/with-temp [:model/Tenant                    {tenant-id :id}       {:name "Test Tenant"}
                     :model/User                      {tenant-user-id :id}  {:tenant_id tenant-id}
                     :model/PermissionsGroup          {tenant-group-id :id} {:name "Acme Tenant" :is_tenant_group true}
                     :model/PermissionsGroupMembership {membership-id :id}  {:group_id tenant-group-id
                                                                             :user_id  tenant-user-id}]
        (mt/with-temporary-setting-values [use-tenants false]
          (testing "POST /membership rejects tenant group"
            (let [response (mt/user-http-request :crowberto :post 400 "permissions/membership"
                                                 {:group_id tenant-group-id :user_id tenant-user-id})]
              (is (= [tenant-group-id] (get-in response [:errors :tenant-group-ids])))))
          (testing "PUT /membership/:group-id/clear rejects tenant group"
            (let [response (mt/user-http-request :crowberto :put 400
                                                 (format "permissions/membership/%d/clear" tenant-group-id))]
              (is (= [tenant-group-id] (get-in response [:errors :tenant-group-ids])))))
          (testing "DELETE /membership/:id rejects tenant-group membership"
            (let [response (mt/user-http-request :crowberto :delete 400
                                                 (format "permissions/membership/%d" membership-id))]
              (is (= [tenant-group-id] (get-in response [:errors :tenant-group-ids]))))))))))
