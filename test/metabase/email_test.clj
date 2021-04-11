(ns metabase.email-test
  "Various helper functions for testing email functionality."
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.email :as email]
            [metabase.test.data.users :as user]
            [metabase.test.util :as tu]
            [metabase.util :refer [prog1]]
            [postal.message :as message])
  (:import java.io.File
           javax.activation.MimeType))

;; TODO - this should be made dynamic so it's (at least theoretically) possible to use this in parallel
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

(defn do-with-expected-messages
  "Invokes `thunk`, blocking until `n` messages are found in the inbox."
  [n thunk]
  {:pre [(number? n)]}
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
      (let [result        (thunk)
            ;; This will block the calling thread (i.e. the test) waiting for the promise to be delivered. There is a
            ;; very high timeout (30 seconds) that we should never reach, but without it, if we do hit that scenario, it
            ;; should at least not hang forever in CI
            promise-value (deref p 30000 ::timeout)]
        (if (= promise-value ::timeout)
          (throw (Exception. "Timed out while waiting for messages in the inbox"))
          result))
      (finally
        (remove-watch inbox ::inbox-watcher)))))

(defmacro with-expected-messages
  "Invokes `body`, waiting until `n` messages are found in the inbox before returning. This is useful if the code you
  are testing sends emails via a future or background thread. Using this will block the test, waiting for the messages
  to arrive before continuing."
  [n & body]
  `(do-with-expected-messages ~n (fn [] ~@body)))

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
   and `email-smtp-password` (which will cause `metabase.email/email-configured?` to return `true`, and execute `body`.

   Fetch the emails send by dereffing `inbox`.

     (with-fake-inbox
       (send-some-emails!)
       @inbox)"
  [& body]
  {:style/indent 0}
  `(do-with-fake-inbox (fn [] ~@body)))

(defn- create-email-body->regex-fn
  "Returns a function expecting the email body structure. It will apply the regexes in `regex-seq` over the body and
  return map of the stringified regex as the key and a boolean as the value. True if it returns results via `re-find`
  false otherwise."
  [regex-seq]
  (fn [message-body]
    (let [{:keys [content]} message-body]
      (zipmap (map str regex-seq)
              (map #(boolean (re-find % content)) regex-seq)))))

(defn regex-email-bodies
  "Return messages in the fake inbox whose body matches the regex(es). The body will be replaced by a map with the
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
                                        (doall
                                         (for [{email-type :type :as email-part} email-body-seq]
                                           (if (string? email-type)
                                             (email-body->regex-boolean email-part)
                                             (summarize-attachment email-part)))))))))
                @inbox)))

(defn email-to
  "Creates a default email map for `user-kwd` via `user/fetch-user`, as would be returned by `with-fake-inbox`"
  [user-kwd & [email-map]]
  (let [{:keys [email]} (user/fetch-user user-kwd)]
    {email [(merge {:from (email/email-from-address)
                    :to #{email}}
                    email-map)]}))

(defn temp-csv
  [file-basename content]
  (prog1 (File/createTempFile file-basename ".csv")
    (with-open [file (io/writer <>)]
      (.write ^java.io.Writer file ^String content))))

(defn mock-send-email!
  "To stub out email sending, instead returning the would-be email contents as a string"
  [smtp-credentials email-details]
  (-> email-details
      message/make-jmessage
      message/message->str))

(deftest send-message!-test
  (tu/with-temporary-setting-values [email-from-address "lucky@metabase.com"
                                     email-smtp-host    "smtp.metabase.com"
                                     email-smtp-username "lucky"
                                     email-smtp-password "d1nner3scapee!"
                                     email-smtp-port     "1025"
                                     email-smtp-security "none"]
    (testing "basic sending"
      (is (=
           [{:from    (email/email-from-address)
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
             (@inbox "test@test.com")))))
    (testing "with an attachment"
      (let [recipient    "csv_user@example.com"
            csv-contents "hugs_with_metabase,hugs_without_metabase\n1,0"
            csv-file     (temp-csv "metabase-reasons" csv-contents)
            params       {:subject      "101 Reasons to use Metabase"
                          :recipients   [recipient]
                          :message-type :attachments
                          :message      [{:type "text/html; charset=utf-8"
                                          :content "100. Metabase will hug you when you're sad"}
                                         {:type :attachment
                                          :content-type "text/csv"
                                          :file-name "metabase-reasons.csv"
                                          :content csv-file
                                          :description "very scientific data"}]}]
        (testing "it sends successfully"
          (is (=
               [{:from    (email/email-from-address)
                 :to      [recipient]
                 :subject "101 Reasons to use Metabase"
                 :body    [{:type    "text/html; charset=utf-8"
                            :content "100. Metabase will hug you when you're sad"}
                           {:type         :attachment
                            :content-type "text/csv"
                            :file-name    "metabase-reasons.csv"
                            :content      csv-file
                            :description  "very scientific data"}]}]
               (with-fake-inbox
                 (m/mapply email/send-message! params)
                 (@inbox recipient)))))
        (testing "it does not wrap long, non-ASCII filenames"
          (with-redefs [email/send-email! mock-send-email!]
            (let [basename                     "this-is-quite-long-and-has-non-Âſçïı-characters"
                  csv-file                     (temp-csv basename csv-contents)
                  params-with-problematic-file (-> params
                                                   (assoc-in [:message 1 :file-name] (str basename ".csv"))
                                                   (assoc-in [:message 1 :content] csv-file))]
              ;; Bad string (ignore the linebreak):
              ;; Content-Disposition: attachment; filename="=?UTF-8?Q?this-is-quite-long-and-ha?= =?UTF-8?Q?s-non-
              ;; =C3=82\"; filename*1=\"=C5=BF=C3=A7=C3=AF=C4=B1-characters.csv?="
              ;;           ^-- this is the problem
              ;; Acceptable string (again, ignore the linebreak):
              ;; Content-Disposition: attachment; filename= "=?UTF-8?Q?this-is-quite-long-and-ha?=
              ;; =?UTF-8?Q?s-non-=C3=82=C5=BF=C3=A7=C3=AF=C4=B1-characters.csv?="

              (is (re-find
                   #"(?s)Content-Disposition: attachment.+filename=.+this-is-quite-[\-\s?=0-9a-zA-Z]+-characters.csv"
                   (m/mapply email/send-message! params-with-problematic-file))))))))))
