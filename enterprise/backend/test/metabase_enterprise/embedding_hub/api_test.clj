(ns metabase-enterprise.embedding-hub.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest has-user-created-tenants-test
  (testing "create-tenants returns true when there is an active tenant"
    (mt/with-premium-features #{:embedding}
      (mt/with-temp [:model/Tenant _ {:name "Test Tenant" :slug "test-tenant"}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (true? (get-in response [:checklist :create-tenants])))))))
  (testing "create-tenants returns false when tenant is inactive"
    (mt/with-premium-features #{:embedding}
      (mt/with-temp [:model/Tenant _ {:name "Inactive Tenant"
                                      :slug "inactive-tenant"
                                      :is_active false}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (false? (get-in response [:checklist :create-tenants])))))))
  (testing "create-tenants returns false when no tenants exist"
    (mt/with-premium-features #{:embedding}
      (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
        (is (false? (get-in response [:checklist :create-tenants])))))))

(deftest has-configured-data-segregation-strategy-test
  (testing "setup-data-segregation-strategy returns true when row-level security is configured"
    (mt/with-premium-features #{:embedding :sandboxes}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/Sandbox _ {:group_id group-id
                                       :table_id (mt/id :venues)}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (true? (get-in response [:checklist :setup-data-segregation-strategy])))))))
  (testing "setup-data-segregation-strategy returns true when connection impersonation is configured"
    (mt/with-premium-features #{:embedding}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/ConnectionImpersonation _ {:db_id (mt/id)
                                                       :group_id group-id
                                                       :attribute "test-attr"}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (true? (get-in response [:checklist :setup-data-segregation-strategy])))))))
  (testing "setup-data-segregation-strategy returns true when database routing is configured"
    (mt/with-premium-features #{:embedding :database-routing}
      (mt/with-temp [:model/DatabaseRouter _ {:database_id (mt/id)
                                              :user_attribute "test-attr"}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (true? (get-in response [:checklist :setup-data-segregation-strategy])))))))
  (testing "setup-data-segregation-strategy returns false when none are configured"
    (mt/with-premium-features #{:embedding}
      (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
        (is (false? (get-in response [:checklist :setup-data-segregation-strategy])))))))

(deftest enable-tenants-requires-shared-collection-test
  (testing "enable-tenants returns true when use-tenants is true AND shared tenant collections exist"
    (mt/with-premium-features #{:embedding :tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Collection _ {:name "Shared collection"
                                            :namespace "shared-tenant-collection"}]
          (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
            (is (true? (get-in response [:checklist :enable-tenants]))))))))
  (testing "enable-tenants returns false when use-tenants is true but no shared tenant collections exist"
    (mt/with-premium-features #{:embedding :tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (false? (get-in response [:checklist :enable-tenants]))))))))

(deftest data-permissions-and-enable-tenants-test
  (testing "data-permissions-and-enable-tenants returns true when all three conditions are met"
    (mt/with-premium-features #{:embedding :sandboxes :tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Collection _ {:name "Shared collection"
                                            :namespace "shared-tenant-collection"}
                       :model/Tenant _ {:name "Test Tenant" :slug "test-tenant"}
                       :model/PermissionsGroup {group-id :id} {}
                       :model/Sandbox _ {:group_id group-id
                                         :table_id (mt/id :venues)}]
          (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
            (is (true? (get-in response [:checklist :data-permissions-and-enable-tenants]))))))))
  (testing "returns false when data segregation is not configured even if tenants are created"
    (mt/with-premium-features #{:embedding :tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Collection _ {:name "Shared collection"
                                            :namespace "shared-tenant-collection"}
                       :model/Tenant _ {:name "Test Tenant" :slug "test-tenant"}]
          (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
            (is (false? (get-in response [:checklist :data-permissions-and-enable-tenants]))))))))
  (testing "returns false when tenants are not created even if tenants and data segregation are configured"
    (mt/with-premium-features #{:embedding :sandboxes :tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Collection _ {:name "Shared collection"
                                            :namespace "shared-tenant-collection"}
                       :model/PermissionsGroup {group-id :id} {}
                       :model/Sandbox _ {:group_id group-id
                                         :table_id (mt/id :venues)}]
          (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
            (is (false? (get-in response [:checklist :data-permissions-and-enable-tenants])))))))))

(deftest move-dashboard-to-shared-checklist-test
  (mt/id) ;; force the app-db's own database row to exist so add-data resolves deterministically
  (mt/with-premium-features #{:embedding :tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (let [ck (fn [k] (get-in (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist") [:checklist k]))]
        (is (false? (ck :move-dashboard-to-shared)))
        (mt/with-temp [:model/Collection {sc :id} {:namespace "shared-tenant-collection"}]
          (is (false? (ck :move-dashboard-to-shared)))
          (mt/with-temp [:model/Dashboard _ {:collection_id sc :archived false}]
            (is (true? (ck :move-dashboard-to-shared)))))))))

(deftest setting-and-sso-checklist-test
  (mt/id) ;; force the app-db's own database row to exist so add-data resolves deterministically
  (mt/with-premium-features #{:embedding}
    (let [ck (fn [k] (get-in (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist") [:checklist k]))]
      (testing "create-test-embed reflects a published guest embed"
        (mt/with-temp [:model/Card _ {:enable_embedding true}]
          (is (true? (ck :create-test-embed)))))
      (testing "create-test-embed reflects the test-embed-snippet-created setting"
        (mt/with-temporary-setting-values [embedding-hub-test-embed-snippet-created true]
          (is (true? (ck :create-test-embed)))))
      (testing "embed-production reflects the production-embed-snippet-created setting"
        (mt/with-temporary-setting-values [embedding-hub-production-embed-snippet-created true]
          (is (true? (ck :embed-production)))))))
  (mt/with-premium-features #{:embedding :sso-jwt}
    (mt/with-temporary-setting-values [jwt-shared-secret         "0123456789abcdef0123456789abcdef"
                                       jwt-identity-provider-uri "https://idp.example.com"
                                       jwt-enabled                true]
      (is (true? (get-in (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")
                         [:checklist :sso-configured])))))
  (mt/with-premium-features #{:embedding}
    (mt/with-temporary-setting-values [embedding-hub-sso-auth-manual-tested true]
      (is (true? (get-in (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")
                         [:checklist :sso-auth-manual-tested]))))))

(deftest data-isolation-strategy-test
  (testing "data-isolation-strategy is nil when no strategy is configured"
    (mt/with-premium-features #{:embedding}
      (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
        (is (nil? (:data-isolation-strategy response))))))
  (testing "data-isolation-strategy is row-column-level-security when sandboxes are configured"
    (mt/with-premium-features #{:embedding :sandboxes}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/Sandbox _ {:group_id group-id
                                       :table_id (mt/id :venues)}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (= "row-column-level-security" (:data-isolation-strategy response)))))))
  (testing "data-isolation-strategy is connection-impersonation when connection impersonation is configured"
    (mt/with-premium-features #{:embedding}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/ConnectionImpersonation _ {:db_id (mt/id)
                                                       :group_id group-id
                                                       :attribute "test-attr"}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (= "connection-impersonation" (:data-isolation-strategy response)))))))
  (testing "data-isolation-strategy is database-routing when database routing is configured"
    (mt/with-premium-features #{:embedding :database-routing}
      (mt/with-temp [:model/DatabaseRouter _ {:database_id (mt/id)
                                              :user_attribute "test-attr"}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (is (= "database-routing" (:data-isolation-strategy response))))))))
