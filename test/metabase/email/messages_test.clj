(ns metabase.email.messages-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.email :as email]
   [metabase.email-test :as et]
   [metabase.email.messages :as messages]
   [metabase.test :as mt]
   [metabase.test.util :as tu])
  (:import
   (java.io IOException)))

(set! *warn-on-reflection* true)

(deftest new-user-email
  (is (= [{:from    "notifications@metabase.com",
           :to      ["test@test.com"],
           :subject "You're invited to join Metabase Test's Metabase",
           :body    [{:type "text/html; charset=utf-8"}]}]
         (tu/with-temporary-setting-values [site-name "Metabase Test"]
           (et/with-fake-inbox
             (messages/send-new-user-email! {:first_name "test" :email "test@test.com"}
                                            {:first_name "invitor" :email "invited_by@test.com"}
                                            "http://localhost/some/url"
                                            false)
             (-> (@et/inbox "test@test.com")
                 (update-in [0 :body 0] dissoc :content)))))))

(deftest password-reset-email
  (testing "password reset email can be sent successfully"
    (et/with-fake-inbox
      (#'messages/send-password-reset-email! "test@test.com" nil "http://localhost/some/url" true)
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
      (messages/send-password-reset-email! "test@test.com" "google" "http://localhost/some/url" true)
      (is (-> (@et/inbox "test@test.com")
              (get-in [0 :body 0 :content])
              (str/includes? "Google")))))
  (testing "password reset email tells user if they should log in with (non-Google) SSO"
    (et/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" "SAML" nil true)
      (is (-> (@et/inbox "test@test.com")
              (get-in [0 :body 0 :content])
              (str/includes? "SSO")))))
  (testing "password reset email tells user if their account is inactive"
    (et/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" nil "http://localhost/some/url" false)
      (is (-> (@et/inbox "test@test.com")
              (get-in [0 :body 0 :content])
              (str/includes? "deactivated"))))))

(defmacro ^:private with-create-temp-failure [& body]
  `(with-redefs [messages/create-temp-file (fn [~'_]
                                             (throw (IOException. "Failed to write file")))]
     ~@body))

;; Test that IOException bubbles up
(deftest throws-exception
  (is (thrown-with-msg?
        IOException
        (re-pattern (format "Unable to create temp file in `%s`" (System/getProperty "java.io.tmpdir")))
        (with-create-temp-failure
          (#'messages/create-temp-file-or-throw "txt")))))

(deftest alert-schedule-text-test
  (testing "Alert schedules can be described as English strings, with the timezone included"
    (tu/with-temporary-setting-values [report-timezone "America/Pacific"]
      (is (= "Run hourly"
             (@#'messages/alert-schedule-text {:schedule_type :hourly})))
      (is (= "Run daily at 12 AM America/Pacific"
             (@#'messages/alert-schedule-text {:schedule_type :daily
                                               :schedule_hour 0})))
      (is (= "Run daily at 5 AM America/Pacific"
             (@#'messages/alert-schedule-text {:schedule_type :daily
                                               :schedule_hour 5})))
      (is (= "Run daily at 6 PM America/Pacific"
             (@#'messages/alert-schedule-text {:schedule_type :daily
                                               :schedule_hour 18})))
      (is (= "Run weekly on Monday at 8 AM America/Pacific"
             (@#'messages/alert-schedule-text {:schedule_type :weekly
                                               :schedule_day  "mon"
                                               :schedule_hour 8})))))
  (testing "If report-timezone is not set, falls back to UTC"
    (tu/with-temporary-setting-values [report-timezone nil]
      (is (= "Run daily at 12 AM UTC"
             (@#'messages/alert-schedule-text {:schedule_type :daily
                                               :schedule_hour 0}))))))

(deftest render-pulse-email-test
  (testing "Email with few rows and columns can be rendered when tracing (#21166)"
    (mt/with-log-level [metabase.email :trace]
      (let [part {:card   {:name "card-name"
                           :visualization_settings
                           {:table.column_formatting []}}
                  :result {:data {:cols [{:name "x"} {:name "y"}]
                                  :rows [[0 0]
                                         [1 1]]}}
                  :type :card}
            emails (messages/render-pulse-email "America/Pacific" {} {} [part] nil)]
        (is (vector? emails))
        (is (map? (first emails)))))))

(defn- get-retry-metrics []
  (let [^io.github.resilience4j.retry.Retry retry (:retry @@#'email/retry-state)]
    (bean (.getMetrics retry))))

(defn- pos-metrics [m]
  (into {}
        (map (fn [field]
               (let [d (m field)]
                 (when (pos? d)
                   [field d]))))
        [:numberOfFailedCallsWithRetryAttempt
         :numberOfFailedCallsWithoutRetryAttempt
         :numberOfSuccessfulCallsWithRetryAttempt
         :numberOfSuccessfulCallsWithoutRetryAttempt]))

(defn- reset-retry []
  (let [old (get-retry-metrics)]
    (#'email/reconfigure-retrying nil nil)
    old))

(def test-email {:subject      "Test email subject"
                 :recipients   ["test@test.com"]
                 :message-type :html
                 :message      "test mmail body"})

(deftest email-retry-test
  (testing "send email succeeds w/o retry"
    (with-redefs [email/send-email! mt/fake-inbox-email-fn]
      (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                         email-smtp-port 587]
        (mt/reset-inbox!)
        (#'email/reconfigure-retrying nil nil)
        (reset-retry)
        (#'email/send-email-retrying! test-email)
        (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
               (pos-metrics (reset-retry))))
        (is (= 1 (count @mt/inbox))))))
  (testing "send email fails b/c retry limit"
    (with-redefs [email/send-email! (tu/works-after 1 mt/fake-inbox-email-fn)]
      (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                         email-smtp-port 587]
        (mt/reset-inbox!)
        (reset-retry)
        (#'email/send-email-retrying! test-email)
        (is (= {:numberOfFailedCallsWithRetryAttempt 1}
               (pos-metrics (reset-retry))))
        (is (= 0 (count @mt/inbox))))))
  (testing "send email succeeds w/ retry"
    (let [retry-config (#'email/retry-configuration)]
      (try
        (with-redefs [email/send-email! (tu/works-after 1 mt/fake-inbox-email-fn)
                      email/retry-configuration (constantly (assoc retry-config
                                                                   :max-attempts 2
                                                                   :initial-interval-millis 1))]
          (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                             email-smtp-port 587]
            (mt/reset-inbox!)
            (reset-retry)
            (#'email/send-email-retrying! test-email)
            (is (= {:numberOfSuccessfulCallsWithRetryAttempt 1}
                   (pos-metrics (reset-retry))))
            (is (= 1 (count @mt/inbox)))))
        (finally
          (reset-retry))))))
