(ns metabase.email
  (:require
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [postal.core :as postal]
   [postal.support :refer [make-props]]
   [schema.core :as s])
  (:import
   (javax.mail Session)))

(set! *warn-on-reflection* true)

;; https://github.com/metabase/metabase/issues/11879#issuecomment-713816386
(when-not *compile-files*
  (System/setProperty "mail.mime.splitlongparameters" "false"))

;;; CONFIG

(defsetting email-from-address
  (deferred-tru "The email address you want to use for the sender of emails.")
  :default    "notifications@metabase.com"
  :visibility :settings-manager)

(defsetting email-from-name
  (deferred-tru "The name you want to use for the sender of emails.")
  :visibility :settings-manager)

(def ^:private ReplyToAddresses
  (s/maybe [su/Email]))

(def ^:private ^{:arglists '([reply-to-addresses])} validate-reply-to-addresses
  (s/validator ReplyToAddresses))

(defsetting email-reply-to
  (deferred-tru "The email address you want the replies to go to, if different from the from address.")
  :type :json
  :visibility :settings-manager
  :setter (fn [new-value]
            (->> new-value
                 validate-reply-to-addresses
                 (setting/set-value-of-type! :json :email-reply-to))))

(defsetting email-smtp-host
  (deferred-tru "The address of the SMTP server that handles your emails.")
  :visibility :settings-manager)

(defsetting email-smtp-username
  (deferred-tru "SMTP username.")
  :visibility :settings-manager)

(defsetting email-smtp-password
  (deferred-tru "SMTP password.")
  :visibility :settings-manager
  :sensitive? true)

(defsetting email-smtp-port
  (deferred-tru "The port your SMTP server uses for outgoing emails.")
  :type       :integer
  :visibility :settings-manager)

(defsetting email-smtp-security
  (deferred-tru "SMTP secure connection protocol. (tls, ssl, starttls, or none)")
  :type       :keyword
  :default    :none
  :visibility :settings-manager
  :setter  (fn [new-value]
             (when (some? new-value)
               (assert (#{:tls :ssl :none :starttls} (keyword new-value))))
             (setting/set-value-of-type! :keyword :email-smtp-security new-value)))

;; ## PUBLIC INTERFACE

(def ^{:arglists '([smtp-credentials email-details])} send-email!
  "Internal function used to send messages. Should take 2 args - a map of SMTP credentials, and a map of email details.
   Provided so you can swap this out with an \"inbox\" for test purposes."
  postal/send-message)

(defsetting email-configured?
  "Check if email is enabled and that the mandatory settings are configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :getter     #(boolean (email-smtp-host))
  :doc        false)

(defn- add-ssl-settings [m ssl-setting]
  (merge
   m
   (case (keyword ssl-setting)
     :tls      {:tls true}
     :ssl      {:ssl true}
     :starttls {:starttls.enable   true
                :starttls.required true}
     {})))

(defn- smtp-settings []
  (-> {:host (email-smtp-host)
       :user (email-smtp-username)
       :pass (email-smtp-password)
       :port (email-smtp-port)}
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
  "Send an email to one or more `recipients`. Upon success, this returns the `message` that was just sent. This function
  does not catch and swallow thrown exceptions, it will bubble up."
  {:style/indent 0}
  [{:keys [subject recipients message-type message]} :- EmailMessage]
  (when-not (email-smtp-host)
    (throw (ex-info (tru "SMTP host is not set.") {:cause :smtp-host-not-set})))
  ;; Now send the email
  (send-email! (smtp-settings)
               (merge
                {:from    (if-let [from-name (email-from-name)]
                            (str from-name " <" (email-from-address) ">")
                            (email-from-address))
                 :to      recipients
                 :subject subject
                 :body    (case message-type
                            :attachments message
                            :text        message
                            :html        [{:type    "text/html; charset=utf-8"
                                           :content message}])}
                (when-let [reply-to (email-reply-to)]
                  {:reply-to reply-to}))))

(def ^:private SMTPStatus
  "Schema for the response returned by various functions in [[metabase.email]]. Response will be a map with the key
  `:metabase.email/error`, which will either be `nil` (indicating no error) or an instance of [[java.lang.Throwable]]
  with the error."
  {::error (s/maybe Throwable)})

(defn send-message!
  "Send an email to one or more `:recipients`. `:recipients` is a sequence of email addresses; `:message-type` must be
  either `:text` or `:html` or `:attachments`.

    (email/send-message!
     :subject      \"[Metabase] Password Reset Request\"
     :recipients   [\"cam@metabase.com\"]
     :message-type :text
     :message      \"How are you today?\")

  Upon success, this returns the `:message` that was just sent. (TODO -- confirm this.) This function will catch and
  log any exception, returning a [[SMTPStatus]]."
  [& {:as msg-args}]
  (try
    (send-message-or-throw! msg-args)
    (catch Throwable e
      (log/warn e (trs "Failed to send email"))
      {::error e})))

(def ^:private SMTPSettings
  {:host                         su/NonBlankString
   :port                         su/IntGreaterThanZero
     ;; TODO -- not sure which of these other ones are actually required or not, and which are optional.
   (s/optional-key :user)        (s/maybe s/Str)
   (s/optional-key :security)    (s/maybe (s/enum :tls :ssl :none :starttls))
   (s/optional-key :pass)        (s/maybe s/Str)
   (s/optional-key :sender)      (s/maybe s/Str)
   (s/optional-key :sender-name) (s/maybe s/Str)
   (s/optional-key :reply-to)    (s/maybe [s/Str])})

(s/defn ^:private test-smtp-settings :- SMTPStatus
  "Tests an SMTP configuration by attempting to connect and authenticate if an authenticated method is passed
  in `:security`."
  [{:keys [host port user pass sender security], :as details} :- SMTPSettings]
  {:pre [(string? host)
         (integer? port)]}
  (try
    (let [ssl?    (= (keyword security) :ssl)
          proto   (if ssl? "smtps" "smtp")
          details (-> details
                      (assoc :proto proto
                             :connectiontimeout "1000"
                             :timeout "4000")
                      (add-ssl-settings security))
          session (doto (Session/getInstance (make-props sender details))
                    (.setDebug false))]
      (with-open [transport (.getTransport session proto)]
        (.connect transport host port user pass)))
    {::error nil}
    (catch Throwable e
      (log/error e (trs "Error testing SMTP connection"))
      {::error e})))

(def ^:private email-security-order [:tls :starttls :ssl])

(def ^:private ^Long retry-delay-ms
  "Amount of time to wait between retrying SMTP connections with different security options. This delay exists to keep
  us from getting banned on Outlook.com."
  500)

(s/defn ^:private guess-smtp-security :- (s/maybe (s/enum :tls :starttls :ssl))
  "Attempts to use each of the security methods in security order with the same set of credentials. This is used only
  when the initial connection attempt fails, so it won't overwrite a functioning configuration. If this uses something
  other than the provided method, a warning gets printed on the config page.

  If unable to connect with any security method, returns `nil`. Otherwise returns the security method that we were
  able to connect successfully with."
  [details :- SMTPSettings]
  ;; make sure this is not lazy, or chunking can cause some servers to block requests
  (some
   (fn [security-type]
     (if-not (::error (test-smtp-settings (assoc details :security security-type)))
       security-type
       (do
         (Thread/sleep retry-delay-ms) ; Try not to get banned from outlook.com
         nil)))
   email-security-order))

(s/defn test-smtp-connection :- (s/conditional
                                 ::error SMTPStatus
                                 :else   SMTPSettings)
  "Test the connection to an SMTP server to determine if we can send emails. Takes in a dictionary of properties such
  as:

    {:host     \"localhost\"
     :port     587
     :user     \"bigbird\"
     :pass     \"luckyme\"
     :sender   \"foo@mycompany.com\"
     :security :tls}

  Attempts to connect with different `:security` options. If able to connect successfully, returns working
  [[SMTPSettings]]. If unable to connect with any `:security` options, returns an [[SMTPStatus]] with the `::error`."
  [details :- SMTPSettings]
  (let [initial-attempt (test-smtp-settings details)]
    (if-not (::error initial-attempt)
      details
      (if-let [working-security-type (guess-smtp-security details)]
        (assoc details :security working-security-type)
        initial-attempt))))
