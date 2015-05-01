(ns metabase.email.messages-test
  (:require [expectations :refer :all]
            [metabase.email :as email]
            [metabase.email.messages :refer :all]))

(def ^:private inbox
  "Map of email addresses -> sequence of messages they've recieved."
  (atom {}))

(defn- reset-inbox!
  "Clear all messages from `inbox`."
  []
  (reset! inbox {}))

(defn- fake-inbox-email-fn
  "A function that can be used in place of `*send-email-fn*`.
   Put all messages into `inbox` instead of actually sending them."
  [_ email]
  (doseq [recipient (:to email)]
    (swap! inbox assoc recipient (-> (get @inbox recipient [])
                                     (conj email)))))

(defmacro with-fake-inbox
  "Clear `inbox`, bind `*send-email-fn*` to `fake-inbox-email-fn`, set temporary settings for `email-smtp-username`
   and `email-smtp-password`, and execute BODY."
  [& body]
  `(binding [email/*send-email-fn* fake-inbox-email-fn]
     (reset-inbox!)
     ;; Push some fake settings for SMTP username + password, and restore originals when done
     (let [orig-username# (email/email-smtp-username)
           orig-password# (email/email-smtp-password)]
       (email/email-smtp-username "fake_smtp_username")
       (email/email-smtp-password "ABCD1234!!")
       (try ~@body
            (finally (email/email-smtp-username orig-username#)
                     (email/email-smtp-password orig-password#))))))

;; new user email
(expect
    [{:from "notifications@metabase.com",
      :to ["test@test.com"],
      :subject "Your new Metabase account is all set up",
      :body [{:type "text/html; charset=utf-8",
              :content (str "<html><body><p>Welcome to Metabase test!</p>"
                            "<p>Your account is setup and ready to go, you just need to set a password so you can login.  "
                            "Follow the link below to reset your account password.</p>"
                            "<p><a href=\"http://localhost/some/url\">http://localhost/some/url</a></p></body></html>")}]}]
  (with-fake-inbox
    (send-new-user-email "test" "test@test.com" "http://localhost/some/url")
    (@inbox "test@test.com")))

;; password reset email
(expect
    [{:from "notifications@metabase.com",
      :to ["test@test.com"],
      :subject "[Metabase] Password Reset Request",
      :body [{:type "text/html; charset=utf-8",
              :content (str "<html><body><p>You're receiving this e-mail because you or someone else has requested a password for your user account at test.domain.com. "
                            "It can be safely ignored if you did not request a password reset. Click the link below to reset your password.</p>"
                            "<p><a href=\"http://localhost/some/url\">http://localhost/some/url</a></p></body></html>")}]}]
  (with-fake-inbox
    (send-password-reset-email "test@test.com" "test.domain.com" "http://localhost/some/url")
    (@inbox "test@test.com")))
