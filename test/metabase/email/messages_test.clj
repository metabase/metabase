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
    (email-test/do-with-fake-inbox
     (fn []
       (messages/send-password-reset-email! "test@test.com" false "test.domain.com" "http://localhost/some/url" true)
       (is (= [{:from    "notifications@metabase.com",
                :to      ["test@test.com"],
                :subject "[Metabase] Password Reset Request",
                :body    [{:type "text/html; charset=utf-8"}]}]
              (-> (@email-test/inbox "test@test.com")
                  (update-in [0 :body 0] dissoc :content)))))))
  ;; Email contents contain randomized elements, so we only check for the inclusion of a single word to verify
  ;; that the contents changed in the tests below.
  (testing "password reset email tells user if they should log in with Google Sign-In"
    (email-test/do-with-fake-inbox
     (fn []
       (messages/send-password-reset-email! "test@test.com" true "test.domain.com" "http://localhost/some/url" true)
       (is (-> (@email-test/inbox "test@test.com")
               (get-in [0 :body 0 :content])
               (str/includes? "Google"))))))
  (testing "password reset email tells user if their account is inactive"
    (email-test/do-with-fake-inbox
     (fn []
       (messages/send-password-reset-email! "test@test.com" false "test.domain.com" "http://localhost/some/url" false)
       (is (-> (@email-test/inbox "test@test.com")
               (get-in [0 :body 0 :content])
               (str/includes? "deactivated")))))))

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
