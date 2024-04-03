(ns metabase.email-test
  "Various helper functions for testing email functionality."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.email :as email]
   [metabase.test.data.users :as test.users]
   [metabase.test.util :as tu]
   [metabase.util :as u :refer [prog1]]
   [metabase.util.retry :as retry]
   [metabase.util.retry-test :as rt]
   [postal.message :as message])
  (:import
   (java.io File)
   (javax.activation MimeType)))

(set! *warn-on-reflection* true)

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
  (doseq [recipient (concat (:to email) (:bcc email))]
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
               (fn [_key _ref _old-value new-value]
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
  (with-redefs [email/send-email! fake-inbox-email-fn]
    (reset-inbox!)
    (tu/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                       email-smtp-port 587]
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

(defn- regex-email-bodies*
  [regexes emails]
  (let [email-body->regex-boolean (create-email-body->regex-fn regexes)]
    (->> emails
         (m/map-vals (fn [emails-for-recipient]
                       (for [{:keys [body] :as email} emails-for-recipient
                             :let [matches (-> body first email-body->regex-boolean)]
                             :when (some true? (vals matches))]
                         (cond-> email
                             (:to email)  (update :to set)
                             (:bcc email) (update :bcc set)
                             true         (assoc :body matches)))))
         (m/filter-vals seq))))

(defn regex-email-bodies
  "Return messages in the fake inbox whose body matches the regex(es). The body will be replaced by a map with the
  stringified regex as it's key and a boolean indicated that the regex returned results."
  [& regexes]
  (regex-email-bodies* regexes @inbox))

(defn received-email-subject?
  "Indicate whether a user received an email whose subject matches the `regex`. First argument should be a keyword
  like :rasta, or an email address string."
  [user-or-email regex]
  (let [address (if (string? user-or-email) user-or-email (:username (test.users/user->credentials user-or-email)))
        emails  (get @inbox address)]
    (boolean (some #(re-find regex %) (map :subject emails)))))

(defn received-email-body?
  "Indicate whether a user received an email whose body matches the `regex`. First argument should be a keyword
  like :rasta, or an email address string."
  [user-or-email regex]
  (let [address (if (string? user-or-email) user-or-email (:username (test.users/user->credentials user-or-email)))
        emails  (get @inbox address)]
    (boolean (some #(re-find regex %) (map (comp :content first :body) emails)))))

(deftest regex-email-bodies-test
  (letfn [(email [body] {:to #{"mail"}
                         :body [{:content body}]})
          (clean [emails] (m/map-vals #(map :body %) emails))]
    (testing "marks emails with regex match"
      (let [emails {"bob@metabase.com" [(email "foo bar baz")
                                        (email "other keyword")]
                    "sue@metabase.com" [(email "foo bar baz")]}]
        (is (= {"bob@metabase.com" [{"foo" true "keyword" false} {"foo" false "keyword" true}]
                "sue@metabase.com" [{"foo" true "keyword" false}]}
               (clean (regex-email-bodies* [#"foo" #"keyword"] emails))))))
    (testing "Returns only emails with at least one match"
      ;; drops the email that isn't matched by any regex
      (testing "Drops the email that doesn't match"
        (is (= {"bob@metabase.com" [{"foo" true "keyword" false}]}
               (clean (regex-email-bodies* [#"foo" #"keyword"]
                                           {"bob@metabase.com" [(email "foo")
                                                                (email "no-match")]})))))
      (testing "Drops the entry for the other person with no matching emails"
        (is (= {"bob@metabase.com" [{"foo" true "keyword" false}]}
               (clean (regex-email-bodies* [#"foo" #"keyword"]
                                           {"bob@metabase.com" [(email "foo")
                                                                (email "no-match")]
                                            "sue@metabase.com" [(email "no-match")]}))))
        (is (= {}
               (clean (regex-email-bodies* [#"foo" #"keyword"]
                                           {"bob@metabase.com" [(email "no-match")
                                                                (email "no-match")]
                                            "sue@metabase.com" [(email "no-match")]}))))))))

(defn- mime-type [mime-type-str]
  (-> mime-type-str
      MimeType.
      .getBaseType))

(defn- strip-timestamp
  "Remove the timestamp portion of attachment filenames.
  This is useful for creating stable filename keys in tests.
  For example, see `summarize-attachment` below.

  Eg. test_card_2024-03-05T22:30:24.077306Z.csv -> test_card.csv"
  [fname]
  (let [ext (last (str/split fname #"\."))
        name-parts (butlast (str/split fname #"_"))]
    (format "%s.%s" (str/join "_" name-parts) ext)))

(defn- summarize-attachment [email-attachment]
  (-> email-attachment
      (update :content-type mime-type)
      (update :content class)
      (update :content-id boolean)
      (u/update-if-exists :file-name strip-timestamp)))

(defn summarize-multipart-email
  "For text/html portions of an email, this is similar to `regex-email-bodies`, but for images in the attachments will
  summarize the contents for comparison in expects"
  [& regexes]
  (let [email-body->regex-boolean (create-email-body->regex-fn regexes)]
    (m/map-vals (fn [emails-for-recipient]
                  (for [email emails-for-recipient]
                    (cond-> email
                      (:to email)  (update :to set)
                      (:bcc email) (update :bcc set)
                      true         (update :body (fn [email-body-seq]
                                                   (doall
                                                    (for [{email-type :type :as email-part} email-body-seq]
                                                      (if (string? email-type)
                                                        (email-body->regex-boolean email-part)
                                                        (summarize-attachment email-part)))))))))
                @inbox)))

(defn email-to
  "Creates a default email map for `user-or-user-kwd`, as would be returned by `with-fake-inbox`."
  ([user-or-user-kwd & [email-map]]
   (let [{:keys [email]} (if (keyword? user-or-user-kwd)
                           (test.users/fetch-user user-or-user-kwd)
                           user-or-user-kwd)
         to-type         (if (:bcc? email-map) :bcc :to)
         email-map       (dissoc email-map :bcc?)]
     {email [(merge {:from   (if-let [from-name (email/email-from-name)]
                               (str from-name " <" (email/email-from-address) ">")
                               (email/email-from-address))
                     to-type #{email}}
                    email-map)]})))

(defn temp-csv
  [file-basename content]
  (prog1 (File/createTempFile file-basename ".csv")
    (with-open [file (io/writer <>)]
      (.write ^java.io.Writer file ^String content))))

(defn mock-send-email!
  "To stub out email sending, instead returning the would-be email contents as a string"
  [_smtp-credentials email-details]
  (-> email-details
      message/make-jmessage
      message/message->str))

(deftest send-message!-test
  (tu/with-temporary-setting-values [email-from-address "lucky@metabase.com"
                                     email-from-name    "Lucky"
                                     email-smtp-host    "smtp.metabase.com"
                                     email-smtp-username "lucky"
                                     email-smtp-password "d1nner3scapee!"
                                     email-smtp-port     1025
                                     email-reply-to      ["reply-to-me@metabase.com" "reply-to-me-too@metabase.com"]
                                     email-smtp-security :none]
    (testing "basic sending"
      (is (=
           [{:from     (str (email/email-from-name) " <" (email/email-from-address) ">")
             :to       ["test@test.com"]
             :subject  "101 Reasons to use Metabase"
             :reply-to (email/email-reply-to)
             :body     [{:type    "text/html; charset=utf-8"
                         :content "101. Metabase will make you a better person"}]}]
           (with-fake-inbox
             (email/send-message!
              :subject      "101 Reasons to use Metabase"
              :recipients   ["test@test.com"]
              :message-type :html
              :message      "101. Metabase will make you a better person")
             (@inbox "test@test.com")))))
    (testing "metrics collection"
      (let [calls (atom nil)]
        (with-redefs [prometheus/inc #(swap! calls conj %)]
          (with-fake-inbox
            (email/send-message!
             :subject      "101 Reasons to use Metabase"
             :recipients   ["test@test.com"]
             :message-type :html
             :message      "101. Metabase will make you a better person")))
        (is (= 1 (count (filter #{:metabase-email/messages} @calls))))
        (is (= 0 (count (filter #{:metabase-email/message-errors} @calls))))))
    (testing "error metrics collection"
      (let [calls (atom nil)]
            (let [retry-config (assoc (#'retry/retry-configuration)
                                  :max-attempts 1
                                  :initial-interval-millis 1)
              test-retry   (retry/random-exponential-backoff-retry "test-retry" retry-config)]
        (with-redefs [prometheus/inc    #(swap! calls conj %)
                      retry/decorate    (rt/test-retry-decorate-fn test-retry)
                      email/send-email! (fn [_ _] (throw (Exception. "test-exception")))]
          (email/send-message!
           :subject      "101 Reasons to use Metabase"
           :recipients   ["test@test.com"]
           :message-type :html
           :message      "101. Metabase will make you a better person"))
        (is (= 1 (count (filter #{:metabase-email/messages} @calls))))
        (is (= 1 (count (filter #{:metabase-email/message-errors} @calls)))))))
    (testing "basic sending without email-from-name"
      (tu/with-temporary-setting-values [email-from-name nil]
        (is (=
             [{:from     (email/email-from-address)
               :to       ["test@test.com"]
               :subject  "101 Reasons to use Metabase"
               :reply-to (email/email-reply-to)
               :body     [{:type    "text/html; charset=utf-8"
                           :content "101. Metabase will make you a better person"}]}]
             (with-fake-inbox
               (email/send-message!
                :subject      "101 Reasons to use Metabase"
                :recipients   ["test@test.com"]
                :message-type :html
                :message      "101. Metabase will make you a better person")
               (@inbox "test@test.com"))))))
    (testing "with an attachment"
      (let [recipient    "csv_user@example.com"
            csv-contents "hugs_with_metabase,hugs_without_metabase\n1,0"
            csv-file     (temp-csv "metabase-reasons" csv-contents)
            params       {:subject      "101 Reasons to use Metabase"
                          :recipients   [recipient]
                          :message-type :attachments
                          :message      [{:type    "text/html; charset=utf-8"
                                          :content "100. Metabase will hug you when you're sad"}
                                         {:type         :attachment
                                          :content-type "text/csv"
                                          :file-name    "metabase-reasons.csv"
                                          :content      csv-file
                                          :description  "very scientific data"}]}]
        (testing "it sends successfully"
          (is (=
               [{:from     (str (email/email-from-name) " <" (email/email-from-address) ">")
                 :to       [recipient]
                 :subject  "101 Reasons to use Metabase"
                 :reply-to (email/email-reply-to)
                 :body     [{:type    "text/html; charset=utf-8"
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
