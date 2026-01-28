(ns metabase.channel.email.internal-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-keys.core :as api-key]
   [metabase.channel.email :as email]
   [metabase.channel.email-test :as et]
   [metabase.channel.email.internal :as messages]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util.retry :as retry]
   [metabase.util.retry-test :as rt]))

(set! *warn-on-reflection* true)

(deftest password-reset-email
  (testing "password reset email can be sent successfully"
    (et/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" nil "http://localhost/some/url" true)
      (is (= [{:from    "notifications@metabase.com",
               :to      ["test@test.com"],
               :subject "[Metabase] Password Reset Request",
               :body    [{:type "text/html; charset=utf-8"}]}]
             (-> (@et/inbox "test@test.com")
                 (update-in [0 :body 0] dissoc :content))))))
  ;; Email contents contain randomized elements, so we only check for the inclusion of a single word to verify
  ;; that the contents changed in the tests below.
  (testing "password reset email tells user if they should log in with Google Sign-In"
    (et/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" :google "http://localhost/some/url" true)
      (is (-> (@et/inbox "test@test.com")
              (get-in [0 :body 0 :content])
              (str/includes? "Google")))))
  (testing "password reset email tells user if they should log in with (non-Google) SSO"
    (et/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" :saml nil true)
      (is (-> (@et/inbox "test@test.com")
              (get-in [0 :body 0 :content])
              (str/includes? "SSO")))))
  (testing "password reset email tells user if their account is inactive"
    (et/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" nil "http://localhost/some/url" false)
      (is (-> (@et/inbox "test@test.com")
              (get-in [0 :body 0 :content])
              (str/includes? "deactivated"))))))

#_(deftest render-pulse-email-test
    (testing "Email with few rows and columns can be rendered when tracing (#21166)"
      (mt/with-log-level [metabase.channel.email :trace]
        (let [part {:card   {:id   1
                             :name "card-name"
                             :visualization_settings
                             {:table.column_formatting []}}
                    :result {:data {:cols [{:name "x"} {:name "y"}]
                                    :rows [[0 0]
                                           [1 1]]}}
                    :type :card}
              emails (messages/render-pulse-email "America/Pacific" {} {} [part] nil)]
          (is (vector? emails))
          (is (map? (first emails)))))))

(def test-email {:subject      "Test email subject"
                 :recipients   ["test@test.com"]
                 :message-type :html
                 :message      "test mmail body"})

(deftest send-email-retrying-test
  (testing "send email succeeds w/o retry"
    (let [[hook state] (rt/retry-analytics-config-hook)]
      (binding [retry/*test-time-config-hook* hook]
        (with-redefs [email/send-email! mt/fake-inbox-email-fn]
          (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                             email-smtp-port 587]
            (mt/reset-inbox!)
            (email/send-email-retrying! test-email)
            (is (= {:success true, :retries 0} @state))
            (is (= 1 (count @mt/inbox))))))))
  (testing "send email fails b/c retry limit"
    (let [[hook state] (rt/retry-analytics-config-hook {:max-retries 1})]
      (binding [retry/*test-time-config-hook* hook]
        (with-redefs [email/send-email! (tu/works-after 2 mt/fake-inbox-email-fn)]
          (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                             email-smtp-port 587]
            (mt/reset-inbox!)
            (try (#'email/send-email-retrying! test-email)
                 (catch Exception _))
            (is (= {:success false, :retries 1} @state))
            (is (= 0 (count @mt/inbox))))))))
  (testing "send email succeeds w/ retry"
    (let [[hook state] (rt/retry-analytics-config-hook {:max-retries 1})]
      (binding [retry/*test-time-config-hook* hook]
        (with-redefs [email/send-email! (tu/works-after 1 mt/fake-inbox-email-fn)]
          (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                             email-smtp-port 587]
            (mt/reset-inbox!)
            (#'email/send-email-retrying! test-email)
            (is (= {:success true, :retries 1} @state))
            (is (= 1 (count @mt/inbox)))))))))

(deftest all-admin-recipients
  (mt/with-temp [:model/ApiKey _ {::api-key/unhashed-key (api-key/generate-key)
                                  :name                  "Test API key"
                                  :user_id               (mt/user->id :crowberto)
                                  :creator_id            (mt/user->id :crowberto)
                                  :updated_by_id         (mt/user->id :crowberto)}]
    (testing "all-admin-recipients returns all admin emails"
      (let [emails (#'messages/all-admin-recipients)]
        (is (some #(= % "crowberto@metabase.com") emails))
        (is (not (some #(str/starts-with? % "api-key-user") emails)))))))
