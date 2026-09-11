(ns metabase-enterprise.internal-stats.core-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.internal-stats.core :as sut]
   [metabase.test :as mt]))

(deftest enabled-embedding-static-test
  (testing "true when modular embedding is on and dashboard count is greater than 0"
    (mt/with-temporary-setting-values [enable-embedding-modular true]
      (is (:enabled-embedding-static (sut/embedding-settings 1 0)))))
  (testing "true when modular embedding is on and question count is greater than 0"
    (mt/with-temporary-setting-values [enable-embedding-modular true]
      (is (:enabled-embedding-static (sut/embedding-settings 0 1)))))
  (testing "false when modular embedding is on and no cards or dashboards are enabled"
    (is (not (:enabled-embedding-static (sut/embedding-settings 0 0)))))
  (testing "false when modular embedding is off"
    (mt/with-temporary-setting-values [enable-embedding-modular false]
      (is (not (:enabled-embedding-static (sut/embedding-settings 1 1)))))))

(def ^:private idp-cert (slurp "test_resources/sso/auth0-public-idp.cert"))

(deftest enabled-embedding-interactive-test
  (mt/with-temporary-setting-values [saml-enabled        false
                                     google-auth-enabled false
                                     jwt-enabled         false
                                     ldap-enabled        false]
    (testing "with saml-enabled"
      (mt/with-temporary-setting-values [saml-enabled                       true
                                         saml-identity-provider-uri         "https://idp.example.com"
                                         saml-identity-provider-certificate idp-cert]
        (testing "with enabled interactive embedding and a configured app origin"
          (mt/with-temporary-setting-values [enable-embedding-interactive      true
                                             embedding-app-origins-interactive "example.com"]
            (is (:enabled-embedding-interactive (sut/embedding-settings 0 0)))))
        (testing "with disabled interactive embedding and a configured app origin"
          (mt/with-temporary-setting-values [enable-embedding-interactive      false
                                             embedding-app-origins-interactive "example.com"]
            (is (not (:enabled-embedding-interactive (sut/embedding-settings 0 0))))))
        (testing "with enabled interactive embedding and without a configured app origin"
          (mt/with-temporary-setting-values [enable-embedding-interactive      false]
            (is (not (:enabled-embedding-interactive (sut/embedding-settings 0 0))))))))
    (testing "with saml-disabled"
      (mt/with-temporary-setting-values [saml-enabled false]
        (testing "with enabled interactive embedding and a configured app origin"
          (mt/with-temporary-setting-values [enable-embedding-interactive      true
                                             embedding-app-origins-interactive "example.com"]
            (is (not (:enabled-embedding-interactive (sut/embedding-settings 0 0))))))))
    (testing "with saml-disabled and jwt-enabled"
      (mt/with-temporary-setting-values [saml-enabled      false
                                         jwt-enabled       true
                                         jwt-shared-secret "asdfasdf"]
        (testing "with enabled interactive embedding and a configured app origin"
          (mt/with-temporary-setting-values [enable-embedding-interactive      true
                                             embedding-app-origins-interactive "example.com"]
            (is (:enabled-embedding-interactive (sut/embedding-settings 0 0)))))))
    (testing "with saml-disabled and google-auth-enabled"
      (mt/with-temporary-setting-values [saml-enabled          false
                                         google-auth-client-id "test-client-id.apps.googleusercontent.com"
                                         google-auth-enabled   true]
        (testing "with enabled interactive embedding and a configured app origin"
          (mt/with-temporary-setting-values [enable-embedding-interactive      true
                                             embedding-app-origins-interactive "example.com"]
            (is (:enabled-embedding-interactive (sut/embedding-settings 0 0)))))))))

(deftest enabled-embedding-sdk
  (testing "with modular embedding on and jwt enabled"
    (mt/with-temporary-setting-values [enable-embedding-modular true
                                       jwt-shared-secret        "asdfasdf"
                                       jwt-enabled              true]
      (is (:enabled-embedding-sdk (sut/embedding-settings 0 0)))))
  (testing "with modular embedding off and jwt enabled"
    (mt/with-temporary-setting-values [enable-embedding-modular false
                                       jwt-enabled              true]
      (is (not (:enabled-embedding-sdk (sut/embedding-settings 0 0))))))
  (testing "with modular embedding on and jwt disabled"
    (mt/with-temporary-setting-values [enable-embedding-modular true
                                       jwt-enabled              false]
      (is (not (:enabled-embedding-sdk (sut/embedding-settings 0 0)))))))
