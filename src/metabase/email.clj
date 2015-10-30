(ns metabase.email
  (:require [clojure.tools.logging :as log]
            [postal.core :as postal]
            [metabase.models.setting :refer [defsetting]]
            [metabase.util :as u]))

;; ## CONFIG

(defsetting email-from-address "Email address used as the sender of system notifications." "notifications@metabase.com")
(defsetting email-smtp-host "SMTP host.")
(defsetting email-smtp-username "SMTP username.")
(defsetting email-smtp-password "SMTP password.")
(defsetting email-smtp-port "SMTP port." "587")
(defsetting email-smtp-security "SMTP secure connection protocol. (tls, ssl, or none)" "none")

;; ## PUBLIC INTERFACE

(def ^:dynamic *send-email-fn*
  "Internal function used to send messages. Should take 2 args - a map of SMTP credentials, and a map of email details.
   Provided so you can swap this out with an \"inbox\" for test purposes."
  postal/send-message)

(defn send-message
  "Send an email to one or more RECIPIENTS.
   RECIPIENTS is a sequence of email addresses; MESSAGE-TYPE must be either `:text` or `:html`.

     (email/send-message
      :subject      \"[Metabase] Password Reset Request\"
      :recipients   [\"cam@metabase.com\"]
      :message-type :text
      :message      \"How are you today?\")

   Upon success, this returns the MESSAGE that was just sent."
  [& {:keys [subject recipients message-type message]}]
  {:pre [(string? subject)
         (sequential? recipients)
         (every? u/is-email? recipients)
         (contains? #{:text :html} message-type)
         (string? message)]}
  (try
    ;; Check to make sure all valid settings are set!
    (when-not (email-smtp-host)
      (throw (Exception. "SMTP host is not set.")))
    ;; Now send the email
    (let [{error :error error-message :message} (*send-email-fn* (-> {:host (email-smtp-host)
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
                                                                             :text message
                                                                             :html [{:type    "text/html; charset=utf-8"
                                                                                     :content message}])})]
      (when-not (= error :SUCCESS)
        (throw (Exception. (format "Emails failed to send: error: %s; message: %s" error error-message))))
      message)
    (catch Throwable e
      (log/warn "Failed to send email: " (.getMessage e)))))
