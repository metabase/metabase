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

;; email report
(expect
  (str "<html><head></head>"
       "<body style=\"font-family: Helvetica Neue, Helvetica, sans-serif; width: 100%; margin: 0 auto; max-width: 800px; font-size: 12px;\">"
       "<div class=\"wrapper\" style=\"padding: 10px; background-color: #ffffff;\">"
       "<table style=\"border: 1px solid #cccccc; width: 100%; border-collapse: collapse;\">"
       "<tr style=\"background-color: #f4f4f4;\">"
       "<td style=\"text-align: left; padding: 0.5em; border: 1px solid #ddd; font-size: 12px;\">first</td>"
       "<td style=\"text-align: left; padding: 0.5em; border: 1px solid #ddd; font-size: 12px;\">second</td>"
       "</tr>"
       "<tr>"
       "<td style=\"border: 1px solid #ddd; padding: 0.5em;\">N/A</td>"
       "<td style=\"border: 1px solid #ddd; padding: 0.5em;\">N/A</td>"
       "</tr>"
       "<tr>"
       "<td style=\"border: 1px solid #ddd; padding: 0.5em;\">abc</td>"
       "<td style=\"border: 1px solid #ddd; padding: 0.5em;\">def</td>"
       "</tr>"
       "<tr>"
       "<td style=\"border: 1px solid #ddd; padding: 0.5em;\">1,000</td>"
       "<td style=\"border: 1px solid #ddd; padding: 0.5em;\">17.45</td>"
       "</tr>"
       "</table>"
       "</div>"
       "</body>"
       "</html>")
  (send-email-report "My Email Report" ["test.domain.com"] {:data {:columns ["first" "second"]
                                                                   :rows [[nil nil]
                                                                          ["abc" "def"]
                                                                          [1000 17.45234]]}}))
