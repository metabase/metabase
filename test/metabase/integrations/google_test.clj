(ns metabase.integrations.google-test
  (:require [clj-http.client :as http]
            [clojure.test :refer :all]
            [metabase.email-test :as et]
            [metabase.integrations.google :as google]
            [metabase.integrations.google.interface :as google.i]
            [metabase.models.user :refer [User]]
            [metabase.public-settings.metastore :as metastore]
            [metabase.test :as mt]
            [schema.core :as s]
            [toucan.db :as db]))

(deftest email->domain-test
  (are [domain email] (is (= domain
                             (#'google/email->domain email))
                          (format "Domain of email address '%s'" email))
    "metabase.com"   "cam@metabase.com"
    "metabase.co.uk" "cam@metabase.co.uk"
    "metabase.com"   "cam.saul+1@metabase.com"))

(deftest email-in-domain-test
  (are [in-domain? email domain] (is (= in-domain?
                                        (#'google/email-in-domain? email domain))
                                     (format "Is email '%s' in domain '%s'?" email domain))
    true  "cam@metabase.com"          "metabase.com"
    false "cam.saul+1@metabase.co.uk" "metabase.com"
    true  "cam.saul+1@metabase.com"   "metabase.com"))

(deftest allow-autocreation-test
  (with-redefs [metastore/enable-sso? (constantly false)]
    (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
      (are [allowed? email] (is (= allowed?
                                   (#'google/autocreate-user-allowed-for-email? email))
                                (format "Can we autocreate an account for email '%s'?" email))
        true  "cam@metabase.com"
        false "cam@expa.com"))))

(deftest google-auth-auto-create-accounts-domain-test
  (testing "multiple domains cannot be set if EE SSO is not enabled"
    (with-redefs [metastore/enable-sso? (constantly false)]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (google.i/google-auth-auto-create-accounts-domain "metabase.com, example.com"))))))

(deftest google-auth-create-new-user!-test
  (with-redefs [metastore/enable-sso? (constantly false)]
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
            (try
              (let [user (#'google/google-auth-create-new-user! {:first_name "Rasta"
                                                                 :last_name  "Toucan"
                                                                 :email      "rasta@sf-toucannery.com"})]
                (is (= {:first_name "Rasta", :last_name "Toucan", :email "rasta@sf-toucannery.com"}
                       (select-keys user [:first_name :last_name :email]))))
              (finally
                (db/delete! User :email "rasta@sf-toucannery.com"))))))))


;;; --------------------------------------------- google-auth-token-info ---------------------------------------------

(deftest google-auth-token-info-tests
  (testing "Throws exception"
    (testing "for non-200 status"
      (is (= [400 "Invalid Google Auth token."]
             (try
               (#'google/google-auth-token-info {:status 400} "")
               (catch Exception e
                 [(-> e ex-data :status-code) (.getMessage e)])))))

    (testing "for invalid data."
      (is (= [400 "Google Auth token appears to be incorrect. Double check that it matches in Google and Metabase."]
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
  (with-redefs [metastore/enable-sso? (constantly false)]
    (testing "test that an existing user can log in with Google auth even if the auto-create accounts domain is different from"
      (mt/with-temp User [user {:email "cam@sf-toucannery.com"}]
        (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
          (testing "their account should return a UserInstance"
            (is (schema= metabase.models.user.UserInstance
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
          (try
            (is (schema= metabase.models.user.UserInstance
                         (#'google/google-auth-fetch-or-create-user!
                          "Rasta" "Toucan" "rasta@sf-toucannery.com")))
            (finally
              (db/delete! User :email "rasta@sf-toucannery.com"))))))))
