(ns metabase.sso.google-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.sso.google :as google]
   [metabase.sso.settings :as sso.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

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
           (sso.settings/google-auth-client-id! "invalid-client-id"))))

    (testing "Trailing whitespace in client ID is stripped upon save"
      (sso.settings/google-auth-client-id! "test-client-id.apps.googleusercontent.com     ")
      (is (= "test-client-id.apps.googleusercontent.com" (sso.settings/google-auth-client-id))))

    (testing "Saving an empty string will clear the client ID setting"
      (sso.settings/google-auth-client-id! "")
      (is (= nil (sso.settings/google-auth-client-id))))))

;;; --------------------------------------------- account autocreation -----------------------------------------------

(defmacro ^:private with-no-sso-google-token! [& body]
  `(with-redefs [premium-features/enable-sso-google? (constantly false)]
     ~@body))

(deftest allow-autocreation-test
  (with-no-sso-google-token!
    (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
      #_{:clj-kondo/ignore [:equals-true]}
      (are [allowed? email] (= allowed?
                               (#'google/autocreate-user-allowed-for-email? email))
        true  "cam@metabase.com"
        false "cam@expa.com"))))

(deftest google-auth-auto-create-accounts-domain-test
  (testing "multiple domains cannot be set if EE `:sso-google` feature flag is not enabled"
    (with-no-sso-google-token!
      (is (thrown?
           clojure.lang.ExceptionInfo
           (sso.settings/google-auth-auto-create-accounts-domain! "metabase.com, example.com"))))))

;; google-auth-create-new-user! test removed - function no longer exists, moved to provider system

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

;; google-auth-fetch-or-create-user! test removed - function no longer exists, moved to provider system

;; google-auth-fetch-or-create-user!-updated-name-test removed - function no longer exists, moved to provider system
