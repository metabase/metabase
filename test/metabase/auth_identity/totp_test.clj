(ns metabase.auth-identity.totp-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.auth-identity.mfa :as mfa]
   [metabase.auth-identity.totp :as totp]
   [metabase.session.api :as api.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- reset-throttlers! []
  (doseq [throttler (concat (vals @#'api.session/login-throttlers)
                            (vals @#'api.session/mfa-throttlers))]
    (reset! (:attempts throttler) nil)))

(use-fixtures :each (fn [f] (reset-throttlers!) (f)))

(def ^:private rfc-secret
  "RFC 6238 Appendix B seed (ASCII \"12345678901234567890\") encoded as Base32, for HMAC-SHA1."
  "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")

(deftest rfc6238-vectors-test
  (testing "6-digit truncations of the RFC 6238 Appendix B SHA1 test vectors (proves interop with authenticator apps)"
    (are [unix expected] (= expected (totp/code-for-unix-time rfc-secret unix))
      59          "287082"
      1111111109  "081804"
      1111111111  "050471"
      1234567890  "005924"
      2000000000  "279037")))

(deftest round-trip-test
  (let [secret (totp/generate-secret)]
    (testing "a generated secret is unpadded Base32"
      (is (re-matches #"[A-Z2-7]+" secret)))
    (testing "a freshly generated code validates"
      (is (totp/valid-code? secret (totp/generate-code secret))))
    (testing "malformed codes never validate"
      (is (not (totp/valid-code? secret "12")))
      (is (not (totp/valid-code? secret "abcdef")))
      (is (not (totp/valid-code? secret nil))))))

(deftest provider-authenticate-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :credentials {:secret secret :confirmed_at (t/instant)}}]
      (testing "a valid code authenticates"
        (is (:success? (auth-identity/authenticate :provider/totp
                                                   {:user-id user-id :code (totp/generate-code secret)}))))
      (testing "a malformed code does not"
        (is (not (:success? (auth-identity/authenticate :provider/totp
                                                        {:user-id user-id :code "000"}))))))))

(deftest unconfirmed-enrollment-not-accepted-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/AuthIdentity _ {:user_id user-id :provider "totp" :credentials {:secret secret}}]
      (testing "a pending (unconfirmed) enrollment is not yet a usable second factor"
        (is (nil? (mfa/enrolled-method user-id)))
        (is (not (:success? (auth-identity/authenticate :provider/totp
                                                        {:user-id user-id :code (totp/generate-code secret)}))))))))

(deftest gate-test
  (testing "the gate is a no-op when the feature is disabled"
    (mt/with-temporary-setting-values [mfa-enabled false]
      (mt/with-temp [:model/User {user-id :id} {}]
        (let [result {:success? true :user {:id user-id}}]
          (is (= result (mfa/apply-mfa-gate :provider/password result)))))))
  (testing "with the feature on and a confirmed enrollment, the gate demands a second factor"
    (mt/with-temporary-setting-values [mfa-enabled true]
      (mt/with-temp [:model/User        {user-id :id} {}
                     :model/AuthIdentity _ {:user_id user-id :provider "totp"
                                            :credentials {:secret (totp/generate-secret) :confirmed_at (t/instant)}}]
        (let [gated (mfa/apply-mfa-gate :provider/password {:success? true :user {:id user-id}})]
          (is (= :mfa-required (:success? gated)))
          (is (= "totp" (:mfa-method gated)))
          (is (string? (:mfa-token gated)))))))
  (testing "SSO providers are never gated (their IdP owns MFA)"
    (mt/with-temporary-setting-values [mfa-enabled true]
      (mt/with-temp [:model/User        {user-id :id} {}
                     :model/AuthIdentity _ {:user_id user-id :provider "totp"
                                            :credentials {:secret (totp/generate-secret) :confirmed_at (t/instant)}}]
        (let [result {:success? true :user {:id user-id}}]
          (is (= result (mfa/apply-mfa-gate :provider/google result))))))))

(deftest challenge-token-test
  (testing "a challenge token round-trips and carries the first-factor provider"
    (let [claims (mfa/verify-challenge-token (mfa/issue-challenge-token 42 :provider/password))]
      (is (= 42 (:user-id claims)))
      (is (= "password" (:provider claims)))))
  (testing "a bogus token is rejected"
    (is (nil? (mfa/verify-challenge-token "not-a-real-token")))))

(deftest two-step-login-e2e-test
  (testing "the full two-step login flow over the HTTP API"
    (mt/with-temporary-setting-values [mfa-enabled true]
      (let [user-id (mt/user->id :rasta)
            secret  (totp/generate-secret)]
        (try
          ;; enroll rasta in TOTP (confirmed)
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    "totp"
                                           :credentials {:secret secret :confirmed_at (t/instant)}})
          (testing "step 1: password login returns an MFA challenge, not a session"
            (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))]
              (is (true? (:mfa_required resp)))
              (is (= "totp" (:method resp)))
              (is (string? (:mfa_token resp)))
              (is (nil? (:id resp)) "no session id is issued yet")
              (testing "step 2: verifying a valid code yields a real session"
                (is (=? {:id string?}
                        (mt/client :post 200 "session/mfa"
                                   {:mfa_token (:mfa_token resp) :code (totp/generate-code secret)}))))))
          (testing "a wrong code is rejected with a 401"
            (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))
                  cur  (totp/generate-code secret)
                  bad  (if (= cur "000000") "111111" "000000")]
              (mt/client :post 401 "session/mfa" {:mfa_token (:mfa_token resp) :code bad})))
          (finally
            (t2/delete! :model/AuthIdentity :user_id user-id :provider "totp")))))))
