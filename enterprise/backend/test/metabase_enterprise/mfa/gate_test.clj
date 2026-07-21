(ns metabase-enterprise.mfa.gate-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.settings :as mfa.settings]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.auth-identity.provider :as auth-identity.provider]
   [metabase.test :as mt]))

(defn- with-enrolled-user! [f]
  (mt/with-temp [:model/User        {user-id :id} {}
                 :model/AuthIdentity _ {:user_id     user-id
                                        :provider    "totp"
                                        :confirmed_at (t/instant)
                                        :credentials  {:secret (totp/generate-secret)}}]
    (f user-id)))

(deftest gate-is-no-op-when-disabled-test
  (testing "with mfa-enforcement :off (the default on a fresh instance) every result passes through untouched"
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (with-enrolled-user!
        (fn [user-id]
          (doseq [result [{:success? true :user {:id user-id}}
                          {:success? false :error :invalid-credentials}]]
            (is (= result (auth-identity.provider/apply-mfa-gate :provider/password result)))))))))

(deftest gate-challenges-enrolled-users-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (with-enrolled-user!
        (fn [user-id]
          (testing "password and LDAP first factors get a challenge instead of a session"
            (doseq [provider [:provider/password :provider/ldap]]
              (let [gated (auth-identity.provider/apply-mfa-gate provider {:success? true :user {:id user-id}})]
                (is (= :mfa-required (:success? gated)))
                (is (true? (:mfa/pending? gated)))
                (is (some #{"totp"} (:mfa/methods gated)))
                (is (= provider (:mfa/first-factor gated))))))
          (testing "an unenrolled user is untouched"
            (mt/with-temp [:model/User {other-id :id} {}]
              (let [result {:success? true :user {:id other-id}}]
                (is (= result (auth-identity.provider/apply-mfa-gate :provider/password result)))))))))))

(deftest gate-enforces-after-license-lapse-test
  (testing "fail-closed: an enrolled user is still challenged when the token reports no features at all"
    (mt/with-premium-features #{:multi-factor-auth}
      (mt/with-temporary-setting-values [mfa-enforcement :optional]
        (with-enrolled-user!
          (fn [user-id]
            (mt/with-premium-features #{}
              (let [gated (auth-identity.provider/apply-mfa-gate :provider/password {:success? true :user {:id user-id}})]
                (is (= :mfa-required (:success? gated)))
                (is (= :provider/password (:mfa/first-factor gated)))))))))))

(deftest gate-provider-coverage-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (with-enrolled-user!
        (fn [user-id]
          (let [result {:success? true :user {:id user-id}}]
            (testing "SSO providers are never gated — their IdP owns MFA"
              (is (= result (auth-identity.provider/apply-mfa-gate :provider/google result))))
            (testing "support-access-grant is deliberately exempt (admin-granted, time-boxed, audited)"
              (is (= result (auth-identity.provider/apply-mfa-gate :provider/support-access-grant result))))
            (testing "password reset completes but is marked pending so no session is issued"
              (let [gated (auth-identity.provider/apply-mfa-gate :provider/emailed-secret-password-reset result)]
                (is (true? (:success? gated)))
                (is (true? (:mfa/pending? gated)))
                (is (nil? (:mfa/first-factor gated)))))))))))

(deftest gate-sso-provider-matrix-test
  (testing "every SSO provider is exempt for an enrolled user — the IdP owns MFA there"
    (mt/with-premium-features #{:multi-factor-auth}
      (mt/with-temporary-setting-values [mfa-enforcement :optional]
        (with-enrolled-user!
          (fn [user-id]
            (let [result {:success? true :user {:id user-id}}]
              (doseq [provider [:provider/google
                                :provider/saml
                                :provider/jwt
                                :provider/oidc
                                :provider/custom-oidc
                                :provider/slack-connect]]
                (testing provider
                  (is (= result (auth-identity.provider/apply-mfa-gate provider result))))))))))))

(deftest gate-provider-registry-exhaustiveness-test
  ;; The gate's fall-through branch is exempt, so a provider nobody classified silently bypasses
  ;; MFA. This test forces the decision: every provider in the auth-identity hierarchy must appear
  ;; below. If you added a provider and landed here, decide its MFA posture — challenged providers
  ;; also go in `metabase-enterprise.mfa.gate/challenged-providers`, session-suppressed ones in
  ;; `session-suppressed-providers`; exemption is the default and needs only this map.
  (let [classification {:provider/password                      :challenged
                        :provider/ldap                          :challenged
                        :provider/emailed-secret-password-reset :session-suppressed
                        ;; IdP owns MFA for SSO logins
                        :provider/google                        :exempt
                        :provider/saml                          :exempt
                        :provider/jwt                           :exempt
                        :provider/oidc                          :exempt
                        :provider/custom-oidc                   :exempt
                        :provider/slack-connect                 :exempt
                        ;; admin-granted, time-boxed, audited; staff can't hold the second factor
                        :provider/support-access-grant          :exempt
                        ;; abstract parent (reset/verification/magic links) — a concrete login
                        ;; child must be classified here on its own when it ships
                        :provider/emailed-secret                :exempt
                        ;; the second factor itself, never a first factor
                        :provider/totp                          :exempt}]
    (testing "every registered provider has a deliberate MFA classification"
      (is (= (set (keys classification))
             (set (descendants :metabase.auth-identity.provider/provider)))))
    (testing "the gate's behavior matches each classification for an enrolled user"
      (mt/with-premium-features #{:multi-factor-auth}
        (mt/with-temporary-setting-values [mfa-enforcement :optional]
          (with-enrolled-user!
            (fn [user-id]
              (let [result {:success? true :user {:id user-id}}]
                (doseq [[provider posture] classification]
                  (testing provider
                    (let [gated (auth-identity.provider/apply-mfa-gate provider result)]
                      (case posture
                        :challenged         (is (= :mfa-required (:success? gated)))
                        :session-suppressed (do (is (true? (:success? gated)))
                                                (is (true? (:mfa/pending? gated))))
                        :exempt             (is (= result gated))))))))))))))

(deftest gate-env-var-escape-hatch-test
  ;; The last-admin lockout recovery: the only superuser loses authenticator + recovery codes, so
  ;; nobody can log in to flip the setting. Restarting with MB_MFA_ENFORCEMENT=off must win over
  ;; the :optional stored in the DB and let them in single-step.
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (with-enrolled-user!
        (fn [user-id]
          (let [result {:success? true :user {:id user-id}}]
            (is (= :mfa-required
                   (:success? (auth-identity.provider/apply-mfa-gate :provider/password result)))
                "sanity: challenged before the override")
            (mt/with-temp-env-var-value! [mb-mfa-enforcement "off"]
              (is (false? (mfa.settings/mfa-enabled?))
                  "the env var beats the DB value")
              (is (= result (auth-identity.provider/apply-mfa-gate :provider/password result))
                  "the gate no-ops, so the locked-out admin can log in"))))))))

(deftest mfa-enforcement-write-path-test
  (mt/with-temporary-setting-values [mfa-enforcement :off]
    (testing "enabling (:optional) requires the :multi-factor-auth feature (setup is gated; enforcement is not)"
      (mt/with-premium-features #{}
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"[Mm]ulti-factor"
                              (mfa.settings/mfa-enforcement! :optional)))
        (is (= :off (mfa.settings/mfa-enforcement)))))
    (testing "enabling works with the feature"
      (mt/with-premium-features #{:multi-factor-auth}
        (mfa.settings/mfa-enforcement! :optional)
        (is (= :optional (mfa.settings/mfa-enforcement)))))
    (testing "setting :off never requires the feature — the lapsed-license escape hatch"
      (mt/with-premium-features #{}
        (mfa.settings/mfa-enforcement! :off)
        (is (= :off (mfa.settings/mfa-enforcement)))))
    (testing "setting :required is rejected even with the feature — reserved for a future release"
      (mt/with-premium-features #{:multi-factor-auth}
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"reserved"
                              (mfa.settings/mfa-enforcement! :required)))))))
