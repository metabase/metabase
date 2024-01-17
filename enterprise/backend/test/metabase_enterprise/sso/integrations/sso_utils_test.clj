(ns metabase-enterprise.sso.integrations.sso-utils-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
            [metabase.public-settings :as public-settings]
            [metabase.test :as mt]))

(deftest check-sso-redirect-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
   (testing "check-sso-redirect properly validates redirect URIs"
     (are [uri] (sso-utils/check-sso-redirect uri)
       "/"
       "/test"
       "localhost"
       "localhost:3000"
       "http://localhost:3000"
       "http://localhost:3000/dashboard/1-test-dashboard?currency=British%20Pound"))

   (testing "check-sso-redirect- throws an error for invalid redirect URIs"
     (are [uri] (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid redirect URL" (sso-utils/check-sso-redirect uri))
       "http://example.com"
       "//example.com"
       "not a url"
       "http://localhost:3000?a=not a param"))))

(deftest create-new-sso-user-test
  (mt/with-model-cleanup [:model/User]
    (testing "create-new-sso-user! creates a new user with the given attributes"
      (let [user-attributes {:first_name       "Test"
                             :last_name        "User"
                             :email            "create-new-sso-user-test@metabase.com"
                             :sso_source       :jwt
                             :login_attributes {:foo "bar"}}
            new-user (sso-utils/create-new-sso-user! user-attributes)]
        (is (partial=
             {:first_name "Test"
              :last_name "User"
              :email "create-new-sso-user-test@metabase.com"}
             new-user))))

    (testing "If a user with the given email already exists, a generic exception is thrown"
      (let [user-attributes {:first_name       "Test"
                             :last_name        "User"
                             :email            "create-new-sso-user-test@metabase.com"
                             :sso_source       :jwt
                             :login_attributes {:foo "bar"}}]
        (is
         (thrown-with-msg?
          clojure.lang.ExceptionInfo
          #"Error creating new SSO user"
          (sso-utils/create-new-sso-user! user-attributes)))))))

(deftest create-new-jwt-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-redefs [sso-settings/jwt-user-provisioning-enabled? (constantly false)
                  public-settings/site-name (constantly "test")]
      (let [user-attributes {:first_name       "Test"
                             :last_name        "User"
                             :email            "create-new-sso-user-test@metabase.com"
                             :sso_source       :jwt
                             :login_attributes {:foo "bar"}}]
        (is
         (thrown-with-msg?
          clojure.lang.ExceptionInfo
          #"Sorry, but you'll need a test account to view this page. Please contact your administrator."
          (sso-utils/create-new-sso-user! user-attributes)))))))

(deftest create-new-saml-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-redefs [sso-settings/saml-user-provisioning-enabled? (constantly false)
                  public-settings/site-name (constantly "test")]
      (let [user-attributes {:first_name       "Test"
                             :last_name        "User"
                             :email            "create-new-sso-user-test@metabase.com"
                             :sso_source       :saml
                             :login_attributes {:foo "bar"}}]
        (is
         (thrown-with-msg?
          clojure.lang.ExceptionInfo
          #"Sorry, but you'll need a test account to view this page. Please contact your administrator."
          (sso-utils/create-new-sso-user! user-attributes)))))))
