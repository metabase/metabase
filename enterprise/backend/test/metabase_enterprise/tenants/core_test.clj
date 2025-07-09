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

(deftest attribute-structure-ee-with-user-and-tenant-attributes-test
  (testing "EE version of attribute-structure with user and tenant attributes"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Test Tenant"
                                          :slug "test-tenant"
                                          :attributes {"environment" "production"
                                                       "region" "us-east-1"}}]
          (let [user {:id 1
                      :email "test@example.com"
                      :tenant_id tenant-id
                      :login_attributes {"role" "admin" "department" "engineering"}}
                result (tenants/attribute-structure user)]
            (is (= {:id 1
                    :email "test@example.com"
                    :tenant_id tenant-id
                    :login_attributes {"role" "admin"
                                       "department" "engineering"}
                    :structured_attributes {"role" {:source :user :frozen false :value "admin"}
                                            "department" {:source :user :frozen false :value "engineering"}
                                            "environment" {:source :tenant :frozen false :value "production"}
                                            "region" {:source :tenant :frozen false :value "us-east-1"}
                                            "@tenant.slug" {:source :system :frozen true :value "test-tenant"}}}
                   result))))))))

(deftest attribute-structure-ee-user-overrides-tenant-test
  (testing "EE version where user attributes override tenant attributes"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Test Tenant"
                                          :slug "test-tenant"
                                          :attributes {"environment" "production"
                                                       "role" "tenant-role"}}]
          (let [user {:id 1
                      :email "test@example.com"
                      :tenant_id tenant-id
                      :login_attributes {"role" "user-role" "department" "engineering"}}
                result (tenants/attribute-structure user)]
            (is (= {:id 1
                    :email "test@example.com"
                    :tenant_id tenant-id
                    :login_attributes {"role" "user-role"
                                       "department" "engineering"}
                    :structured_attributes {"role" {:source :user :frozen false :value "user-role"
                                                    :original {:source :tenant :frozen false :value "tenant-role"}}
                                            "department" {:source :user :frozen false :value "engineering"}
                                            "environment" {:source :tenant :frozen false :value "production"}
                                            "@tenant.slug" {:source :system :frozen true :value "test-tenant"}}}
                   result))))))))

(deftest attribute-structure-ee-no-tenant-id-test
  (testing "EE version with user without tenant_id"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (let [user {:id 1
                    :email "test@example.com"
                    :login_attributes {"role" "admin" "department" "engineering"}}
              result (tenants/attribute-structure user)]
          (is (= {:id 1
                  :email "test@example.com"
                  :login_attributes {"role" "admin" "department" "engineering"}
                  :structured_attributes {"role" {:source :user :frozen false :value "admin"}
                                          "department" {:source :user :frozen false :value "engineering"}}}
                 result)))))))

(deftest attribute-structure-ee-nil-tenant-id-test
  (testing "EE version with user with nil tenant_id"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (let [user {:id 1
                    :email "test@example.com"
                    :tenant_id nil
                    :login_attributes {"role" "admin"}}
              result (tenants/attribute-structure user)]
          (is (= {:id 1
                  :email "test@example.com"
                  :tenant_id nil
                  :login_attributes {"role" "admin"}
                  :structured_attributes {"role" {:source :user :frozen false :value "admin"}}}
                 result)))))))

(deftest attribute-structure-ee-nonexistent-tenant-test
  (testing "EE version with user referencing nonexistent tenant"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (let [user {:id 1
                    :email "test@example.com"
                    :tenant_id 99999
                    :login_attributes {"role" "admin"}}
              result (tenants/attribute-structure user)]
          (is (= {:id 1
                  :email "test@example.com"
                  :tenant_id 99999
                  :login_attributes {"role" "admin"}
                  :structured_attributes {"role" {:source :user :frozen false :value "admin"}}}
                 result)))))))

(deftest attribute-structure-ee-tenant-no-attributes-test
  (testing "EE version with tenant that has no attributes"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Empty Tenant"
                                          :slug "empty-tenant"}]
          (let [user {:id 1
                      :email "test@example.com"
                      :tenant_id tenant-id
                      :login_attributes {"role" "admin"}}
                result (tenants/attribute-structure user)]
            (is (= {:id 1
                    :email "test@example.com"
                    :tenant_id tenant-id
                    :login_attributes {"role" "admin"}
                    :structured_attributes {"role" {:source :user :frozen false :value "admin"}
                                            "@tenant.slug" {:source :system :frozen true :value "empty-tenant"}}}
                   result))))))))

(deftest attribute-structure-ee-tenant-empty-attributes-test
  (testing "EE version with tenant that has empty attributes map"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Empty Attrs Tenant"
                                          :slug "empty-attrs-tenant"
                                          :attributes {}}]
          (let [user {:id 1
                      :email "test@example.com"
                      :tenant_id tenant-id
                      :login_attributes {"role" "admin"}}
                result (tenants/attribute-structure user)]
            (is (= {:id 1
                    :email "test@example.com"
                    :tenant_id tenant-id
                    :login_attributes {"role" "admin"}
                    :structured_attributes {"role" {:source :user :frozen false :value "admin"}
                                            "@tenant.slug" {:source :system :frozen true :value "empty-attrs-tenant"}}}
                   result))))))))

(deftest attribute-structure-ee-nil-login-attributes-test
  (testing "EE version with user with nil login_attributes"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Test Tenant"
                                          :slug "test-tenant"
                                          :attributes {"environment" "production"}}]
          (let [user {:id 1
                      :email "test@example.com"
                      :tenant_id tenant-id
                      :login_attributes nil}
                result (tenants/attribute-structure user)]
            (is (= {:id 1
                    :email "test@example.com"
                    :tenant_id tenant-id :login_attributes nil
                    :structured_attributes {"environment" {:source :tenant :frozen false :value "production"}
                                            "@tenant.slug" {:source :system :frozen true :value "test-tenant"}}}
                   result))))))))

(deftest attribute-structure-ee-empty-login-attributes-test
  (testing "EE version with user with empty login_attributes"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Test Tenant"
                                          :slug "test-tenant"
                                          :attributes {"environment" "production"}}]
          (let [user {:id 1
                      :email "test@example.com"
                      :tenant_id tenant-id
                      :login_attributes {}}
                result (tenants/attribute-structure user)]
            (is (= {:id 1
                    :email "test@example.com"
                    :tenant_id tenant-id
                    :login_attributes {}
                    :structured_attributes {"environment" {:source :tenant :frozen false :value "production"}
                                            "@tenant.slug" {:source :system :frozen true :value "test-tenant"}}}
                   result))))))))

(deftest attribute-structure-ee-preserves-other-user-fields-test
  (testing "EE version preserves other user fields"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp
          [:model/Tenant {tenant-id :id} {:name "Test Tenant"
                                          :slug "test-tenant"
                                          :attributes {"environment" "production"}}]
          (let [user {:id 1
                      :email "test@example.com"
                      :first_name "John"
                      :last_name "Doe"
                      :is_active true
                      :tenant_id tenant-id
                      :login_attributes {"role" "user"}}
                result (tenants/attribute-structure user)]
            (is (= {:id 1
                    :email "test@example.com"
                    :first_name "John"
                    :last_name "Doe"
                    :is_active true
                    :tenant_id tenant-id
                    :login_attributes {"role" "user"}
                    :structured_attributes {"role" {:source :user :frozen false :value "user"}
                                            "environment" {:source :tenant :frozen false :value "production"}
                                            "@tenant.slug" {:source :system :frozen true :value "test-tenant"}}}
                   result))))))))

(deftest attribute-structure-ee-feature-disabled-test
  (testing "EE version falls back to OSS behavior when tenants feature is disabled"
    (mt/with-premium-features #{}
      (let [user {:id 1
                  :email "test@example.com"
                  :tenant_id 1
                  :login_attributes {"role" "admin"}}
            result (tenants/attribute-structure user)]
        (is (= {:id 1
                :email "test@example.com"
                :tenant_id 1
                :login_attributes {"role" "admin"}
                :structured_attributes {"role" {:source :user :frozen false :value "admin"}}}
               result))))))
