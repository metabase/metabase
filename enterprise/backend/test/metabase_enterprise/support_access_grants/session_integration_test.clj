(ns metabase-enterprise.support-access-grants.session-integration-test
  "Tests for session API integration with support access grants.
  Tests the fallback mechanism in /api/session/reset_password and /api/session/password_reset_token_valid
  that tries support-access-grant provider first, then falls back to emailed-secret-password-reset."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.core :as grants]
   [metabase-enterprise.support-access-grants.provider :as sag.provider]
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.auth-identity.provider :as auth.provider]
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
                                                                          :token_exchange false
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
                                                                      :token_exchange false
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

(deftest reset-password-with-pre-existing-emailed-secret-auth-identity-test
  (testing (str "POST /api/session/reset_password works when support user "
                "has a pre-existing emailed-secret-password-reset AuthIdentity")
    (testing (str "Reproduces production scenario: support user created previously, "
                  "emailed-secret-password-reset AuthIdentity exists, "
                  "new grant is created, reset_password should succeed")
      (mt/with-temp [:model/User {creator-id :id} {}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (let [email "support-repro@example.com"]
            (with-redefs [sag.settings/support-access-grant-email (constantly email)
                          sag.settings/support-access-grant-first-name (constantly "Support")
                          sag.settings/support-access-grant-last-name (constantly "User")]
            ;; Step 1: Create the support user via an initial grant (simulates first-time setup)
              (let [initial-grant (grants/create-grant! creator-id 60 "TICKET-INITIAL" "Initial setup")
                    initial-token (:token initial-grant)]
                (is (some? initial-token) "Initial token should be created")
              ;; Use the initial token to set the password (simulates the first login)
                (let [initial-response (mt/client :post 200 "session/reset_password"
                                                  {:token initial-token
                                                   :password "InitialPassword123!"})]
                  (is (true? (:success initial-response)) "Initial reset should succeed"))
              ;; Now the support user has:
              ;; - A password AuthIdentity (from the password set)
              ;; - A consumed support-access-grant AuthIdentity
              ;; Simulate what happens when the user also gets an emailed-secret-password-reset token
              ;; (e.g., from a previous forgot-password flow or system migration)
                (let [support-user (t2/select-one :model/User :email email)]
                ;; Create an emailed-secret-password-reset AuthIdentity directly (simulating prior usage)
                  (let [fake-token (auth-identity/create-password-reset! (:id support-user))]
                    (is (some? fake-token) "Should create emailed-secret-password-reset token")
                  ;; Verify the pre-existing auth identity exists
                    (is (t2/exists? :model/AuthIdentity
                                    :user_id (:id support-user)
                                    :provider "emailed-secret-password-reset")
                        "emailed-secret-password-reset AuthIdentity should exist"))
                ;; Step 2: Revoke the initial grant so we can create a new one
                  (let [initial-grant-record (t2/select-one :model/SupportAccessGrantLog
                                                            :ticket_number "TICKET-INITIAL")]
                    (grants/revoke-grant! creator-id (:id initial-grant-record)))
                ;; Step 3: Create a NEW support access grant (simulates the production scenario)
                  (let [new-grant (grants/create-grant! creator-id 60 "TICKET-REPRO" "Repro grant")
                        new-token (:token new-grant)
                        new-password "NewSecurePassword456!"]
                    (is (some? new-token) "New token should be created")
                  ;; Step 4: Try to reset password with the new token
                  ;; This is where the production bug manifests:
                  ;; The pre-existing emailed-secret-password-reset AuthIdentity triggers
                  ;; a cascade in model hooks that may cause an exception swallowed by with-fallback
                    (testing "Password reset succeeds with pre-existing auth identities"
                      (let [response (mt/client :post 200 "session/reset_password"
                                                {:token new-token
                                                 :password new-password})]
                        (is (true? (:success response)) "Reset should succeed")
                        (is (some? (:session_id response)) "Should return session ID")))
                    (testing "Support user can login with the new password"
                      (let [login-result (auth-identity/login! :provider/password
                                                               {:email email
                                                                :password new-password
                                                                :device-info {:device_id "test-device"
                                                                              :device_description "Test"
                                                                              :embedded false
                                                                              :token_exchange false
                                                                              :ip_address "127.0.0.1"}})]
                        (is (:success? login-result) "Should be able to login with new password")))))))))))))

(deftest ^:parallel with-fallback-preserves-error-info-test
  (testing "with-fallback swallows exceptions from the first provider, losing error info"
    (let [result (auth-identity/with-fallback
                   (fn [provider _request]
                     (if (= provider :provider/support-access-grant)
                       (throw (ex-info "Simulated error in login" {:test true}))
                       {:success? false :error :invalid-token}))
                   [:provider/support-access-grant
                    :provider/emailed-secret-password-reset]
                   {:token "fake" :password "TestPassword123!"})]
      ;; with-fallback catches the exception from the first provider and returns {:success? false}
      ;; then tries the second provider which also fails
      (is (false? (:success? result))
          "Should fail because both providers failed")
      ;; The returned error is from the FALLBACK provider, not from the one that actually threw.
      ;; The real error ("Simulated error in login") is completely lost.
      ;; This makes debugging production issues very difficult.
      (is (= :invalid-token (:error result))
          "Error is from the fallback provider, not the original - the real error is swallowed"))))

(deftest reset-password-login-directly-with-pre-existing-emailed-secret-test
  (testing (str "login! for support-access-grant succeeds when user has "
                "pre-existing emailed-secret-password-reset AuthIdentity")
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id} {}
                   :model/SupportAccessGrantLog {grant-end :grant_end_timestamp :as grant}
                   {:user_id grant-creator-id
                    :ticket_number "TEST-CASCADE"
                    :notes "Test cascade"
                    :grant_start_timestamp (t/offset-date-time)
                    :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]
      ;; Create a pre-existing emailed-secret-password-reset AuthIdentity for the user
      ;; (simulates a user who previously used forgot-password)
      (let [_old-reset-token (auth-identity/create-password-reset! user-id)]
        (is (t2/exists? :model/AuthIdentity
                        :user_id user-id
                        :provider "emailed-secret-password-reset")
            "Pre-existing emailed-secret-password-reset AuthIdentity should exist"))
      ;; Now create the support access reset token
      (let [token (sag.provider/create-support-access-reset! user-id grant)
            new-password "NewPassword789!"]
        ;; Call login! directly (bypassing with-fallback) to see the actual error
        (testing "Direct login! call should succeed"
          (let [result (auth.provider/login! :provider/support-access-grant
                                             {:token token
                                              :password new-password})]
            (is (:success? result) "login! should succeed")
            (is (some? (:session result)) "Should create a session")))
        (testing "Password AuthIdentity should have grant expiration"
          (let [pw-auth (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")]
            (is (= grant-end (:expires_at pw-auth)))))
        (testing "Support access grant token should be consumed"
          (let [sag-auth (t2/select-one :model/AuthIdentity :user_id user-id :provider "support-access-grant")]
            (is (some? (get-in sag-auth [:credentials :consumed_at])))))))))

(deftest reset-password-with-deactivated-user-test
  (testing "create-grant! reactivates a deactivated support user so password reset works"
    (mt/with-temp [:model/User {creator-id :id} {}]
      (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
        (let [email "support-deactivated@example.com"]
          (with-redefs [sag.settings/support-access-grant-email (constantly email)
                        sag.settings/support-access-grant-first-name (constantly "Support")
                        sag.settings/support-access-grant-last-name (constantly "User")]
          ;; Create and use a first grant so the support user exists
            (let [first-grant (grants/create-grant! creator-id 60 "TICKET-FIRST" "First grant")]
              (mt/client :post 200 "session/reset_password"
                         {:token (:token first-grant) :password "FirstPassword123!"})
              (grants/revoke-grant! creator-id
                                    (:id (t2/select-one :model/SupportAccessGrantLog
                                                        :ticket_number "TICKET-FIRST"))))
          ;; Deactivate the support user (simulates admin action or cleanup)
            (let [support-user (t2/select-one [:model/User :id :is_active] :email email)]
              (t2/update! :model/User (:id support-user) {:is_active false})
              (is (false? (:is_active (t2/select-one [:model/User :is_active]
                                                     :id (:id support-user))))
                  "User should be deactivated"))
          ;; Create a new grant - this should reactivate the support user
            (let [new-grant (grants/create-grant! creator-id 60 "TICKET-REACTIVATE"
                                                  "Should reactivate user")
                  token (:token new-grant)
                  support-user (t2/select-one [:model/User :id :is_active] :email email)]
              (is (some? token) "Token should be created")
              (is (true? (:is_active support-user)) "User should be reactivated by create-grant!")
              (testing "Password reset should succeed"
                (let [response (mt/client :post 200 "session/reset_password"
                                          {:token token :password "NewPassword123!"})]
                  (is (true? (:success response)) "Reset should succeed")
                  (is (some? (:session_id response)) "Should return session ID"))))))))))

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
