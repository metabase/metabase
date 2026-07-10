(ns metabase-enterprise.mfa.enrollment-flow-test
  "End-to-end enrollment lifecycle over the HTTP API."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.mfa.management :as mfa.management]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.sso.core :as sso]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- reset-throttlers []
  (doseq [throttler (vals @#'mfa.management/throttlers)]
    (reset! (:attempts throttler) nil)))

(use-fixtures :each (fn [f] (reset-throttlers) (f)))

(defn- wrong-code [secret]
  (let [current (totp/generate-code secret)]
    (if (= current "000000") "111111" "000000")))

(defmacro ^:private with-fresh-user-session!
  "Temp password user + a real session from a normal (not-yet-enrolled) login."
  [[session-binding email-binding password-binding] & body]
  `(let [~password-binding (str "Pw-" (random-uuid))]
     (mt/with-temp [:model/User {~'_user-id :id, ~email-binding :email} {:password ~password-binding}]
       (let [~session-binding (:id (mt/client :post 200 "session" {:username ~email-binding
                                                                   :password ~password-binding}))]
         ~@body))))

(deftest full-enrollment-lifecycle-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (with-fresh-user-session! [session-key email password]
        (testing "enroll requires the right password — 400 with a field error, NOT 401 (clients
                  treat a 401 on a session-authenticated endpoint as an expired session)"
          (is (=? {:errors {:password some?}}
                  (mt/client session-key :post 400 "ee/mfa/enroll" {:password "not-the-password"}))))
        (let [{:keys [secret otpauth_uri]} (mt/client session-key :post 200 "ee/mfa/enroll" {:password password})]
          (is (re-find #"^otpauth://totp/" otpauth_uri))
          (testing "a wrong code does not confirm"
            (mt/client session-key :post 400 "ee/mfa/enroll/confirm" {:code (wrong-code secret)}))
          (let [{:keys [recovery_codes]} (mt/client session-key :post 200 "ee/mfa/enroll/confirm"
                                                    {:code (totp/generate-code secret)})]
            (is (= 10 (count recovery_codes)))
            (testing "status reflects the confirmed enrollment"
              (is (=? {:enrolled true, :method "totp", :pending false, :recovery_codes_remaining 10}
                      (mt/client session-key :get 200 "ee/mfa/status"))))
            (testing "re-enrolling over a confirmed enrollment is rejected"
              (mt/client session-key :post 400 "ee/mfa/enroll" {:password password}))
            (testing "the next login is challenged"
              (is (true? (:mfa_required (mt/client :post 200 "session" {:username email :password password})))))
            (testing "disable works with a recovery code even with zero premium features (lapse escape hatch)"
              (mt/with-premium-features #{}
                (mt/client session-key :post 204 "ee/mfa/disable" {:code (first recovery_codes)})))
            (testing "after disable, login issues a session directly again"
              (is (string? (:id (mt/client :post 200 "session" {:username email :password password})))))))))))

(deftest enrollment-lifecycle-is-audited-test
  ;; audit rows are written only when the :audit-app feature is active AT EVENT TIME
  ;; (premium-features/log-enabled?), so this runs the whole lifecycle with it on
  (mt/with-premium-features #{:multi-factor-auth :audit-app}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (with-fresh-user-session! [session-key email password]
        (let [{:keys [secret]}         (mt/client session-key :post 200 "ee/mfa/enroll" {:password password})
              {:keys [recovery_codes]} (mt/client session-key :post 200 "ee/mfa/enroll/confirm"
                                                  {:code (totp/generate-code secret)})
              user-id                  (t2/select-one-fn :id :model/User :email email)]
          (testing "enrollment is audited"
            (is (=? {:topic :mfa-enrolled}
                    (mt/latest-audit-log-entry :mfa-enrolled user-id))))
          (mt/client session-key :post 204 "ee/mfa/disable" {:code (first recovery_codes)})
          (testing "self-disable is audited"
            (is (=? {:topic :mfa-disabled}
                    (mt/latest-audit-log-entry :mfa-disabled user-id)))))))))

(deftest enroll-requires-feature-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (with-fresh-user-session! [session-key _email password]
        (testing "starting an enrollment is setup — gated on the feature"
          (mt/with-premium-features #{}
            (mt/client session-key :post 402 "ee/mfa/enroll" {:password password})))))))

(deftest enroll-requires-setting-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (with-fresh-user-session! [session-key _email password]
        (mt/client session-key :post 400 "ee/mfa/enroll" {:password password})))))

(deftest ldap-users-re-auth-by-bind-test
  (testing "verify-user-password falls through to an LDAP bind for users with no password identity"
    (mt/with-temp [:model/User {user-id :id, email :email} {}]
      ;; temp users get a password identity; simulate an LDAP-only user by proving dispatch order:
      ;; when the local hash fails, the LDAP branch decides.
      (mt/with-dynamic-fn-redefs [sso/ldap-enabled    (constantly true)
                                  sso/find-user       (fn [username] (when (= username email) {:dn "uid=x"}))
                                  ;; simulate a directory that accepts anonymous (empty-password) binds
                                  sso/verify-password (fn [_user-info password]
                                                        (or (= password "directory-pw") (empty? password)))]
        (is (true? (#'mfa.management/verify-user-password user-id "directory-pw")))
        (is (false? (#'mfa.management/verify-user-password user-id "wrong")))
        (testing "blank passwords never reach the bind — an empty bind is an anonymous bind"
          (is (false? (#'mfa.management/verify-user-password user-id "")))
          (is (false? (#'mfa.management/verify-user-password user-id "   ")))
          (is (false? (#'mfa.management/verify-user-password user-id nil))))))))

(deftest status-requires-session-test
  (testing "GET /status without a session → 401 (the management block is behind +auth)"
    (is (= "Unauthenticated" (mt/client :get 401 "ee/mfa/status")))))

(deftest pending-re-enroll-overwrites-secret-test
  (testing "re-enrolling while pending generates a new secret; the OLD pending secret no longer confirms"
    (mt/with-premium-features #{:multi-factor-auth}
      (mt/with-temporary-setting-values [mfa-enforcement :optional]
        (with-fresh-user-session! [session-key _email password]
          (let [{:keys [secret]} (mt/client session-key :post 200 "ee/mfa/enroll" {:password password})
                {secret2 :secret} (mt/client session-key :post 200 "ee/mfa/enroll" {:password password})]
            (is (not= secret secret2) "a fresh secret is issued on each re-enroll")
            (testing "a code from the FIRST (discarded) secret is rejected at confirm"
              (mt/client session-key :post 400 "ee/mfa/enroll/confirm" {:code (totp/generate-code secret)}))
            (testing "confirming with the SECOND secret succeeds"
              (is (= 10 (count (:recovery_codes (mt/client session-key :post 200 "ee/mfa/enroll/confirm"
                                                           {:code (totp/generate-code secret2)}))))))))))))

(deftest confirm-code-cannot-replay-to-disable-test
  (testing "the code consumed by confirm-enrollment cannot then be used to disable (cross-operation replay)"
    (mt/with-premium-features #{:multi-factor-auth}
      (mt/with-temporary-setting-values [mfa-enforcement :optional]
        (with-fresh-user-session! [session-key _email password]
          (let [{:keys [secret]} (mt/client session-key :post 200 "ee/mfa/enroll" {:password password})
                code             (totp/generate-code secret)]
            ;; confirm consumes `code`'s time step
            (mt/client session-key :post 200 "ee/mfa/enroll/confirm" {:code code})
            (testing "the same code is rejected at disable — the time step was already consumed"
              (is (= "Invalid authentication code."
                     (mt/client session-key :post 400 "ee/mfa/disable" {:code code}))))))))))

(deftest disable-throttled-test
  (testing "repeated wrong codes on /disable are throttled — 6-digit codes need brute-force limits"
    (mt/with-premium-features #{:multi-factor-auth}
      (mt/with-temporary-setting-values [mfa-enforcement :optional]
        (with-fresh-user-session! [session-key _email password]
          (let [{:keys [secret]} (mt/client session-key :post 200 "ee/mfa/enroll" {:password password})]
            (mt/client session-key :post 200 "ee/mfa/enroll/confirm" {:code (totp/generate-code secret)})
            (dotimes [_ 5]
              (mt/client session-key :post 400 "ee/mfa/disable" {:code (wrong-code secret)}))
            (let [resp (mt/client session-key :post 400 "ee/mfa/disable" {:code (wrong-code secret)})]
              (is (re-find #"Too many attempts!" (str resp))))))))))
