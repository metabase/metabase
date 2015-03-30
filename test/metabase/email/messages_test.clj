(ns metabase.email.messages-test
  (:require [expectations :refer :all]
            [metabase.email.messages :refer :all]))


(expect
  (str "<html><body><p>Welcome to Metabase test!</p>"
    "<p>Your account is setup and ready to go, you just need to set a password so you can login.  "
    "Follow the link below to reset your account password.</p>"
    "<p><a href=\"http://localhost/some/url\">http://localhost/some/url</a></p></body></html>")
  (send-new-user-email "test" "test@test.com" "http://localhost/some/url"))
