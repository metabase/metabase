(ns metabase.email
  (:require [clojure.tools.logging :as log]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru trs]]
             [schema :as su]]
            [postal
             [core :as postal]
             [support :refer [make-props]]]
            [schema.core :as s])
  (:import javax.mail.Session))

;;; CONFIG
;; TODO - smtp-port should be switched to type :integer

(defsetting email-from-address  (tru "Email address you want to use as the sender of Metabase.") :default "notifications@metabase.com")
(defsetting email-smtp-host     (tru "The address of the SMTP server that handles your emails."))
(defsetting email-smtp-username (tru "SMTP username."))
(defsetting email-smtp-password (tru "SMTP password."))
(defsetting email-smtp-port     (tru "The port your SMTP server uses for outgoing emails."))
(defsetting email-smtp-security
  (tru "SMTP secure connection protocol. (tls, ssl, starttls, or none)")
  :default (tru "none")
  :setter  (fn [new-value]
             (when-not (nil? new-value)
               (assert (contains? #{"tls" "ssl" "none" "starttls"} new-value)))
             (setting/set-string! :email-smtp-security new-value)))

;; ## PUBLIC INTERFACE

(def ^{:arglists '([smtp-credentials email-details]), :style/indent 1} send-email!
  "Internal function used to send messages. Should take 2 args - a map of SMTP credentials, and a map of email details.
   Provided so you can swap this out with an \"inbox\" for test purposes."
  postal/send-message)

(defn email-configured?
  "Predicate function which returns `true` if we have a viable email configuration for the app, `false` otherwise."
  []
  (boolean (email-smtp-host)))

(defn- add-ssl-settings [m ssl-setting]
  (merge m (case (keyword ssl-setting)
             :tls {:tls true}
             :ssl {:ssl true}
             :starttls {:starttls.enable true
                        :starttls.required true}
             {})))

(defn- smtp-settings []
  (-> {:host (email-smtp-host)
       :user (email-smtp-username)
       :pass (email-smtp-password)
       :port (Integer/parseInt (email-smtp-port))}
      (add-ssl-settings (email-smtp-security))))

(def ^:private EmailMessage
  (s/constrained
   {:subject      s/Str
    :recipients   [(s/pred u/email?)]
    :message-type (s/enum :text :html :attachments)
    :message      (s/cond-pre s/Str [su/Map])} ; TODO - what should this be a sequence of?
   (fn [{:keys [message-type message]}]
     (if (= message-type :attachments)
       (and (sequential? message) (every? map? message))
       (string? message)))
   (str "Bad message-type/message combo: message-type `:attachments` should have a sequence of maps as its message; "
        "other types should have a String message.")))

(s/defn send-message-or-throw!
  "Send an email to one or more RECIPIENTS. Upon success, this returns the MESSAGE that was just sent. This function
  does not catch and swallow thrown exceptions, it will bubble up."
  {:style/indent 0}
  [{:keys [subject recipients message-type message]} :- EmailMessage]
  (when-not (email-smtp-host)
    (let [^String msg (str (tru "SMTP host is not set."))]
      (throw (Exception. msg))))
  ;; Now send the email
  (send-email! (smtp-settings)
    {:from    (email-from-address)
     :to      recipients
     :subject subject
     :body    (case message-type
                :attachments message
                :text        message
                :html        [{:type    "text/html; charset=utf-8"
                               :content message}])}))

(defn send-message!
  "Send an email to one or more RECIPIENTS.
  RECIPIENTS is a sequence of email addresses; MESSAGE-TYPE must be either `:text` or `:html` or `:attachments`.

     (email/send-message!
       :subject      \"[Metabase] Password Reset Request\"
       :recipients   [\"cam@metabase.com\"]
       :message-type :text
       :message      \"How are you today?\")

  Upon success, this returns the MESSAGE that was just sent. This function will catch and log any exception,
  returning a map with a description of the error"
  {:style/indent 0}
  [& {:keys [subject recipients message-type message] :as msg-args}]
  (try
    (send-message-or-throw! msg-args)
    (catch Throwable e
      (log/warn e (trs "Failed to send email"))
      {:error   :ERROR
       :message (.getMessage e)})))

(defn- run-smtp-test
  "tests an SMTP configuration by attempting to connect and authenticate
   if an authenticated method is passed in :security."
  [{:keys [host port user pass sender security] :as details}]
  {:pre [(string? host)
         (integer? port)]}
  (try
    (let [ssl?      (= security "ssl")
          proto     (if ssl? "smtps" "smtp")
          details (-> details
                      (assoc :proto proto
                             :connectiontimeout "1000"
                             :timeout "4000")
                      (add-ssl-settings security))
          session (doto (Session/getInstance (make-props sender details))
                    (.setDebug false))]
      (with-open [transport (.getTransport session proto)]
        (.connect transport host port user pass)))
    {:error   :SUCCESS
     :message nil}
    (catch Throwable e
      (log/error e (trs "Error testing SMTP connection"))
      {:error   :ERROR
       :message (.getMessage e)})))

(def ^:private email-security-order ["tls" "starttls" "ssl"])

(defn- guess-smtp-security
  "Attempts to use each of the security methods in security order with the same set of credentials. This is used only
  when the initial connection attempt fails, so it won't overwrite a functioning configuration. If this uses something
  other than the provided method, a warning gets printed on the config page"
  [details]
  (loop [[security-type & more-to-try] email-security-order] ;; make sure this is not lazy, or chunking
    (when security-type                                      ;; can cause some servers to block requests
      (let [test-result (run-smtp-test (assoc details :security security-type))]
        (if (not= :ERROR (:error test-result))
          (assoc test-result :security security-type)
          (do
            (Thread/sleep 500) ;; try not to get banned from outlook.com
            (recur more-to-try)))))))

(defn test-smtp-connection
  "Test the connection to an SMTP server to determine if we can send emails.

   Takes in a dictionary of properties such as:
       {:host     \"localhost\"
        :port     587
        :user     \"bigbird\"
        :pass     \"luckyme\"
        :sender   \"foo@mycompany.com\"
        :security \"tls\"}"
  [details]
  (let [inital-attempt (run-smtp-test details)
        it-worked?     (= :SUCCESS (:error inital-attempt))
        attempted-fix  (if (not it-worked?)
                         (guess-smtp-security details))
        we-fixed-it?     (= :SUCCESS (:error attempted-fix))]
    (if it-worked?
      inital-attempt
      (if we-fixed-it?
        attempted-fix
        inital-attempt))))
