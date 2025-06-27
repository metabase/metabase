(ns metabase-enterprise.tenants.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.tenants.core :as tenants]
   [metabase.test :as mt]))

(deftest login-attribute-keys-disabled-feature-test
  (testing "returns empty set when tenants feature is disabled"
    (mt/with-premium-features #{}
      (is (= #{} (tenants/login-attribute-keys))))))

(deftest login-attribute-keys-disabled-setting-test
  (testing "returns empty set when use-tenants setting is false"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants false]
        (is (= #{} (tenants/login-attribute-keys)))))))

(deftest login-attribute-keys-no-tenants-test
  (testing "returns tenant.slug when tenants are enabled but no tenant models exist"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (is (= #{"@tenant.slug"} (tenants/login-attribute-keys)))))))

(deftest login-attribute-keys-with-tenant-attributes-test
  (testing "includes tenant model attributes when tenants exist"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant _ {:name "Test Tenant"
                            :slug "test-tenant"
                            :attributes {"environment" "production"
                                         "region" "us-east-1"}}
           :model/Tenant _ {:name "Dev Tenant"
                            :slug "dev-tenant"
                            :attributes {"environment" "development"
                                         "cluster" "dev-cluster"}}]
          (is (= #{"@tenant.slug" "environment" "region" "cluster"}
                 (tenants/login-attribute-keys))))))))

(deftest login-attribute-keys-no-attributes-test
  (testing "handles tenants with no attributes"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant _ {:name "Empty Tenant"
                            :slug "empty-tenant"}
           :model/Tenant _ {:name "Attributed Tenant"
                            :slug "attributed-tenant"
                            :attributes {"key" "value"}}]
          (is (= #{"@tenant.slug" "key"}
                 (tenants/login-attribute-keys))))))))

(deftest login-attribute-keys-empty-attributes-test
  (testing "handles tenants with empty attributes map"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant _ {:name "Empty Attrs Tenant"
                            :slug "empty-attrs-tenant"
                            :attributes {}}
           :model/Tenant _ {:name "Normal Tenant"
                            :slug "normal-tenant"
                            :attributes {"test-key" "test-value"}}]
          (is (= #{"@tenant.slug" "test-key"}
                 (tenants/login-attribute-keys))))))))

(deftest login-attributes-disabled-feature-test
  (testing "returns an empty map when tenants feature is disabled"
    (mt/with-premium-features #{}
      (is (empty? (tenants/login-attributes {:tenant_id 1}))))))

(deftest login-attributes-disabled-setting-test
  (testing "returns nil when use-tenants setting is false"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants false]
        (is (empty? (tenants/login-attributes {:tenant_id 1})))))))

(deftest login-attributes-no-tenant-id-test
  (testing "returns nil when user has no tenant_id"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (is (empty? (tenants/login-attributes {:id 1})))
        (is (empty? (tenants/login-attributes {:tenant_id nil})))))))

(deftest login-attributes-with-tenant-test
  (testing "returns tenant attributes merged with @tenant.slug"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Test Tenant"
                                          :slug "test-tenant"
                                          :attributes {"environment" "production"
                                                       "region" "us-east-1"}}]
          (is (= {"environment" "production"
                  "region" "us-east-1"
                  "@tenant.slug" "test-tenant"}
                 (tenants/login-attributes {:tenant_id tenant-id}))))))))

(deftest login-attributes-no-attributes-test
  (testing "returns only @tenant.slug when tenant has no attributes"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Empty Tenant"
                                          :slug "empty-tenant"}]
          (is (= {"@tenant.slug" "empty-tenant"}
                 (tenants/login-attributes {:tenant_id tenant-id}))))))))

(deftest login-attributes-empty-attributes-test
  (testing "returns only @tenant.slug when tenant has empty attributes map"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Empty Attrs Tenant"
                                          :slug "empty-attrs-tenant"
                                          :attributes {}}]
          (is (= {"@tenant.slug" "empty-attrs-tenant"}
                 (tenants/login-attributes {:tenant_id tenant-id}))))))))

(deftest login-attributes-nonexistent-tenant-test
  (testing "returns nil when tenant_id doesn't exist"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (is (empty? (tenants/login-attributes {:tenant_id 99999})))))))
