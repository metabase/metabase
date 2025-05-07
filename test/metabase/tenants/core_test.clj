(ns metabase.tenants.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.tenants.core :as tenants]))

(deftest combine-user-attributes-only-test
  (testing "combine function with user attributes only"
    (is (= {"key1" {:source :user :frozen false :value "value1"}
            "key2" {:source :user :frozen false :value "value2"}}
           (tenants/combine {"key1" "value1" "key2" "value2"})))))

(deftest combine-user-and-tenant-attributes-test
  (testing "combine function with user and tenant attributes"
    (is (= {"user-key" {:source :user :frozen false :value "user-value"}
            "tenant-key" {:source :tenant :frozen false :value "tenant-value"}}
           (tenants/combine {"user-key" "user-value"}
                            {"tenant-key" "tenant-value"}
                            nil)))))

(deftest combine-user-overrides-tenant-attributes-test
  (testing "combine function where user overrides tenant attributes"
    (is (= {"shared-key" {:source :user
                          :frozen false
                          :value "user-value"
                          :original {:source :tenant :frozen false :value "tenant-value"}}}
           (tenants/combine {"shared-key" "user-value"}
                            {"shared-key" "tenant-value"}
                            nil)))))

(deftest combine-system-attributes-override-everything-test
  (testing "combine function where system attributes in conflict cause it to throw"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot clobber"
                          (tenants/combine {"@system-key" "user-value"}
                                           {"@system-key" "tenant-value"}
                                           {"@system-key" "system-value"})))))

(deftest combine-empty-inputs-nil-test
  (testing "combine function with nil input"
    (is (= {} (tenants/combine nil)))))

(deftest combine-empty-inputs-all-nil-test
  (testing "combine function with all nil inputs"
    (is (= {} (tenants/combine nil nil nil)))))

(deftest combine-empty-inputs-empty-maps-test
  (testing "combine function with empty maps"
    (is (= {} (tenants/combine {} {} {})))))

(deftest combine-nil-user-with-tenant-and-system-test
  (testing "combine function with nil user but tenant and system attributes"
    (is (= {"tenant-key" {:source :tenant :frozen false :value "tenant-value"}
            "@system-key" {:source :system :frozen true :value "system-value"}}
           (tenants/combine nil
                            {"tenant-key" "tenant-value"}
                            {"@system-key" "system-value"})))))

(deftest attribute-structure-oss-with-user-login-attributes-test
  (testing "OSS version of attribute-structure with user login attributes"
    (let [user {:id 1
                :email "test@example.com"
                :login_attributes {"role" "admin" "department" "engineering"}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :login_attributes {"role" "admin" "department" "engineering"}
              :structured_attributes {"role" {:source :user :frozen false :value "admin"}
                                      "department" {:source :user :frozen false :value "engineering"}}}
             result)))))

(deftest attribute-structure-oss-with-nil-login-attributes-test
  (testing "OSS version of attribute-structure with nil login attributes"
    (let [user {:id 1
                :email "test@example.com"
                :login_attributes nil}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :login_attributes nil
              :structured_attributes {}}
             result)))))

(deftest attribute-structure-oss-with-empty-login-attributes-test
  (testing "OSS version of attribute-structure with empty login attributes"
    (let [user {:id 1
                :email "test@example.com"
                :login_attributes {}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :login_attributes {}
              :structured_attributes {}}
             result)))))

(deftest attribute-structure-oss-user-without-login-attributes-key-test
  (testing "OSS version of attribute-structure with user without login_attributes key"
    (let [user {:id 1
                :email "test@example.com"}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :structured_attributes {}}
             result)))))

(deftest attribute-structure-oss-preserves-other-user-fields-test
  (testing "OSS version of attribute-structure preserves other user fields"
    (let [user {:id 1
                :email "test@example.com"
                :first_name "John"
                :last_name "Doe"
                :is_active true
                :login_attributes {"role" "user"}}
          result (tenants/attribute-structure user)]
      (is (= {:id 1
              :email "test@example.com"
              :first_name "John"
              :last_name "Doe"
              :is_active true
              :login_attributes {"role" "user"}
              :structured_attributes {"role" {:source :user :frozen false :value "user"}}}
             result)))))
