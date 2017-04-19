(ns metabase.email-test
  "Various helper functions for testing email functionality."
  ;; TODO - Move to something like `metabase.test.util.email`?
  (:require [expectations :refer :all]
            [metabase.email :as email]
            [metabase.test.util :as tu]))

(def inbox
  "Map of email addresses -> sequence of messages they've received."
  (atom {}))

(defn reset-inbox!
  "Clear all messages from `inbox`."
  []
  (reset! inbox {}))

(defn fake-inbox-email-fn
  "A function that can be used in place of `send-email!`.
   Put all messages into `inbox` instead of actually sending them."
  [_ email]
  (doseq [recipient (:to email)]
    (swap! inbox assoc recipient (-> (get @inbox recipient [])
                                     (conj email)))))

(defn do-with-fake-inbox
  "Impl for `with-fake-inbox` macro; prefer using that rather than calling this directly."
  [f]
  (with-redefs [metabase.email/send-email! fake-inbox-email-fn]
    (reset-inbox!)
    (tu/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                       email-smtp-port "587"]
      (f))))

(defmacro with-fake-inbox
  "Clear `inbox`, bind `send-email!` to `fake-inbox-email-fn`, set temporary settings for `email-smtp-username`
   and `email-smtp-password` (which will cause `metabase.email/email-configured?` to return `true`, and execute BODY.

   Fetch the emails send by dereffing `inbox`.

     (with-fake-inbox
       (send-some-emails!)
       @inbox)"
  [& body]
  {:style/indent 0}
  `(do-with-fake-inbox (fn [] ~@body)))


;; simple test of email sending capabilities
(expect
  [{:from    "notifications@metabase.com"
    :to      ["test@test.com"]
    :subject "101 Reasons to use Metabase"
    :body    [{:type    "text/html; charset=utf-8"
               :content "101. Metabase will make you a better person"}]}]
  (with-fake-inbox
    (email/send-message!
      :subject      "101 Reasons to use Metabase"
      :recipients   ["test@test.com"]
      :message-type :html
      :message      "101. Metabase will make you a better person")
    (@inbox "test@test.com")))
