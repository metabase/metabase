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
     (let [orig-hostname# (email/email-smtp-host)]
       (email/email-smtp-host "fake_smtp_host")
       (try ~@body
            (finally (email/email-smtp-host orig-hostname#))))))

;; new user email
;; NOTE: we are not validating the content of the email body namely because it's got randomized elements and thus
;;       it would be extremely hard to have a predictable test that we can rely on
(expect
    [{:from "notifications@metabase.com",
      :to ["test@test.com"],
      :subject "You're invited to join Metabase Test's Metabase",
      :body [{:type "text/html; charset=utf-8"}]}]
  (with-fake-inbox
    (send-new-user-email {:first_name "test" :email "test@test.com"}
                         {:first_name "invitor" :email "invited_by@test.com"}
                         "http://localhost/some/url")
    (-> (@inbox "test@test.com")
        (update-in [0 :body 0] dissoc :content))))

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
