(ns metabase.channel.email
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.analytics.core :as analytics]
   [metabase.channel.settings :as channel.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.retry :as retry]
   [postal.core :as postal]
   [postal.support :refer [make-props]]
   [throttle.core :as throttle])
  (:import
   (javax.mail Session)
   (throttle.core Throttler)))

(set! *warn-on-reflection* true)

;; https://github.com/metabase/metabase/issues/11879#issuecomment-713816386
(when-not *compile-files*
  (System/setProperty "mail.mime.splitlongparameters" "false"))

(defn- make-email-throttler
  [rate-limit]
  (throttle/make-throttler
   :email
   :attempt-ttl-ms     1000
   :initial-delay-ms   1000
   :attempts-threshold rate-limit))

(defonce ^:private email-throttler (when-let [rate-limit (channel.settings/email-max-recipients-per-second)]
                                     (make-email-throttler rate-limit)))

(defn check-email-throttle
  "Check if the email throttler is enabled and if so, throttle the email sending based on the total number of recipients.

  We will allow multi-recipient emails to broach the limit, as long as the limit has not been reached yet.

  We want two properties:
    1. All emails eventually get sent.
    2. Lowering the threshold must never cause more overflow."
  [email]
  (when email-throttler
    (when-let [recipients (not-empty (into #{} (mapcat email) [:to :bcc]))]
      (let [throttle-threshold (.attempts-threshold ^Throttler email-throttler)
            check-one!         #(throttle/check email-throttler true)]
        (check-one!)
        (try
          (dotimes [_ (dec (count recipients))]
            (throttle/check email-throttler true))
          (catch Exception _e
            (log/warn "Email throttling is enabled and the number of recipients exceeds the rate limit per second. Skip throttling."
                      {:email-subject  (:subject email)
                       :recipients     (count recipients)
                       :max-recipients throttle-threshold})))))))

(defn- add-mail-args
  "Adds any additionally needed mail properties needed for sending mail to the given map of args."
  [args]
  (let [trust (System/getProperty "mail.smtps.ssl.trust")]
    (if trust
      (assoc args :ssl.trust trust)
      args)))

;; ## PUBLIC INTERFACE

(defn send-email!
  "Internal function used to send messages. Should take 2 args - a map of SMTP credentials, and a map of email details.
  Provided so you can swap this out with an \"inbox\" for test purposes.

  If email-rate-limit-per-second is set, this function will throttle the email sending based on the total number of recipients."
  [smtp-credentials email-details]
  (check-email-throttle email-details)
  (postal/send-message (add-mail-args smtp-credentials) email-details))

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
  (merge (if (and (channel.settings/smtp-override-enabled) (premium-features/is-hosted?))
           (-> {:host         (channel.settings/email-smtp-host-override)
                :user         (channel.settings/email-smtp-username-override)
                :pass         (channel.settings/email-smtp-password-override)
                :port         (channel.settings/email-smtp-port-override)
                :from-address (channel.settings/email-from-address-override)}
               (add-ssl-settings (channel.settings/email-smtp-security-override)))
           (-> {:host         (channel.settings/email-smtp-host)
                :user         (channel.settings/email-smtp-username)
                :pass         (channel.settings/email-smtp-password)
                :port         (channel.settings/email-smtp-port)
                :from-address (channel.settings/email-from-address)}
               (add-ssl-settings (channel.settings/email-smtp-security))))
         {:reply-to  (channel.settings/email-reply-to)
          :from-name (channel.settings/email-from-name)}))

(def ^:private EmailMessage
  [:and
   [:map {:closed true}
    [:subject      :string]
    [:recipients   [:or [:sequential ms/Email] [:set ms/Email]]]
    [:message-type [:enum :text :html :attachments]]
    [:message      [:or :string [:sequential :map]]]
    [:bcc?         {:optional true} [:maybe :boolean]]]
   [:fn {:error/message (str "Bad message-type/message combo: message-type `:attachments` should have a sequence of maps as its message; "
                             "other types should have a String message.")}
    (fn [{:keys [message-type message]}]
      (if (= message-type :attachments)
        (and (sequential? message) (every? map? message))
        (string? message)))]])

(defn send-message-or-throw!
  "Send an email to one or more `recipients`. Upon success, this returns the `message` that was just sent. This function
  does not catch and swallow thrown exceptions, it will bubble up. Should prefer to use [[send-email-retrying!]] unless
  the caller has its own retry logic."
  [{:keys [subject recipients message-type message bcc?] :as _email}]
  (try
    (when-not (channel.settings/email-smtp-host)
      (throw (ex-info (tru "SMTP host is not set.") {:cause :smtp-host-not-set})))
    ;; Now send the email
    (let [to-type (if bcc? :bcc :to)
          smtp-settings (smtp-settings)]
      (send-email! smtp-settings
                   (merge
                    {:from    (if-let [from-name (:from-name smtp-settings)]
                                (str from-name " <" (:from-address smtp-settings) ">")
                                (:from-address smtp-settings))
                     ;; FIXME: postal doesn't accept recipients if it's a set, need to fix this from upstream
                     to-type  (seq recipients)
                     :subject subject
                     :body    (case message-type
                                :attachments message
                                :text        message
                                :html        [{:type    "text/html; charset=utf-8"
                                               :content message}])}
                    (when-let [reply-to (:reply-to smtp-settings)]
                      {:reply-to reply-to}))))
    (catch Throwable e
      (analytics/inc! :metabase-email/message-errors)
      (when (not= :smtp-host-not-set (:cause (ex-data e)))
        (throw e)))
    (finally
      (analytics/inc! :metabase-email/messages))))

(mu/defn send-email-retrying!
  "Like [[send-message-or-throw!]] but retries sending on errors according to the retry settings."
  [email :- EmailMessage]
  (retry/with-retry (retry/retry-configuration)
    (send-message-or-throw! email)))

(def ^:private SMTPStatus
  "Schema for the response returned by various functions in [[metabase.channel.email]]. Response will be a map with the key
  `:metabase.channel.email/error`, which will either be `nil` (indicating no error) or an instance of [[java.lang.Throwable]]
  with the error."
  [:map {:closed true}
   [::error [:maybe (ms/InstanceOfClass Throwable)]]])

(defn send-message!
  "Send an email to one or more `:recipients`. `:recipients` is a sequence of email addresses; `:message-type` must be
  either `:text` or `:html` or `:attachments`.

    (email/send-message!
     {:subject      \"[Metabase] Password Reset Request\"
      :recipients   [\"cam@metabase.com\"]
      :message-type :text
      :message      \"How are you today?\")}

  Upon success, this returns the `:message` that was just sent. (TODO -- confirm this.) This function will catch and
  log any exception, returning a [[SMTPStatus]]."
  [& {:as msg-args}]
  (try
    (send-email-retrying! msg-args)
    (catch Throwable e
      (log/warn e "Failed to send email")
      {::error e})))

(def ^:private SMTPSettings
  [:map {:closed true}
   [:host                         ms/NonBlankString]
   [:port                         ms/PositiveInt]
   ;; TODO -- not sure which of these other ones are actually required or not, and which are optional.
   [:user        {:optional true} [:maybe :string]]
   [:security    {:optional true} [:maybe [:enum :tls :ssl :none :starttls]]]
   [:pass        {:optional true} [:maybe :string]]
   [:sender      {:optional true} [:maybe :string]]
   [:sender-name {:optional true} [:maybe :string]]
   [:reply-to    {:optional true} [:maybe [:sequential ms/Email]]]])

(mu/defn- test-smtp-settings :- SMTPStatus
  "Tests an SMTP configuration by attempting to connect and authenticate if an authenticated method is passed
  in `:security`."
  [{:keys [host port user pass sender security], :as details} :- SMTPSettings]
  (try
    (let [ssl?    (= (keyword security) :ssl)
          proto   (if ssl? "smtps" "smtp")
          details (-> details
                      (assoc :proto proto
                             :connectiontimeout "1000"
                             :timeout "4000")
                      (add-ssl-settings security))
          session (doto (Session/getInstance (make-props sender (add-mail-args details)))
                    (.setDebug false))]
      (with-open [transport (.getTransport session proto)]
        (.connect transport host port user pass)))
    {::error nil}
    (catch Throwable e
      (log/error e "Error testing SMTP connection")
      {::error e})))

(def ^:private email-security-order [:tls :starttls :ssl])

(def ^:private ^Long retry-delay-ms
  "Amount of time to wait between retrying SMTP connections with different security options. This delay exists to keep
  us from getting banned on Outlook.com."
  500)

(mu/defn- guess-smtp-security :- [:maybe [:enum :tls :starttls :ssl]]
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

(mu/defn test-smtp-connection :- [:or SMTPStatus SMTPSettings]
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

(defn- smtp->mb-setting
  "Convert a SMTP setting to a Metabase setting name."
  [smtp-setting mb-to-smtp-map]
  (get (set/map-invert mb-to-smtp-map) smtp-setting))

(defn humanize-error-messages
  "Convert raw error message responses from our email functions into our normal api error response structure."
  [mb-to-smtp-map {::keys [error]}]
  (when error
    (let [conn-error  {:errors {(smtp->mb-setting :host mb-to-smtp-map) "Wrong host or port"
                                (smtp->mb-setting :port mb-to-smtp-map) "Wrong host or port"}}
          creds-error {:errors {(smtp->mb-setting :user mb-to-smtp-map) "Wrong username or password"
                                (smtp->mb-setting :pass mb-to-smtp-map) "Wrong username or password"}}
          exceptions  (u/full-exception-chain error)
          message     (str/join ": " (map ex-message exceptions))
          match-error (fn match-error [regex-or-exception-class [message exceptions]]
                        (cond (instance? java.util.regex.Pattern regex-or-exception-class)
                              (re-find regex-or-exception-class message)

                              (class? regex-or-exception-class)
                              (some (partial instance? regex-or-exception-class) exceptions)))]
      (log/warn "Problem connecting to mail server:" message)
      (condp match-error [message exceptions]
        ;; bad host = "Unknown SMTP host: foobar"
        #"^Unknown SMTP host:.*$"
        conn-error

        ;; host seems valid, but host/port failed connection = "Could not connect to SMTP host: localhost, port: 123"
        #".*Could(?: not)|(?:n't) connect to (?:SMTP )?host.*"
        conn-error

        ;; seen this show up on mandrill
        #"^Invalid Addresses$"
        creds-error

        ;; seen this show up on mandrill using TLS with bad credentials
        #"^failed to connect, no password specified\?$"
        creds-error

        ;; madrill authentication failure
        #"^435 4.7.8 Error: authentication failed:.*$"
        creds-error

        javax.mail.AuthenticationFailedException
        creds-error

        ;; everything else :(
        {:message (str "Sorry, something went wrong. Please try again. Error: " message)}))))

(defn- humanize-email-corrections
  "Formats warnings when security settings are autocorrected."
  [corrections mb-to-smtp-map]
  (into
   {}
   (for [[k v] corrections]
     [k (tru "{0} was autocorrected to {1}"
             (name (mb-to-smtp-map k))
             (u/upper-case-en v))])))

(defn check-and-update-settings
  "Check the provided settings against the SMTP server and update the Metabase settings if the connection is successful."
  [settings mb-to-smtp-map current-smtp-password]
  (perms/check-has-application-permission :setting)
  (let [smtp-settings (-> settings
                          (select-keys (keys mb-to-smtp-map))
                          (set/rename-keys mb-to-smtp-map))
        ;; the frontend has access to an obfuscated version of the password. Watch for whether it sent us a new password or
        ;; the obfuscated version
        obfuscated? (and (:pass smtp-settings) current-smtp-password
                         (= (:pass smtp-settings) (setting/obfuscate-value current-smtp-password)))
        smtp-settings         (cond-> smtp-settings
                                obfuscated?
                                (assoc :pass current-smtp-password))
        smtp-settings         (cond-> smtp-settings
                                (string? (:port smtp-settings))     (update :port #(Long/parseLong ^String %))
                                (string? (:security smtp-settings)) (update :security keyword)
                                ;; if keys were not provided, clear them out
                                (nil? (:port smtp-settings)) (assoc :port nil)
                                (nil? (:security smtp-settings)) (assoc :security nil)
                                (nil? (:host smtp-settings)) (assoc :host nil)
                                (nil? (:user smtp-settings)) (assoc :user nil)
                                (nil? (:pass smtp-settings)) (assoc :pass nil))
        response         (test-smtp-connection smtp-settings)]
    (if-not (::error response)
      ;; test was good, save our settings
      (let [[_ corrections] (data/diff smtp-settings response)
            new-settings    (set/rename-keys response (set/map-invert mb-to-smtp-map))]
        (setting/set-many! new-settings)
        (cond-> (assoc new-settings :with-corrections (-> corrections
                                                          (set/rename-keys (set/map-invert mb-to-smtp-map))
                                                          (humanize-email-corrections mb-to-smtp-map)))
          obfuscated? (update (smtp->mb-setting :pass mb-to-smtp-map) setting/obfuscate-value)))
      ;; test failed, return response message
      {:status 400
       :body   (humanize-error-messages mb-to-smtp-map response)})))
