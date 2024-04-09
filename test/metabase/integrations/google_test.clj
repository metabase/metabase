(ns metabase.integrations.google-test
  (:require
   [clojure.test :refer :all]
   [metabase.email-test :as et]
   [metabase.integrations.google :as google]
   [metabase.integrations.google.interface :as google.i]
   [metabase.models.interface :as mi]
   [metabase.models.user :refer [User]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections))

;;; --------------------------------------------- google-auth-client-id ----------------------------------------------

(deftest google-auth-client-id-test
  (mt/with-temporary-setting-values [google-auth-client-id nil]
    (testing "Client ID must end with correct suffix"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid Google Sign-In Client ID: must end with \".apps.googleusercontent.com\""
           (google/google-auth-client-id! "invalid-client-id"))))

    (testing "Trailing whitespace in client ID is stripped upon save"
      (google/google-auth-client-id! "test-client-id.apps.googleusercontent.com     ")
      (is (= "test-client-id.apps.googleusercontent.com" (google/google-auth-client-id))))

    (testing "Saving an empty string will clear the client ID setting"
      (google/google-auth-client-id! "")
      (is (= nil (google/google-auth-client-id))))))


;;; --------------------------------------------- account autocreation -----------------------------------------------

(defmacro ^:private with-no-sso-google-token [& body]
  `(with-redefs [premium-features/enable-sso-google? (constantly false)]
     ~@body))

(deftest allow-autocreation-test
  (with-no-sso-google-token
    (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
      (are [allowed? email] (= allowed?
                               (#'google/autocreate-user-allowed-for-email? email))
        true  "cam@metabase.com"
        false "cam@expa.com"))))

(deftest google-auth-auto-create-accounts-domain-test
  (testing "multiple domains cannot be set if EE `:sso-google` feature flag is not enabled"
    (with-no-sso-google-token
      (is (thrown?
           clojure.lang.ExceptionInfo
           (google.i/google-auth-auto-create-accounts-domain! "metabase.com, example.com"))))))

(deftest google-auth-create-new-user!-test
  (mt/with-model-cleanup [User]
    (with-no-sso-google-token
      (testing "shouldn't be allowed to create a new user via Google Auth if their email doesn't match the auto-create accounts domain"
        (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "sf-toucannery.com"]
          (is (thrown?
               clojure.lang.ExceptionInfo
               (#'google/google-auth-create-new-user! {:first_name "Rasta"
                                                       :last_name  "Toucan"
                                                       :email      "rasta@metabase.com"})))))

      (testing "should totally work if the email domains match up"
        (et/with-fake-inbox
          (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "sf-toucannery.com"
                                             admin-email                             "rasta@toucans.com"]
            (let [user (#'google/google-auth-create-new-user! {:first_name "Rasta"
                                                               :last_name  "Toucan"
                                                               :email      "rasta@sf-toucannery.com"})]
              (is (= {:first_name "Rasta", :last_name "Toucan", :email "rasta@sf-toucannery.com"}
                     (select-keys user [:first_name :last_name :email]))))))))))


;;; --------------------------------------------- google-auth-token-info ---------------------------------------------

(deftest google-auth-token-info-tests
  (testing "Throws exception"
    (testing "for non-200 status"
      (is (= [400 "Invalid Google Sign-In token."]
             (try
               (#'google/google-auth-token-info {:status 400} "")
               (catch Exception e
                 [(-> e ex-data :status-code) (.getMessage e)])))))

    (testing "for invalid data."
      (is (= [400 "Google Sign-In token appears to be incorrect. Double check that it matches in Google and Metabase."]
             (try
               (#'google/google-auth-token-info
                {:status 200
                 :body   "{\"aud\":\"BAD-GOOGLE-CLIENT-ID\"}"}
                "PRETEND-GOOD-GOOGLE-CLIENT-ID")
               (catch Exception e
                 [(-> e ex-data :status-code) (.getMessage e)]))))
      (is (= [400 "Email is not verified."]
             (try
               (#'google/google-auth-token-info
                {:status 200
                 :body   (str "{\"aud\":\"PRETEND-GOOD-GOOGLE-CLIENT-ID\","
                              "\"email_verified\":false}")}
                "PRETEND-GOOD-GOOGLE-CLIENT-ID")
               (catch Exception e
                 [(-> e ex-data :status-code) (.getMessage e)]))))
      (is (= {:aud            "PRETEND-GOOD-GOOGLE-CLIENT-ID"
              :email_verified "true"}
             (try
               (#'google/google-auth-token-info
                {:status 200
                 :body   (str "{\"aud\":\"PRETEND-GOOD-GOOGLE-CLIENT-ID\","
                              "\"email_verified\":\"true\"}")}
                "PRETEND-GOOD-GOOGLE-CLIENT-ID")
               (catch Exception e
                 [(-> e ex-data :status-code) (.getMessage e)]))))))

  (testing "Supports multiple :aud token data fields"
    (let [token-1 "GOOGLE-CLIENT-ID-1"
          token-2 "GOOGLE-CLIENT-ID-2"]
      (is (= [token-1 token-2]
             (:aud (#'google/google-auth-token-info
                    {:status 200
                     :body   (format "{\"aud\":[\"%s\",\"%s\"],\"email_verified\":\"true\"}"
                                     token-1
                                     token-2)}
                    token-1)))))))


;;; --------------------------------------- google-auth-fetch-or-create-user! ----------------------------------------

(deftest google-auth-fetch-or-create-user!-test
  (mt/with-model-cleanup [User]
    (with-no-sso-google-token
      (testing "test that an existing user can log in with Google auth even if the auto-create accounts domain is different from"
        (t2.with-temp/with-temp [User _ {:email "cam@sf-toucannery.com"}]
          (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
            (testing "their account should return a UserInstance"
              (is (mi/instance-of? User
                                   (#'google/google-auth-fetch-or-create-user!
                                    "Cam" "Saul" "cam@sf-toucannery.com")))))))

      (testing "test that a user that doesn't exist with a *different* domain than the auto-create accounts domain gets an exception"
        (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain nil
                                           admin-email                             "rasta@toucans.com"]
          (is (thrown?
               clojure.lang.ExceptionInfo
               (#'google/google-auth-fetch-or-create-user!
                "Rasta" "Can" "rasta@sf-toucannery.com")))))

      (testing "test that a user that doesn't exist with the *same* domain as the auto-create accounts domain means a new user gets created"
        (et/with-fake-inbox
          (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "sf-toucannery.com"
                                             admin-email                             "rasta@toucans.com"]
            (is (mi/instance-of? User
                                 (#'google/google-auth-fetch-or-create-user!
                                  "Rasta" "Toucan" "rasta@sf-toucannery.com")))))))))

(deftest google-auth-fetch-or-create-user!-updated-name-test
  (testing "test that a existing user gets an updated name when calling google-auth-fetch-or-create-user!"
    (et/with-fake-inbox
      (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "sf-toucannery.com"
                                         admin-email                             "rasta@toucans.com"]
        (mt/with-model-cleanup [User]
          (#'google/google-auth-fetch-or-create-user! "Rasta" "Toucan" "rasta@sf-toucannery.com")
          (#'google/google-auth-fetch-or-create-user! "Basta" "Boucan" "rasta@sf-toucannery.com")
          (let [user (t2/select-one [User :first_name :last_name] :email "rasta@sf-toucannery.com")]
            (is (= "Basta" (:first_name user)))
            (is (= "Boucan" (:last_name user)))))))))
