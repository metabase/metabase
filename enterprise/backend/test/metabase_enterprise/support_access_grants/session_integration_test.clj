(ns metabase-enterprise.support-access-grants.session-integration-test
  "Tests for session API integration with support access grants.
  Tests the fallback mechanism in /api/session/reset_password and /api/session/password_reset_token_valid
  that tries support-access-grant provider first, then falls back to emailed-secret-password-reset."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.core :as grants]
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.session.api :as api.session]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:support-access-grants}
                              (with-redefs [api.session/throttling-disabled? true]
                                (f)))))

(deftest reset-password-with-support-access-grant-token-test
  (testing "POST /api/session/reset_password works with support access grant token"
    (mt/with-temp [:model/User {creator-id :id} {}]
      (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
        (with-redefs [sag.settings/support-access-grant-email (constantly "support@example.com")
                      sag.settings/support-access-grant-first-name (constantly "Support")
                      sag.settings/support-access-grant-last-name (constantly "User")]
          (let [grant (grants/create-grant! creator-id 60 "TICKET-123" "Test notes")
                token (:token grant)
                new-password "NewSecurePassword123!"]
            (is (some? token) "Token should be created")
            (testing "Can reset password with support access grant token"
              (let [response (mt/client :post 200 "session/reset_password"
                                        {:token token
                                         :password new-password})]
                (is (true? (:success response)) "Reset should succeed")
                (is (some? (:session_id response)) "Should return session ID")
                (testing "Support user can login with new password"
                  (let [login-result (auth-identity/login! :provider/password
                                                           {:email "support@example.com"
                                                            :password new-password
                                                            :device-info {:device_id "test-device"
                                                                          :device_description "Test"
                                                                          :embedded true
                                                                          :ip_address "127.0.0.1"}})]
                    (is (:success? login-result) "Should be able to login with new password")))))))))))

(deftest reset-password-fallback-to-regular-token-test
  (testing "POST /api/session/reset_password falls back to regular password reset when support grant token is invalid"
    (mt/with-temp [:model/User user {:email "regular@example.com"}]
      (let [regular-token (auth-identity/create-password-reset! (:id user))
            new-password "NewPassword123!"]
        (testing "Regular password reset token still works with fallback"
          (let [response (mt/client :post 200 "session/reset_password"
                                    {:token regular-token
                                     :password new-password})]
            (is (true? (:success response)) "Reset should succeed with regular token")
            (is (some? (:session_id response)) "Should return session ID")
            (testing "User can login with new password"
              (let [login-result (auth-identity/login! :provider/password
                                                       {:email "regular@example.com"
                                                        :password new-password
                                                        :device-info {:device_id "test-device"
                                                                      :device_description "Test"
                                                                      :ip_address "127.0.0.1"
                                                                      :embedded true}})]
                (is (:success? login-result) "Should be able to login with new password")))))))))

(deftest reset-password-with-expired-support-grant-test
  (testing "POST /api/session/reset_password rejects expired support access grant token"
    (mt/with-temp [:model/User {creator-id :id} {}]
      (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
        (with-redefs [sag.settings/support-access-grant-email (constantly "support@example.com")
                      sag.settings/support-access-grant-first-name (constantly "Support")
                      sag.settings/support-access-grant-last-name (constantly "User")]
          (let [grant (t/with-clock (t/mock-clock (t/minus (t/instant) (t/weeks 5)))
                        (grants/create-grant! creator-id 60 "TICKET-123" "Test notes"))
                token (:token grant)]
            (is (some? token) "Token should be created")
            (testing "Expired support access grant token is rejected"
              (let [response (mt/client :post 400 "session/reset_password"
                                        {:token token
                                         :password "NewPassword123!"})]
                (is (some? (:errors response)) "Should return error for expired token")))))))))

(deftest password-reset-token-valid-with-support-grant-test
  (testing "GET /api/session/password_reset_token_valid works with support access grant token"
    (mt/with-temp [:model/User {creator-id :id} {}]
      (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
        (with-redefs [sag.settings/support-access-grant-email (constantly "support@example.com")
                      sag.settings/support-access-grant-first-name (constantly "Support")
                      sag.settings/support-access-grant-last-name (constantly "User")]
          (let [grant (grants/create-grant! creator-id 60 "TICKET-456" "Test notes")
                token (:token grant)]
            (is (some? token) "Token should be created")
            (testing "Support access grant token is valid"
              (let [response (mt/client :get 200 "session/password_reset_token_valid"
                                        :token token)]
                (is (true? (:valid response)) "Token should be valid")))))))))

(deftest password-reset-token-valid-fallback-test
  (testing "GET /api/session/password_reset_token_valid falls back to regular password reset token"
    (mt/with-temp [:model/User user {:email "regular@example.com"}]
      (let [regular-token (auth-identity/create-password-reset! (:id user))]
        (testing "Regular password reset token is valid with fallback"
          (let [response (mt/client :get 200 "session/password_reset_token_valid"
                                    :token regular-token)]
            (is (true? (:valid response)) "Regular token should be valid")))))))

(deftest password-reset-token-valid-with-invalid-token-test
  (testing "GET /api/session/password_reset_token_valid returns false for completely invalid token"
    (let [response (mt/client :get 200 "session/password_reset_token_valid"
                              :token "totally-invalid-token-12345")]
      (is (false? (:valid response)) "Invalid token should return valid=false"))))

(deftest password-reset-token-valid-with-expired-support-grant-test
  (testing "GET /api/session/password_reset_token_valid returns false for expired support grant"
    (mt/with-temp [:model/User {creator-id :id} {}]
      (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
        (with-redefs [sag.settings/support-access-grant-email (constantly "support@example.com")
                      sag.settings/support-access-grant-first-name (constantly "Support")
                      sag.settings/support-access-grant-last-name (constantly "User")]
          (let [grant (t/with-clock (t/mock-clock (t/minus (t/instant) (t/weeks 5)))
                        (grants/create-grant! creator-id 60 "TICKET-123" "Test notes"))
                token (:token grant)]
            (is (some? token) "Token should be created")
            (testing "Expired support grant token is invalid"
              (let [response (mt/client :get 200 "session/password_reset_token_valid"
                                        :token token)]
                (is (false? (:valid response)) "Expired token should be invalid")))))))))

(deftest reset-password-creates-session-test
  (testing "POST /api/session/reset_password creates a session after successful password reset"
    (mt/with-temp [:model/User {creator-id :id} {}]
      (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User :model/Session]
        (with-redefs [sag.settings/support-access-grant-email (constantly "support@example.com")
                      sag.settings/support-access-grant-first-name (constantly "Support")
                      sag.settings/support-access-grant-last-name (constantly "User")]
          (let [grant (grants/create-grant! creator-id 60 "TICKET-999" "Test notes")
                token (:token grant)
                new-password "SecurePassword123!"]
            (testing "Session is created after password reset"
              (let [response (mt/client :post 200 "session/reset_password"
                                        {:token token
                                         :password new-password})
                    session-id (:session_id response)]
                (is (some? session-id) "Should return session ID")
                (testing "Session exists in database"
                  (let [session (t2/select-one :model/Session :key_hashed (session/hash-session-key session-id))]
                    (is (some? session) "Session should exist in database")
                    (is (= "support@example.com" (:email (t2/select-one :model/User :id (:user_id session))))
                        "Session should be for support user")))))))))))

(deftest forgot-password-support-user-disabled-test
  (testing "POST /api/session/forgot_password - Support Users cannot reset passwords"
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (mt/with-temp [:model/User user {:first_name "support"
                                       :last_name "user"
                                       :email "support@example.com"}
                     :model/AuthIdentity _ {:user_id (:id user)
                                            :provider "support-access-grant"}]
        (let [my-url "abcdefghij"]
          (mt/with-temporary-setting-values [site-url my-url]
            (mt/with-fake-inbox
              (mt/user-http-request user :post 204 "session/forgot_password" {:email (:email user)})
              (is (not (t2/exists? :model/AuthIdentity :user_id (:id user) :provider "emailed-secret-password-reset"))))))))))
