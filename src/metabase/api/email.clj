(ns metabase.api.email
  "/api/email endpoints"
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [compojure.core :refer [DELETE POST PUT]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.email :as email]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private mb-to-smtp-settings
  {:email-smtp-host     :host
   :email-smtp-username :user
   :email-smtp-password :pass
   :email-smtp-port     :port
   :email-smtp-security :security
   :email-from-name     :sender-name
   :email-from-address  :sender
   :email-reply-to      :reply-to})

(defn- humanize-error-messages
  "Convert raw error message responses from our email functions into our normal api error response structure."
  [{::email/keys [error]}]
  (when error
    (let [conn-error  {:errors {:email-smtp-host "Wrong host or port"
                                :email-smtp-port "Wrong host or port"}}
          creds-error {:errors {:email-smtp-username "Wrong username or password"
                                :email-smtp-password "Wrong username or password"}}
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
  [corrections]
  (into
   {}
   (for [[k v] corrections]
     [k (tru "{0} was autocorrected to {1}"
             (name (mb-to-smtp-settings k))
             (u/upper-case-en v))])))

(defn- env-var-values-by-email-setting
  "Returns a map of setting names (keywords) and env var values.
   If an env var is not set, the setting is not included in the result."
  []
  (into {}
        (for [setting-name (keys mb-to-smtp-settings)
              :let         [value (setting/env-var-value setting-name)]
              :when        (some? value)]
          [setting-name value])))

(api/defendpoint PUT "/"
  "Update multiple email Settings. You must be a superuser or have `setting` permission to do this."
  [:as {settings :body}]
  {settings :map}
  (validation/check-has-application-permission :setting)
  (let [;; the frontend has access to an obfuscated version of the password. Watch for whether it sent us a new password or
        ;; the obfuscated version
        obfuscated? (and (:email-smtp-password settings) (email/email-smtp-password)
                         (= (:email-smtp-password settings) (setting/obfuscate-value (email/email-smtp-password))))
        ;; override `nil` values in the request with environment variables for testing the SMTP connection
        env-var-settings (env-var-values-by-email-setting)
        settings         (merge settings env-var-settings)
        settings         (-> (cond-> settings
                               obfuscated?
                               (assoc :email-smtp-password (email/email-smtp-password)))
                             (select-keys (keys mb-to-smtp-settings))
                             (set/rename-keys mb-to-smtp-settings))
        settings         (cond-> settings
                           (string? (:port settings))     (update :port #(Long/parseLong ^String %))
                           (string? (:security settings)) (update :security keyword))
        response         (email/test-smtp-connection settings)]
    (if-not (::email/error response)
      ;; test was good, save our settings
      (let [[_ corrections] (data/diff settings response)
            new-settings    (set/rename-keys response (set/map-invert mb-to-smtp-settings))]
        ;; don't update settings if they are set by environment variables
        (setting/set-many! (apply dissoc new-settings (keys env-var-settings)))
        (cond-> (assoc new-settings :with-corrections (-> corrections
                                                          (set/rename-keys (set/map-invert mb-to-smtp-settings))
                                                          humanize-email-corrections))
          obfuscated? (update :email-smtp-password setting/obfuscate-value)))
      ;; test failed, return response message
      {:status 400
       :body   (humanize-error-messages response)})))

(api/defendpoint DELETE "/"
  "Clear all email related settings. You must be a superuser or have `setting` permission to do this."
  []
  (validation/check-has-application-permission :setting)
  (setting/set-many! (zipmap (keys mb-to-smtp-settings) (repeat nil)))
  api/generic-204-no-content)

(api/defendpoint POST "/test"
  "Send a test email using the SMTP Settings. You must be a superuser or have `setting` permission to do this.
  Returns `{:ok true}` if we were able to send the message successfully, otherwise a standard 400 error response."
  []
  (validation/check-has-application-permission :setting)
  (when-not (and (email/email-smtp-port) (email/email-smtp-host))
    {:status 400
     :body   "Wrong host or port"})
  (let [response (email/send-message-or-throw!
                  {:subject      "Metabase Test Email"
                   :recipients   [(:email @api/*current-user*)]
                   :message-type :text
                   :message      "Your Metabase emails are working — hooray!"})]
    (if-not (::email/error response)
      {:ok true}
      {:status 400
       :body   (humanize-error-messages response)})))

(api/define-routes)
