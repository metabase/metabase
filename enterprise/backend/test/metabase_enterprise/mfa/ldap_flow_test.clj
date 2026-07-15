(ns metabase-enterprise.mfa.ldap-flow-test
  "MFA against a real (in-memory UnboundID) LDAP directory: the gate challenges LDAP first factors,
  and LDAP-only users enroll by re-authenticating with their *directory* password. Fixtures live in
  test_resources/ldap.ldif (Sally Brown: mail sally.brown@metabase.com / password 1234)."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.management :as mfa.management]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase.session.api :as api.session]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- reset-throttlers []
  (doseq [throttler (concat (vals @#'api.session/verify-throttlers)
                            (vals @#'api.session/login-throttlers))]
    (reset! (:attempts throttler) nil)))

(use-fixtures :each (fn [f] (reset-throttlers) (f)))

(def ^:private sally-email "sally.brown@metabase.com")
(def ^:private sally-directory-password "1234")

(deftest ldap-login-is-challenged-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (ldap.test/with-ldap-server!
        ;; provision Sally by logging in once, then enroll her
        (let [_       (mt/client :post 200 "session" {:username sally-email
                                                      :password sally-directory-password})
              user-id (t2/select-one-fn :id :model/User :email sally-email)
              secret  (totp/generate-secret)]
          (try
            (t2/insert! :model/AuthIdentity {:user_id     user-id
                                             :provider    "totp"
                                             :confirmed_at (t/instant)
                                             :credentials  {:secret secret}})
            (testing "an enrolled user's LDAP login gets a challenge, not a session"
              (let [resp (mt/client :post 200 "session" {:username sally-email
                                                         :password sally-directory-password})]
                (is (true? (:mfa_required resp)))
                (is (nil? (:id resp)) "no session until the second factor")
                (testing "the code completes the login"
                  (is (=? {:id string?}
                          (mt/client :post 200 "session/mfa/verify"
                                     {:challenge_token (:challenge_token resp)
                                      :code            (totp/generate-code secret)}))))))
            (finally
              (t2/delete! :model/AuthIdentity :user_id user-id :provider "totp"))))))))

(deftest ldap-enroll-rejects-blank-password-test
  ;; An empty (or whitespace) password sent to ldap/bind? is an *anonymous* bind, which succeeds on
  ;; permissive directories — and the in-memory UnboundID server is one. verify-user-password must
  ;; reject blank passwords itself, before the bind, so this attack can never re-auth. Tested at two
  ;; layers: the endpoint schema, and the helper that owns the invariant (a future caller inherits
  ;; the guard only if it lives in the helper, not the schema).
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (ldap.test/with-ldap-server!
        (let [{session-key :id} (mt/client :post 200 "session" {:username sally-email
                                                                :password sally-directory-password})
              user-id           (t2/select-one-fn :id :model/User :email sally-email)]
          (testing "the helper rejects blank passwords rather than letting an anonymous bind pass"
            (is (false? (#'mfa.management/verify-user-password user-id "")))
            (is (false? (#'mfa.management/verify-user-password user-id "   ")))
            (is (false? (#'mfa.management/verify-user-password user-id nil)))
            (is (true?  (#'mfa.management/verify-user-password user-id sally-directory-password))
                "sanity: a real directory password still binds"))
          (testing "the enroll endpoint's schema also refuses a blank password"
            (mt/client session-key :post 400 "ee/mfa/enroll" {:password ""})))))))

(deftest ldap-only-user-enrolls-with-directory-password-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (ldap.test/with-ldap-server!
        (let [{session-key :id} (mt/client :post 200 "session" {:username sally-email
                                                                :password sally-directory-password})
              user-id           (t2/select-one-fn :id :model/User :email sally-email)]
          (try
            ;; provisioned users get a random local password they never know, so a successful
            ;; enroll with the directory password proves the LDAP-bind branch, not the local hash
            (testing "enroll re-auths by binding against the directory"
              (is (=? {:errors {:password some?}}
                      (mt/client session-key :post 400 "ee/mfa/enroll" {:password "not-her-directory-pw"})))
              (let [{:keys [secret]} (mt/client session-key :post 200 "ee/mfa/enroll"
                                                {:password sally-directory-password})]
                (is (= 10 (count (:recovery_codes
                                  (mt/client session-key :post 200 "ee/mfa/enroll/confirm"
                                             {:code (totp/generate-code secret)})))))))
            (finally
              (t2/delete! :model/AuthIdentity :user_id user-id :provider "totp"))))))))
