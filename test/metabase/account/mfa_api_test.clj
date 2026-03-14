(ns metabase.account.mfa-api-test
  "Tests for /api/mfa and /api/session MFA flow"
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.totp :as totp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;;; -------------------------------------------------- MFA Setup Flow --------------------------------------------------

(deftest mfa-setup-test
  (testing "POST /api/mfa/setup returns secret, URI, and recovery codes"
    (let [response (mt/user-http-request :rasta :post 200 "mfa/setup")]
      (is (string? (:secret response)))
      (is (string? (:otpauth_uri response)))
      (is (= 10 (count (:recovery_codes response)))))))

(deftest mfa-confirm-test
  (testing "POST /api/mfa/confirm activates TOTP with a valid code"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled false
                                                               :totp_secret  nil
                                                               :totp_recovery_codes nil}
      ;; Step 1: Setup
      (let [setup-response (mt/user-http-request :rasta :post 200 "mfa/setup")
            secret         (:secret setup-response)
            ;; Generate a valid TOTP code from the secret
            time-step      (quot (quot (System/currentTimeMillis) 1000) 30)
            valid-code     (totp/totp-code secret time-step)]
        ;; Step 2: Confirm
        (let [confirm-response (mt/user-http-request :rasta :post 200 "mfa/confirm"
                                                     {:totp-code valid-code})]
          (is (= {:success true} confirm-response))
          ;; Verify it's actually enabled in the DB
          (is (true? (t2/select-one-fn :totp_enabled :model/User :id (mt/user->id :rasta)))))))))

(deftest mfa-confirm-invalid-code-test
  (testing "POST /api/mfa/confirm rejects an invalid code"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled false
                                                               :totp_secret  nil
                                                               :totp_recovery_codes nil}
      (mt/user-http-request :rasta :post 200 "mfa/setup")
      (is (= 400
             (:status-code
              (mt/user-http-request :rasta :post "mfa/confirm"
                                    {:totp-code "000000"})))))))

(deftest mfa-disable-test
  (testing "POST /api/mfa/disable disables TOTP when given correct password"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled false
                                                               :totp_secret  nil
                                                               :totp_recovery_codes nil}
      ;; Enable TOTP first
      (let [setup-response (mt/user-http-request :rasta :post 200 "mfa/setup")
            secret         (:secret setup-response)
            time-step      (quot (quot (System/currentTimeMillis) 1000) 30)
            valid-code     (totp/totp-code secret time-step)]
        (mt/user-http-request :rasta :post 200 "mfa/confirm" {:totp-code valid-code})
        ;; Now disable
        (mt/user-http-request :rasta :post 204 "mfa/disable"
                              {:password (:password (mt/user->credentials :rasta))})
        (is (false? (t2/select-one-fn :totp_enabled :model/User :id (mt/user->id :rasta))))))))

;;; -------------------------------------------------- MFA Login Flow --------------------------------------------------

(deftest mfa-login-flow-test
  (testing "Login with MFA-enabled user returns mfa_required, then verify completes login"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled false
                                                               :totp_secret  nil
                                                               :totp_recovery_codes nil}
      ;; Enable TOTP
      (let [setup-response (mt/user-http-request :rasta :post 200 "mfa/setup")
            secret         (:secret setup-response)
            time-step      (quot (quot (System/currentTimeMillis) 1000) 30)
            valid-code     (totp/totp-code secret time-step)]
        (mt/user-http-request :rasta :post 200 "mfa/confirm" {:totp-code valid-code})

        ;; Login should now return mfa_required
        (let [login-response (mt/client :post 200 "session" (mt/user->credentials :rasta))]
          (is (true? (:mfa_required login-response)))
          (is (string? (:mfa_token login-response)))

          ;; Verify with TOTP code
          (let [mfa-code     (totp/totp-code secret (quot (quot (System/currentTimeMillis) 1000) 30))
                verify-response (mt/client :post 200 "session/mfa-verify"
                                           {:mfa-token     (:mfa_token login-response)
                                            :totp-code     mfa-code})]
            (is (string? (:id verify-response)))))))))

(deftest mfa-login-without-mfa-test
  (testing "Login with MFA-disabled user returns normal session (backward compat)"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled false}
      (let [response (mt/client :post 200 "session" (mt/user->credentials :rasta))]
        (is (string? (:id response)))
        (is (nil? (:mfa_required response)))))))

(deftest mfa-login-recovery-code-test
  (testing "Login with MFA using a recovery code"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled false
                                                               :totp_secret  nil
                                                               :totp_recovery_codes nil}
      ;; Enable TOTP
      (let [setup-response (mt/user-http-request :rasta :post 200 "mfa/setup")
            secret         (:secret setup-response)
            recovery-codes (:recovery_codes setup-response)
            time-step      (quot (quot (System/currentTimeMillis) 1000) 30)
            valid-code     (totp/totp-code secret time-step)]
        (mt/user-http-request :rasta :post 200 "mfa/confirm" {:totp-code valid-code})

        ;; Login
        (let [login-response (mt/client :post 200 "session" (mt/user->credentials :rasta))]
          ;; Verify with recovery code
          (let [verify-response (mt/client :post 200 "session/mfa-verify"
                                           {:mfa-token     (:mfa_token login-response)
                                            :recovery-code (first recovery-codes)})]
            (is (string? (:id verify-response)))))))))

(deftest mfa-verify-invalid-totp-test
  (testing "MFA verify rejects an invalid TOTP code"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled false
                                                               :totp_secret  nil
                                                               :totp_recovery_codes nil}
      (let [setup-response (mt/user-http-request :rasta :post 200 "mfa/setup")
            secret         (:secret setup-response)
            time-step      (quot (quot (System/currentTimeMillis) 1000) 30)
            valid-code     (totp/totp-code secret time-step)]
        (mt/user-http-request :rasta :post 200 "mfa/confirm" {:totp-code valid-code})
        (let [login-response (mt/client :post 200 "session" (mt/user->credentials :rasta))]
          (mt/client :post 401 "session/mfa-verify"
                     {:mfa-token (:mfa_token login-response)
                      :totp-code "000000"}))))))

(deftest mfa-verify-expired-token-test
  (testing "MFA verify rejects an expired or invalid token"
    (mt/client :post 401 "session/mfa-verify"
               {:mfa-token     "invalid-token"
                :totp-code     "123456"})))

;;; ------------------------------------------- MFA Disable When Required -------------------------------------------

(deftest mfa-disable-blocked-when-required-test
  (testing "POST /api/mfa/disable is blocked when require-mfa is enabled for password-auth users"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled true}
      (mt/with-temp-vals-in-db :model/User (mt/user->id :crowberto) {:totp_enabled true}
        (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value true})
        (try
          (is (re-find #"required by your administrator"
                       (mt/user-http-request :rasta :post 400 "mfa/disable"
                                             {:password (:password (mt/user->credentials :rasta))})))
          (finally
            (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value false}))))))

  (testing "SSO users can disable TOTP even when require-mfa is enabled"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled true
                                                               :totp_secret  "JBSWY3DPEHPK3PXP"
                                                               :sso_source   "google"}
      (mt/with-temp-vals-in-db :model/User (mt/user->id :crowberto) {:totp_enabled true}
        (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value true})
        (try
          (mt/user-http-request :rasta :post 204 "mfa/disable"
                                {:password (:password (mt/user->credentials :rasta))})
          (is (false? (t2/select-one-fn :totp_enabled :model/User :id (mt/user->id :rasta))))
          (finally
            (mt/user-http-request :crowberto :put 204 "setting/require-mfa" {:value false}))))))

  (testing "POST /api/mfa/disable works when require-mfa is disabled"
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:totp_enabled true
                                                               :totp_secret  "JBSWY3DPEHPK3PXP"}
      (mt/user-http-request :rasta :post 204 "mfa/disable"
                            {:password (:password (mt/user->credentials :rasta))})
      (is (false? (t2/select-one-fn :totp_enabled :model/User :id (mt/user->id :rasta)))))))
