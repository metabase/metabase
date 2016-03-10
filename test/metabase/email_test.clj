(ns metabase.email-test
  (:require [expectations :refer :all]
            [metabase.email :as email]))

(def inbox
  "Map of email addresses -> sequence of messages they've received."
  (atom {}))

(defn reset-inbox!
  "Clear all messages from `inbox`."
  []
  (reset! inbox {}))

(defn fake-inbox-email-fn
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
     (let [orig-hostname# (email/email-smtp-host)
           orig-port#     (email/email-smtp-port)]
       (email/email-smtp-host "fake_smtp_host")
       (email/email-smtp-port "587")
       (try ~@body
            (finally (email/email-smtp-host orig-hostname#)
                     (email/email-smtp-port orig-port#))))))

;; simple test of email sending capabilities
(expect
  [{:from "notifications@metabase.com",
    :to ["test@test.com"],
    :subject "101 Reasons to use Metabase",
    :body [{:type    "text/html; charset=utf-8"
            :content "101. Metabase will make you a better person"}]}]
  (with-fake-inbox
    (email/send-message
      :subject      "101 Reasons to use Metabase"
      :recipients   ["test@test.com"]
      :message-type :html
      :message      "101. Metabase will make you a better person")
    (@inbox "test@test.com")))
