(ns metabase.email.messages-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.email-test :as email-test]
            [metabase.email.messages :as messages]
            [metabase.test.util :as tu])
  (:import java.io.IOException))

(deftest new-user-email
  (is (= [{:from    "notifications@metabase.com",
           :to      ["test@test.com"],
           :subject "You're invited to join Metabase Test's Metabase",
           :body    [{:type "text/html; charset=utf-8"}]}]
         (tu/with-temporary-setting-values [site-name "Metabase Test"]
           (email-test/with-fake-inbox
             (messages/send-new-user-email! {:first_name "test" :email "test@test.com"}
                                            {:first_name "invitor" :email "invited_by@test.com"}
                                            "http://localhost/some/url")
             (-> (@email-test/inbox "test@test.com")
                 (update-in [0 :body 0] dissoc :content)))))))

(deftest password-reset-email
  (testing "password reset email can be sent successfully"
    (email-test/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" false "test.domain.com" "http://localhost/some/url" true)
      (is (= [{:from    "notifications@metabase.com",
               :to      ["test@test.com"],
               :subject "[Metabase] Password Reset Request",
               :body    [{:type "text/html; charset=utf-8"}]}]
             (-> (@email-test/inbox "test@test.com")
                 (update-in [0 :body 0] dissoc :content))))))
  ;; Email contents contain randomized elements, so we only check for the inclusion of a single word to verify
  ;; that the contents changed in the tests below.
  (testing "password reset email tells user if they should log in with Google Sign-In"
    (email-test/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" true "test.domain.com" "http://localhost/some/url" true)
      (is (-> (@email-test/inbox "test@test.com")
              (get-in [0 :body 0 :content])
              (str/includes? "Google")))))
  (testing "password reset email tells user if their account is inactive"
    (email-test/with-fake-inbox
      (messages/send-password-reset-email! "test@test.com" false "test.domain.com" "http://localhost/some/url" false)
      (is (-> (@email-test/inbox "test@test.com")
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
