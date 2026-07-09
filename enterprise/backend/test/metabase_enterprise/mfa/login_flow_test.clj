(ns metabase-enterprise.mfa.login-flow-test
  "End-to-end two-step login over the HTTP API."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.api :as mfa.api]
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase-enterprise.mfa.management :as mfa.management]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.session.api :as api.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- reset-throttlers! []
  (doseq [throttler (concat (vals @#'mfa.api/verify-throttlers)
                            (vals @#'mfa.management/throttlers)
                            (vals @#'api.session/login-throttlers)
                            [@#'api.session/reset-password-throttler])]
    (reset! (:attempts throttler) nil)))

(use-fixtures :each (fn [f] (reset-throttlers!) (f)))

(defn- wrong-code [secret]
  (let [current (totp/generate-code secret)]
    (if (= current "000000") "111111" "000000")))

(defmacro with-enrolled-rasta! [[secret-binding] & body]
  `(mt/with-premium-features #{:multi-factor-auth}
     (mt/with-temporary-setting-values [~'mfa-enabled true]
       (let [~secret-binding (totp/generate-secret)]
         (try
           (t2/insert! :model/AuthIdentity {:user_id     (mt/user->id :rasta)
                                            :provider    "totp"
                                            :credentials {:secret       ~secret-binding
                                                          :confirmed_at (t/instant)}})
           ~@body
           (finally
             (t2/delete! :model/AuthIdentity :user_id (mt/user->id :rasta) :provider "totp")))))))

(deftest two-step-login-test
  (with-enrolled-rasta! [secret]
    (testing "step 1: password login returns an MFA challenge, not a session"
      (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))]
        (is (true? (:mfa_required resp)))
        (is (= "totp" (:method resp)))
        (is (string? (:mfa_token resp)))
        (is (nil? (:id resp)) "no session id is issued yet")
        (testing "step 2: verifying a valid code yields a real session"
          (is (=? {:id string?}
                  (mt/client :post 200 "ee/mfa/verify"
                             {:mfa_token (:mfa_token resp) :code (totp/generate-code secret)}))))
        (testing "the consumed challenge token cannot mint a second session (jti + step replay)"
          (mt/client :post 401 "ee/mfa/verify"
                     {:mfa_token (:mfa_token resp) :code (totp/generate-code secret)}))))))

(deftest wrong-code-rejected-test
  (with-enrolled-rasta! [secret]
    (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))]
      (mt/client :post 401 "ee/mfa/verify" {:mfa_token (:mfa_token resp) :code (wrong-code secret)})
      (testing "a failed code does not invalidate the challenge token — retry with the right one"
        (is (=? {:id string?}
                (mt/client :post 200 "ee/mfa/verify"
                           {:mfa_token (:mfa_token resp) :code (totp/generate-code secret)})))))))

(deftest bogus-token-rejected-test
  (mt/client :post 401 "ee/mfa/verify" {:mfa_token "not-a-real-token" :code "000000"}))

(deftest remember-me-survives-mfa-test
  (with-enrolled-rasta! [secret]
    (testing "'remember me' from step 1 must ride the verify request — that's what creates the session"
      (let [challenge (mt/client :post 200 "session" (assoc (mt/user->credentials :rasta) :remember true))
            response  (mt/client-real-response :post 200 "ee/mfa/verify"
                                               {:mfa_token (:mfa_token challenge)
                                                :code      (totp/generate-code secret)
                                                :remember  true})]
        (is (get-in response [:cookies request/metabase-session-cookie :expires])
            "remember=true on /verify sets a permanent cookie")))
    (testing "without remember, the cookie is session-scoped"
      ;; the first verify consumed the current time step; use the +1 step (inside the ±1
      ;; validation window, strictly greater than the consumed step) so replay protection passes
      (let [challenge (mt/client :post 200 "session" (mt/user->credentials :rasta))
            code      (totp/code-for-unix-time secret (+ (quot (System/currentTimeMillis) 1000) 30))
            response  (mt/client-real-response :post 200 "ee/mfa/verify"
                                               {:mfa_token (:mfa_token challenge)
                                                :code      code})]
        (is (nil? (get-in response [:cookies request/metabase-session-cookie :expires])))))))

(deftest deactivated-user-cannot-verify-test
  (with-enrolled-rasta! [secret]
    (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))]
      (t2/update! :model/User (mt/user->id :rasta) {:is_active false})
      (try
        (testing "a challenge token does not outlive the account: deactivated mid-challenge gets the same 401 as a bad token"
          (mt/client :post 401 "ee/mfa/verify"
                     {:mfa_token (:mfa_token resp) :code (totp/generate-code secret)}))
        (finally
          (t2/update! :model/User (mt/user->id :rasta) {:is_active true}))))))

(deftest successful-verify-does-not-count-toward-throttle-test
  (with-enrolled-rasta! [secret]
    (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))]
      (is (=? {:id string?}
              (mt/client :post 200 "ee/mfa/verify"
                         {:mfa_token (:mfa_token resp) :code (totp/generate-code secret)})))
      (testing "only failures count — a busy legitimate user is never throttled by their own logins"
        (is (empty? @(:attempts (@#'mfa.api/verify-throttlers :user-id))))))))

(deftest verify-throttled-test
  (with-enrolled-rasta! [secret]
    (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))]
      (testing "6-digit codes need brute-force limits: repeated failures throttle the user"
        (dotimes [_ 5]
          (mt/client :post 401 "ee/mfa/verify" {:mfa_token (:mfa_token resp) :code (wrong-code secret)}))
        (let [resp' (mt/client :post 400 "ee/mfa/verify" {:mfa_token (:mfa_token resp) :code (wrong-code secret)})]
          (is (re-find #"Too many attempts!" (str resp'))))))))

(deftest enforcement-survives-license-lapse-test
  (with-enrolled-rasta! [secret]
    (mt/with-premium-features #{}
      (testing "an enrolled user is still challenged, and can still complete verification, with no token features"
        (let [resp (mt/client :post 200 "session" (mt/user->credentials :rasta))]
          (is (true? (:mfa_required resp)))
          (is (=? {:id string?}
                  (mt/client :post 200 "ee/mfa/verify"
                             {:mfa_token (:mfa_token resp) :code (totp/generate-code secret)}))))))))

(deftest recovery-code-login-test
  (with-enrolled-rasta! [_secret]
    (let [[code & _] (enrollment/reset-recovery-codes! (mt/user->id :rasta))
          resp       (mt/client :post 200 "session" (mt/user->credentials :rasta))]
      (testing "a recovery code completes the two-step login in place of a TOTP code"
        (is (=? {:id string?}
                (mt/client :post 200 "ee/mfa/verify" {:mfa_token (:mfa_token resp) :code code}))))
      (testing "single-use: the same recovery code is dead afterwards"
        (let [resp' (mt/client :post 200 "session" (mt/user->credentials :rasta))]
          (mt/client :post 401 "ee/mfa/verify" {:mfa_token (:mfa_token resp') :code code}))))))

(deftest regenerate-recovery-codes-endpoint-test
  (with-enrolled-rasta! [secret]
    (let [user-id           (mt/user->id :rasta)
          [c1 & _]          (enrollment/reset-recovery-codes! user-id)
          login             (mt/client :post 200 "session" (mt/user->credentials :rasta))
          {session-key :id} (mt/client :post 200 "ee/mfa/verify" {:mfa_token (:mfa_token login)
                                                                  :code      (totp/generate-code secret)})]
      (testing "requires a session"
        (mt/client :post 401 "ee/mfa/recovery-codes" {:code c1}))
      (testing "requires a fresh second factor, not just the session"
        (mt/client session-key :post 401 "ee/mfa/recovery-codes" {:code "000000"}))
      (testing "an unused recovery code re-auths; the whole old set is then invalid"
        (let [resp (mt/client session-key :post 200 "ee/mfa/recovery-codes" {:code c1})]
          (is (= 10 (count (:codes resp))))
          (is (false? (enrollment/verify-attempt! user-id c1 nil))
              "the re-auth code was consumed with the rest of the old set"))))))

(deftest password-reset-issues-no-session-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enabled true]
      (mt/with-temp [:model/User {user-id :id, email :email} {:password (str "Old-" (random-uuid))}]
        (try
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    "totp"
                                           :credentials {:secret       (totp/generate-secret)
                                                         :confirmed_at (t/instant)}})
          (let [new-password (str "New-" (random-uuid))
                resp         (mt/client :post 200 "session/reset_password"
                                        {:token    (auth-identity/create-password-reset! user-id)
                                         :password new-password})]
            (testing "the password change succeeds but no session is issued — the user logs in through the gate"
              (is (true? (:success resp)))
              (is (nil? (:session_id resp))))
            (testing "the new password works through the normal, gated login"
              (let [login (mt/client :post 200 "session" {:username email :password new-password})]
                (is (true? (:mfa_required login))))))
          (finally
            (t2/delete! :model/AuthIdentity :user_id user-id :provider "totp")))))))
