(ns metabase.tenants.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.tenants.core :as tenants]))

(deftest combine-user-attributes-only-test
  (testing "combine function with user attributes only"
    (is (= {"key1" {:source :user :frozen false :value "value1"}
            "key2" {:source :user :frozen false :value "value2"}}
           (tenants/combine {"key1" "value1" "key2" "value2"} nil)))))

(deftest combine-user-and-tenant-attributes-test
  (testing "combine function with user and tenant attributes"
    (is (= {"user-key" {:source :user :frozen false :value "user-value"}
            "tenant-key" {:source :tenant :frozen false :value "tenant-value"}}
           (tenants/combine {"user-key" "user-value"}
                            nil
                            {"tenant-key" "tenant-value"}
                            nil)))))

(deftest combine-user-overrides-tenant-attributes-test
  (testing "combine function where user overrides tenant attributes"
    (is (= {"shared-key" {:source :user
                          :frozen false
                          :value "user-value"
                          :original {:source :tenant :frozen false :value "tenant-value"}}}
           (tenants/combine {"shared-key" "user-value"}
                            nil
                            {"shared-key" "tenant-value"}
                            nil)))))

(deftest combine-system-attributes-override-everything-test
  (testing "combine function where system attributes in conflict cause it to throw"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot clobber"
                          (tenants/combine {"@system-key" "user-value"}
                                           nil
                                           {"@system-key" "tenant-value"}
                                           {"@system-key" "system-value"})))))

(deftest combine-empty-inputs-nil-test
  (testing "combine function with nil input"
    (is (= {} (tenants/combine nil nil)))))

(deftest combine-empty-inputs-all-nil-test
  (testing "combine function with all nil inputs"
    (is (= {} (tenants/combine nil nil nil nil)))))

(deftest combine-empty-inputs-empty-maps-test
  (testing "combine function with empty maps"
    (is (= {} (tenants/combine {} {} {} {})))))

(deftest combine-nil-user-with-tenant-and-system-test
  (testing "combine function with nil user but tenant and system attributes"
    (is (= {"tenant-key" {:source :tenant :frozen false :value "tenant-value"}
            "@system-key" {:source :system :frozen true :value "system-value"}}
           (tenants/combine nil
                            nil
                            {"tenant-key" "tenant-value"}
                            {"@system-key" "system-value"})))))

(deftest attribute-structure-oss-with-user-login-attributes-test
  (testing "OSS version of attribute-structure with user login attributes"
    (let [user {:id 1
                :email "test@example.com"
                :login_attributes {"role" "admin" "department" "engineering"}
                :jwt_attributes {"session" "abc123"}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :login_attributes {"role" "admin" "department" "engineering"}
              :jwt_attributes {"session" "abc123"}
              :structured_attributes {"role" {:source :user :frozen false :value "admin"}
                                      "department" {:source :user :frozen false :value "engineering"}
                                      "session" {:source :jwt :frozen false :value "abc123"}}}
             result)))))

(deftest attribute-structure-oss-with-nil-login-attributes-test
  (testing "OSS version of attribute-structure with nil login attributes"
    (let [user {:id 1
                :email "test@example.com"
                :login_attributes nil
                :jwt_attributes {"token" "xyz789"}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :login_attributes nil
              :jwt_attributes {"token" "xyz789"}
              :structured_attributes {"token" {:source :jwt :frozen false :value "xyz789"}}}
             result)))))

(deftest attribute-structure-oss-with-empty-login-attributes-test
  (testing "OSS version of attribute-structure with empty login attributes"
    (let [user {:id 1
                :email "test@example.com"
                :login_attributes {}
                :jwt_attributes nil}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :login_attributes {}
              :jwt_attributes nil
              :structured_attributes {}}
             result)))))

(deftest attribute-structure-oss-user-without-login-attributes-key-test
  (testing "OSS version of attribute-structure with user without login_attributes key"
    (let [user {:id 1
                :email "test@example.com"
                :jwt_attributes {"auth" "bearer-token"}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :jwt_attributes {"auth" "bearer-token"}
              :structured_attributes {"auth" {:source :jwt :frozen false :value "bearer-token"}}}
             result)))))

(deftest attribute-structure-oss-preserves-other-user-fields-test
  (testing "OSS version of attribute-structure preserves other user fields"
    (let [user {:id 1
                :email "test@example.com"
                :first_name "John"
                :last_name "Doe"
                :is_active true
                :login_attributes {"role" "user"}
                :jwt_attributes {"scope" "read-write"}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :first_name "John"
              :last_name "Doe"
              :is_active true
              :login_attributes {"role" "user"}
              :jwt_attributes {"scope" "read-write"}
              :structured_attributes {"role" {:source :user :frozen false :value "user"}
                                      "scope" {:source :jwt :frozen false :value "read-write"}}}
             result)))))

(deftest combine-jwt-attributes-only-test
  (testing "combine function with JWT attributes only"
    (is (= {"jwt-key" {:source :jwt :frozen false :value "jwt-value"}}
           (tenants/combine nil {"jwt-key" "jwt-value"})))))

(deftest combine-user-overrides-jwt-attributes-test
  (testing "combine function where user overrides JWT attributes"
    (is (= {"shared-key" {:source :user
                          :frozen false
                          :value "user-value"
                          :original {:source :jwt :frozen false :value "jwt-value"}}}
           (tenants/combine {"shared-key" "user-value"}
                            {"shared-key" "jwt-value"})))))

(deftest combine-jwt-overrides-tenant-attributes-test
  (testing "combine function where JWT overrides tenant attributes"
    (is (= {"shared-key" {:source :jwt
                          :frozen false
                          :value "jwt-value"
                          :original {:source :tenant :frozen false :value "tenant-value"}}}
           (tenants/combine nil
                            {"shared-key" "jwt-value"}
                            {"shared-key" "tenant-value"}
                            nil)))))

(deftest attribute-structure-oss-jwt-overrides-user-test
  (testing "OSS version where JWT attributes override user attributes"
    (let [user {:id 1
                :email "test@example.com"
                :login_attributes {"role" "user-role"}
                :jwt_attributes {"role" "jwt-role"}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :login_attributes {"role" "user-role"}
              :jwt_attributes {"role" "jwt-role"}
              :structured_attributes {"role" {:source :user :frozen false :value "user-role"
                                              :original {:source :jwt :frozen false :value "jwt-role"}}}}
             result)))))

(deftest combine-all-attribute-types-test
  (testing "combine function with user, JWT, tenant, and system attributes"
    (is (= {"user-only" {:source :user :frozen false :value "user-val"}
            "jwt-only" {:source :jwt :frozen false :value "jwt-val"}
            "tenant-only" {:source :tenant :frozen false :value "tenant-val"}
            "@system-only" {:source :system :frozen true :value "system-val"}
            "override-chain" {:source :user
                              :frozen false
                              :value "user-wins"
                              :original {:source :jwt :frozen false :value "jwt-loses"}}}
           (tenants/combine {"user-only" "user-val" "override-chain" "user-wins"}
                            {"jwt-only" "jwt-val" "override-chain" "jwt-loses"}
                            {"tenant-only" "tenant-val"}
                            {"@system-only" "system-val"})))))
