(ns metabase.email
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            (postal [core :as postal]
                    [support :refer [make-props]])
            [metabase.models.setting :refer [defsetting], :as setting]
            [metabase.util :as u])
  (:import javax.mail.Session))

;; ## CONFIG

(defsetting email-from-address  "Email address you want to use as the sender of Metabase." :default "notifications@metabase.com")
(defsetting email-smtp-host     "The address of the SMTP server that handles your emails.")
(defsetting email-smtp-username "SMTP username.")
(defsetting email-smtp-password "SMTP password.")
(defsetting email-smtp-port     "The port your SMTP server uses for outgoing emails.")
(defsetting email-smtp-security
  "SMTP secure connection protocol. (tls, ssl, or none)"
  :default "none"
  :setter  (fn [new-value]
             (when-not (nil? new-value)
               (assert (contains? #{"tls" "ssl" "none"} new-value)))
             (setting/set-string! :email-smtp-security new-value)))

;; ## PUBLIC INTERFACE

;; TODO - just use `with-redefs` for tests ?
(def ^:dynamic *send-email-fn*
  "Internal function used to send messages. Should take 2 args - a map of SMTP credentials, and a map of email details.
   Provided so you can swap this out with an \"inbox\" for test purposes."
  postal/send-message)

(defn email-configured?
  "Predicate function which returns `true` if we have a viable email configuration for the app, `false` otherwise."
  []
  (not (s/blank? (setting/get :email-smtp-host))))

(defn send-message
  "Send an email to one or more RECIPIENTS.
   RECIPIENTS is a sequence of email addresses; MESSAGE-TYPE must be either `:text` or `:html`.

     (email/send-message
       :subject      \"[Metabase] Password Reset Request\"
       :recipients   [\"cam@metabase.com\"]
       :message-type :text
       :message      \"How are you today?\")

   Upon success, this returns the MESSAGE that was just sent."
  {:style/indent 0}
  [& {:keys [subject recipients message-type message]}]
  {:pre [(string? subject)
         (sequential? recipients)
         (or (every? u/is-email? recipients)
             (log/error "recipients contains an invalid email:" recipients))
         (contains? #{:text :html :attachments} message-type)
         (if (= message-type :attachments) (sequential? message) (string? message))]}
  (try
    ;; Check to make sure all valid settings are set!
    (when-not (email-smtp-host)
      (throw (Exception. "SMTP host is not set.")))
    ;; Now send the email
    (*send-email-fn* (-> {:host (email-smtp-host)
                          :user (email-smtp-username)
                          :pass (email-smtp-password)
                          :port (Integer/parseInt (email-smtp-port))}
                         (merge (case (keyword (email-smtp-security))
                                  :tls {:tls true}
                                  :ssl {:ssl true}
                                  {})))
                     {:from    (email-from-address)
                      :to      recipients
                      :subject subject
                      :body    (case message-type
                                 :attachments message
                                 :text message
                                 :html [{:type    "text/html; charset=utf-8"
                                         :content message}])})
    (catch Throwable e
      (log/warn "Failed to send email: " (.getMessage e))
      {:error   :ERROR
       :message (.getMessage e)})))


(defn test-smtp-connection
  "Test the connection to an SMTP server to determine if we can send emails.

   Takes in a dictionary of properties such as:
       {:host     \"localhost\"
        :port     587
        :user     \"bigbird\"
        :pass     \"luckyme\"
        :sender   \"foo@mycompany.com\"
        :security \"tls\"}"
  [{:keys [host port user pass sender security] :as details}]
  {:pre [(string? host)
         (integer? port)]}
  (try
    (let [ssl     (= security "ssl")
          proto   (if ssl "smtps" "smtp")
          details (-> details
                      (assoc :proto proto
                             :connectiontimeout "1000"
                             :timeout "1000")
                      (merge (case (keyword security)
                           :tls {:tls true}
                           :ssl {:ssl true}
                           {})))
          session (doto (Session/getInstance (make-props sender details))
                    (.setDebug false))]
      (with-open [transport (.getTransport session proto)]
        (.connect transport host port user pass)))
    {:error   :SUCCESS
     :message nil}
    (catch Throwable e
      (println "err" (.getMessage e))
      {:error   :ERROR
       :message (.getMessage e)})))
