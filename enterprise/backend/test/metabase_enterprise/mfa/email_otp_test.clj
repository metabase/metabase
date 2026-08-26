(ns metabase-enterprise.mfa.email-otp-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mfa.totp :as totp]
   [metabase-enterprise.mfa.verification :as verification]
   [metabase.channel.email :as channel.email]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.template.core :as channel.template]
   [metabase.session.api :as api.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- reset-throttlers []
  (doseq [throttler (concat (vals @#'api.session/verify-throttlers)
                            (vals @#'api.session/login-throttlers)
                            (vals @#'api.session/email-otp-send-throttlers))]
    (reset! (:attempts throttler) nil)))

(use-fixtures :each (fn [f] (reset-throttlers) (f)))

(defn- fresh-jti [] (str (random-uuid)))

(deftest email-otp-round-trip-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :confirmed_at (t/instant)
                                          :credentials  {:secret secret}}]
      (let [code (verification/set-email-otp! user-id)]
        (is (re-matches #"\d{6}" code))
        (is (true? (verification/verify-attempt! user-id code (fresh-jti))))
        (testing "single-use"
          (is (false? (verification/verify-attempt! user-id code (fresh-jti)))))))))

(deftest successful-verify-clears-pending-email-otp-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/AuthIdentity _ {:user_id     user-id
                                          :provider    "totp"
                                          :confirmed_at (t/instant)
                                          :credentials  {:secret secret}}]
      (let [email-code (verification/set-email-otp! user-id)]
        (is (true? (verification/verify-attempt! user-id (totp/generate-code secret) (fresh-jti))))
        (testing "a successful TOTP verification kills the pending emailed code for its whole TTL"
          (is (false? (verification/verify-attempt! user-id email-code (fresh-jti)))))))))

(deftest email-otp-requires-confirmed-enrollment-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/AuthIdentity _ {:user_id     user-id
                                        :provider    "totp"
                                        :credentials {:secret (totp/generate-secret)}}]
    (is (nil? (verification/set-email-otp! user-id)))))

(deftest expired-email-otp-rejected-test
  (let [secret (totp/generate-secret)]
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/AuthIdentity {ai-id :id} {:user_id     user-id
                                                    :provider    "totp"
                                                    :confirmed_at (t/instant)
                                                    :credentials  {:secret secret}}]
      (let [code (verification/set-email-otp! user-id)]
        ;; back-date the expiry
        (let [ai (t2/select-one :model/AuthIdentity :id ai-id)]
          (t2/update! :model/AuthIdentity ai-id
                      {:credentials (assoc-in (:credentials ai) [:email_otp :exp]
                                              (dec (quot (System/currentTimeMillis) 1000)))}))
        (is (false? (verification/verify-attempt! user-id code (fresh-jti))))))))

(deftest send-email-otp-e2e-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (let [secret (totp/generate-secret)
            sent   (atom nil)]
        (t2/insert! :model/AuthIdentity {:user_id     (mt/user->id :rasta)
                                         :provider    "totp"
                                         :confirmed_at (t/instant)
                                         :credentials  {:secret secret}})
        (try
          (mt/with-dynamic-fn-redefs [channel.settings/email-configured?    (constantly true)
                                      channel.email/send-message-or-throw! (fn [msg] (reset! sent msg) msg)]
            (let [challenge (mt/client :post 200 "session" (mt/user->credentials :rasta))]
              (testing "the challenge advertises the email method when email is configured"
                (is (= ["totp" "email"] (:methods challenge))))
              (is (true? (:success (mt/client :post 200 "session/mfa/send-email-otp"
                                              {:challenge_token (:challenge_token challenge)}))))
              (let [[_ code] (re-find #"(?s)sign-in code.*?(\d{6})" (:message @sent))]
                (is (some? code) "the email contains the code")
                (testing "the emailed code completes the login"
                  (is (=? {:id string?}
                          (mt/client :post 200 "session/mfa/verify"
                                     {:challenge_token (:challenge_token challenge) :code code}))))
                (testing "a consumed challenge token cannot keep sending codes"
                  (mt/client :post 401 "session/mfa/send-email-otp" {:challenge_token (:challenge_token challenge)})))))
          (testing "a bogus challenge token cannot trigger a send"
            (mt/client :post 401 "session/mfa/send-email-otp" {:challenge_token "bogus"}))
          (finally
            (t2/delete! :model/AuthIdentity :user_id (mt/user->id :rasta) :provider "totp")))))))

(deftest send-email-otp-surfaces-delivery-failure-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (let [secret (totp/generate-secret)]
        (t2/insert! :model/AuthIdentity {:user_id     (mt/user->id :rasta)
                                         :provider    "totp"
                                         :confirmed_at (t/instant)
                                         :credentials  {:secret secret}})
        (try
          (mt/with-dynamic-fn-redefs [channel.settings/email-configured?    (constantly true)
                                      channel.email/send-message-or-throw! (fn [& _]
                                                                             (throw (Exception. "SMTP down")))]
            (let [challenge (mt/client :post 200 "session" (mt/user->credentials :rasta))]
              (testing "an SMTP failure is an error, not {:success true} with no email"
                (mt/client :post 500 "session/mfa/send-email-otp" {:challenge_token (:challenge_token challenge)}))))
          (finally
            (t2/delete! :model/AuthIdentity :user_id (mt/user->id :rasta) :provider "totp")))))))

(deftest send-email-otp-requires-configured-email-test
  (mt/with-premium-features #{:multi-factor-auth}
    (mt/with-temporary-setting-values [mfa-enforcement :optional]
      (let [secret (totp/generate-secret)]
        (t2/insert! :model/AuthIdentity {:user_id     (mt/user->id :rasta)
                                         :provider    "totp"
                                         :confirmed_at (t/instant)
                                         :credentials  {:secret secret}})
        (try
          (mt/with-dynamic-fn-redefs [channel.settings/email-configured? (constantly false)]
            (let [challenge (mt/client :post 200 "session" (mt/user->credentials :rasta))]
              (testing "the challenge does not advertise email"
                (is (= ["totp"] (:methods challenge))))
              (mt/client :post 400 "session/mfa/send-email-otp" {:challenge_token (:challenge_token challenge)})))
          (finally
            (t2/delete! :model/AuthIdentity :user_id (mt/user->id :rasta) :provider "totp")))))))

(deftest mfa-email-templates-render-test
  (testing "all four MFA email templates render without error and contain their key sentences"
    (testing "mfa_enabled template"
      (let [html (channel.template/render "mfa_enabled" {:applicationName "Metabase"
                                                         :siteUrl         "http://localhost:3000"
                                                         :logoHeader      false})]
        (is (string? html))
        (is (str/includes? html "Two-factor authentication is now required"))))
    (testing "mfa_disabled template"
      (let [html (channel.template/render "mfa_disabled" {:applicationName "Metabase"
                                                          :siteUrl         "http://localhost:3000"
                                                          :logoHeader      false})]
        (is (string? html))
        (is (str/includes? html "using a verification code"))))
    (testing "mfa_removed_by_admin template"
      (let [html (channel.template/render "mfa_removed_by_admin" {:applicationName "Metabase"
                                                                  :siteUrl         "http://localhost:3000"
                                                                  :logoHeader      false})]
        (is (string? html))
        (is (str/includes? html "administrator removed two-factor authentication"))))
    (testing "mfa_login_code template"
      (let [html (channel.template/render "mfa_login_code" {:applicationName "Metabase"
                                                            :siteUrl         "http://localhost:3000"
                                                            :logoHeader      false
                                                            :code            "123456"})]
        (is (string? html))
        (is (re-find #"(?s)sign-in code.*?(\d{6})" html))))))
