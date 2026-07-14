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
