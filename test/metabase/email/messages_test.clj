(ns metabase.email.messages-test
  (:require [expectations :refer :all]
            [metabase.email-test :refer [inbox with-fake-inbox]]
            [metabase.email.messages :refer [send-new-user-email! send-password-reset-email!]]))

;; new user email
;; NOTE: we are not validating the content of the email body namely because it's got randomized elements and thus
;;       it would be extremely hard to have a predictable test that we can rely on
(expect
  [{:from    "notifications@metabase.com",
    :to      ["test@test.com"],
    :subject "You're invited to join Metabase Test's Metabase",
    :body    [{:type "text/html; charset=utf-8"}]}]
  (with-fake-inbox
    (send-new-user-email! {:first_name "test" :email "test@test.com"}
                          {:first_name "invitor" :email "invited_by@test.com"}
                          "http://localhost/some/url")
    (-> (@inbox "test@test.com")
        (update-in [0 :body 0] dissoc :content))))

;; password reset email
(expect
  [{:from    "notifications@metabase.com",
    :to      ["test@test.com"],
    :subject "[Metabase] Password Reset Request",
    :body    [{:type "text/html; charset=utf-8"}]}]
  (with-fake-inbox
    (send-password-reset-email! "test@test.com" (not :google-auth) "test.domain.com" "http://localhost/some/url")
    (-> (@inbox "test@test.com")
        (update-in [0 :body 0] dissoc :content))))
