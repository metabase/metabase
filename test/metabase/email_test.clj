(ns metabase.email-test
  "Various helper functions for testing email functionality."
  ;; TODO - Move to something like `metabase.test.util.email`?
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.email :as email]
            [metabase.test.data.users :as user]
            [metabase.test.util :as tu])
  (:import javax.activation.MimeType))

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

(defn call-with-expected-messages
  "Invokes `F`, blocking until `N` messages are found in the inbox"
  [n f]
  (let [p (promise)]
    ;; Watches get invoked on the callers thread. In our case, this will be the future (or background thread) that is
    ;; sending the message. It will block that thread, counting the number of messages. If it has reached it's goal,
    ;; it will deliver the promise
    (add-watch inbox ::inbox-watcher
               (fn [_ _ _ new-value]
                 (let [num-msgs (count (apply concat (vals new-value)))]
                   (when (<= n num-msgs)
                     (deliver p num-msgs)))))
    (try
      (let [result (f)
            ;; This will block the calling thread (i.e. the test) waiting for the promise to be delivered. There is a
            ;; very high timeout (1 minute) that we should never reach, but without it, if we do hit that scenario, it
            ;; should at least not hang forever in CI
            promise-value (deref p 60000 ::timeout)]
        (if (= promise-value ::timeout)
          (throw (Exception. "Timed out while waiting for messages in the inbox"))
          result))
      (finally
        (remove-watch inbox ::inbox-watcher)))))

(defmacro with-expected-messages
  "Invokes `BODY`, waiting until `N` messages are found in the inbox before returning. This is useful if the code you
  are testing sends emails via a future or background thread. Using this will block the test, waiting for the messages
  to arrive before continuing."
  [n & body]
  `(call-with-expected-messages ~n (fn [] ~@body)))

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

(defn- create-email-body->regex-fn
  "Returns a function expecting the email body structure. It will apply the regexes in `REGEX-SEQ` over the body and
  return map of the stringified regex as the key and a boolean as the value. True if it returns results via `re-find`
  false otherwise."
  [regex-seq]
  (fn [message-body]
    (let [{:keys [content]} message-body]
      (zipmap (map str regex-seq)
              (map #(boolean (re-find % content)) regex-seq)))))

(defn regex-email-bodies
  "Will be apply each regex to each email body in the fake inbox. The body will be replaced by a map with the
  stringified regex as it's key and a boolean indicated that the regex returned results."
  [& regexes]
  (let [email-body->regex-boolean (create-email-body->regex-fn regexes)]
    (m/map-vals (fn [emails-for-recipient]
                  (for [email emails-for-recipient]
                    (-> email
                        (update :to set)
                        (update :body (comp email-body->regex-boolean first)))))
                @inbox)))

(defn- mime-type [mime-type-str]
  (-> mime-type-str
      MimeType.
      .getBaseType))

(defn- summarize-attachment [email-attachment]
  (-> email-attachment
      (update :content-type mime-type)
      (update :content class)
      (update :content-id boolean)))

(defn summarize-multipart-email
  "For text/html portions of an email, this is similar to `regex-email-bodies`, but for images in the attachments will
  summarize the contents for comparison in expects"
  [& regexes]
  (let [email-body->regex-boolean (create-email-body->regex-fn regexes)]
    (m/map-vals (fn [emails-for-recipient]
                  (for [email emails-for-recipient]
                    (-> email
                        (update :to set)
                        (update :body (fn [email-body-seq]
                                        (for [{email-type :type :as email-part}  email-body-seq]
                                          (if (string? email-type)
                                            (email-body->regex-boolean email-part)
                                            (summarize-attachment email-part))))))))
                @inbox)))

(defn email-to
  "Creates a default email map for `USER-KWD` via `user/fetch-user`, as would be returned by `with-fake-inbox`"
  [user-kwd & [email-map]]
  (let [{:keys [email]} (user/fetch-user user-kwd)]
    {email [(merge {:from "notifications@metabase.com",
                    :to #{email}}
                    email-map)]}))

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
