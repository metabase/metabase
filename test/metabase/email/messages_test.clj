(ns metabase.email.messages-test
  (:require [expectations :refer [expect]]
            [metabase.email-test :as email-test]
            [metabase.email.messages :as messages]
            [metabase.test.util :as tu])
  (:import java.io.IOException))

;; new user email
;; NOTE: we are not validating the content of the email body namely because it's got randomized elements and thus
;;       it would be extremely hard to have a predictable test that we can rely on
(expect
  [{:from    "notifications@metabase.com",
    :to      ["test@test.com"],
    :subject "You're invited to join Metabase Test's Metabase",
    :body    [{:type "text/html; charset=utf-8"}]}]
  (tu/with-temporary-setting-values [site-name "Metabase Test"]
    (email-test/with-fake-inbox
      (messages/send-new-user-email! {:first_name "test" :email "test@test.com"}
                                     {:first_name "invitor" :email "invited_by@test.com"}
                                     "http://localhost/some/url")
      (-> (@email-test/inbox "test@test.com")
          (update-in [0 :body 0] dissoc :content)))))

;; password reset email
(expect
  [{:from    "notifications@metabase.com",
    :to      ["test@test.com"],
    :subject "[Metabase] Password Reset Request",
    :body    [{:type "text/html; charset=utf-8"}]}]
  (email-test/with-fake-inbox
    (messages/send-password-reset-email! "test@test.com" (not :google-auth) "test.domain.com" "http://localhost/some/url")
    (-> (@email-test/inbox "test@test.com")
        (update-in [0 :body 0] dissoc :content))))

(defmacro ^:private with-create-temp-failure [& body]
  `(with-redefs [messages/create-temp-file (fn [~'_]
                                             (throw (IOException. "Failed to write file")))]
     ~@body))

;; Test that IOException bubbles up
(expect
  IOException
  (with-create-temp-failure
    (#'messages/create-temp-file-or-throw "txt")))

;; When we fail to create the temp file, include the directory in the error message
(expect
  (re-pattern (format "Unable to create temp file in `%s`" (System/getProperty "java.io.tmpdir")))
  (try
    (with-create-temp-failure
      (#'messages/create-temp-file-or-throw "txt"))
    (catch Exception e
      (.getMessage e))))
