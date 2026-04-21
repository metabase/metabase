(ns metabase-enterprise.auth-identity.provider-test
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.provider :as provider]
   [metabase.test :as mt]))

(deftest ^:parallel sso-user-fields-oss-test
  (testing "OSS version of sso-user-fields returns basic fields only"
    (mt/with-premium-features #{}
      (is (= [:email :first_name :last_name :sso_source]
             (provider/sso-user-fields))))))

(deftest ^:parallel sso-user-fields-with-sso-jwt-test
  (testing "Enterprise version with :sso-jwt feature includes jwt_attributes and login_attributes"
    (mt/with-premium-features #{:sso-jwt}
      (is (= [:email :first_name :last_name :sso_source :login_attributes :jwt_attributes]
             (provider/sso-user-fields))))))

(deftest ^:parallel sso-user-fields-with-sso-saml-test
  (testing "Enterprise version with :sso-saml feature includes login_attributes but not jwt_attributes"
    (mt/with-premium-features #{:sso-saml}
      (is (= [:email :first_name :last_name :sso_source :login_attributes]
             (provider/sso-user-fields))))))

(deftest ^:parallel sso-user-fields-with-sso-ldap-test
  (testing "Enterprise version with :sso-ldap feature includes login_attributes but not jwt_attributes"
    (mt/with-premium-features #{:sso-ldap}
      (is (= [:email :first_name :last_name :sso_source :login_attributes]
             (provider/sso-user-fields))))))

(deftest ^:parallel sso-user-fields-with-any-sso-test
  (testing "Enterprise version with :any-sso feature does not trigger sso-user-fields (only specific flags do)"
    (mt/with-premium-features #{:any-sso}
      (is (= [:email :first_name :last_name :sso_source]
             (provider/sso-user-fields))))))

(deftest ^:parallel sso-user-fields-with-multiple-features-test
  (testing "Enterprise version with multiple SSO features includes jwt_attributes when :sso-jwt is present"
    (mt/with-premium-features #{:sso-jwt :sso-saml}
      (is (= [:email :first_name :last_name :sso_source :login_attributes :jwt_attributes]
             (provider/sso-user-fields))))))

(deftest ^:parallel sso-user-fields-with-saml-and-ldap-test
  (testing "Enterprise version with :sso-saml and :sso-ldap includes login_attributes but not jwt_attributes"
    (mt/with-premium-features #{:sso-saml :sso-ldap}
      (is (= [:email :first_name :last_name :sso_source :login_attributes]
             (provider/sso-user-fields))))))
