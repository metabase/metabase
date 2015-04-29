(ns metabase.email.messages-test
  (:require [expectations :refer :all]
            [metabase.email.messages :refer :all]))

;; new user email
(expect
  (str "<html><body><p>Welcome to Metabase test!</p>"
    "<p>Your account is setup and ready to go, you just need to set a password so you can login.  "
    "Follow the link below to reset your account password.</p>"
    "<p><a href=\"http://localhost/some/url\">http://localhost/some/url</a></p></body></html>")
  (send-new-user-email "test" "test@test.com" "http://localhost/some/url"))

;; password reset email
(expect
  (str "<html><body><p>You're receiving this e-mail because you or someone else has requested a password for your user account at test.domain.com. "
    "It can be safely ignored if you did not request a password reset. Click the link below to reset your password.</p>"
    "<p><a href=\"http://localhost/some/url\">http://localhost/some/url</a></p></body></html>")
  (send-password-reset-email "test@test.com" "test.domain.com" "http://localhost/some/url"))
