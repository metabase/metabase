(ns metabase.channel.api.email
  "/api/email endpoints"
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.email :as email]
   [metabase.channel.settings :as channel.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private mb-to-smtp-settings
  {:email-smtp-host     :host
   :email-smtp-username :user
   :email-smtp-password :pass
   :email-smtp-port     :port
   :email-smtp-security :security})

(def ^:private cloud-mb-to-smtp-settings
  {:cloud-email-smtp-host     :host
   :cloud-email-smtp-username :user
   :cloud-email-smtp-password :pass
   :cloud-email-smtp-port     :port
   :cloud-email-smtp-security :security})

(defn- smtp->mb-setting [smtp-setting mb-to-smtp-map]
  "Convert a SMTP setting to a Metabase setting name."
  (get (set/map-invert mb-to-smtp-map) smtp-setting))

(defn- check-features []
  (when (not (premium-features/is-hosted?))
    (throw (ex-info (tru "API is not available on non-hosted servers.")
                    {:status-code 403})))
  (when (not (premium-features/has-feature? :cloud-custom-smtp))
    (throw (ex-info (tru "API is not available in your Metabase plan. Please upgrade to use this feature.")
                    {:status-code 403}))))

(defn- humanize-error-messages
  "Convert raw error message responses from our email functions into our normal api error response structure."
  [mb-to-smtp-map {::email/keys [error]}]
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

(defn- env-var-values-by-email-setting
  "Returns a map of setting names (keywords) and env var values.
   If an env var is not set, the setting is not included in the result."
  [mb-to-smtp-map]
  (into {}
        (for [setting-name (keys mb-to-smtp-map)
              :let         [value (setting/env-var-value setting-name)]
              :when        (some? value)]
          [setting-name value])))

(defn- check-and-update-settings [settings mb-to-smtp-map current-smtp-password]
  (perms/check-has-application-permission :setting)
  (let [env-var-settings (env-var-values-by-email-setting mb-to-smtp-map)
        smtp-settings (-> settings
                        ;; override `nil` values in the request with environment variables for testing the SMTP connection
                          (merge env-var-settings)
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
                                (string? (:security smtp-settings)) (update :security keyword))
        response         (email/test-smtp-connection smtp-settings)]
    (if-not (::email/error response)
      ;; test was good, save our settings
      (let [[_ corrections] (data/diff smtp-settings response)
            new-settings    (set/rename-keys response (set/map-invert mb-to-smtp-map))]
        ;; don't update settings if they are set by environment variables
        (setting/set-many! (apply dissoc new-settings (keys env-var-settings)))
        (cond-> (assoc new-settings :with-corrections (-> corrections
                                                          (set/rename-keys (set/map-invert mb-to-smtp-map))
                                                          (#(humanize-email-corrections % mb-to-smtp-map))))
          obfuscated? (update (smtp->mb-setting :pass mb-to-smtp-map) setting/obfuscate-value)))
      ;; test failed, return response message
      {:status 400
       :body   (humanize-error-messages mb-to-smtp-map response)})))

(api.macros/defendpoint :put "/"
  "Update multiple email Settings. You must be a superuser or have `setting` permission to do this."
  [_route-params
   _query-params
   settings :- [:map
                [:email-smtp-host {:optional true} [:or string? nil?]]
                [:email-smtp-password {:optional true} [:or string? nil?]]
                [:email-smtp-port {:optional true} [:or int? nil?]]
                [:email-smtp-security {:optional true} [:or string? nil?]]
                [:email-smtp-username {:optional true} [:or string? nil?]]]]
  (check-and-update-settings settings mb-to-smtp-settings (channel.settings/email-smtp-password)))

(api.macros/defendpoint :put "/cloud"
  "Update multiple cloud email Settings. You must be a superuser or have `setting` permission to do this."
  [_route-params
   _query-params
   settings :- [:map
                [:cloud-email-smtp-host {:optional true} [:or string? nil?]]
                [:cloud-email-smtp-password {:optional true} [:or string? nil?]]
                [:cloud-email-smtp-port {:optional true} [:or int? nil?]]
                [:cloud-email-smtp-security {:optional true} [:or string? nil?]]
                [:cloud-email-smtp-username {:optional true} [:or string? nil?]]]]
  (check-features)

  ;; Validations match validation in settings, but pre-checking here to avoid attempting network checks for invalid settings.
  (when (and (:cloud-email-smtp-port settings) (not (#{465 587 2525} (:cloud-email-smtp-port settings))))
    (throw (ex-info (tru "Invalid cloud-email-smtp-port value")
                    {:status-code 400})))
  (when (and (:cloud-email-smtp-security settings) (not (#{:tls :ssl :starttls} (keyword (:cloud-email-smtp-security settings)))))
    (throw (ex-info (tru "Invalid cloud-email-smtp-security value")
                    {:status-code 400})))

  (check-and-update-settings settings cloud-mb-to-smtp-settings (channel.settings/cloud-email-smtp-password)))

(api.macros/defendpoint :delete "/"
  "Clear all email related settings. You must be a superuser or have `setting` permission to do this."
  []
  (perms/check-has-application-permission :setting)
  (setting/set-many! (zipmap (keys mb-to-smtp-settings) (repeat nil)))
  api/generic-204-no-content)

(api.macros/defendpoint :delete "/cloud"
  "Clear all cloud email related settings. You must be a superuser or have `setting` permission to do this."
  []
  (check-features)
  (perms/check-has-application-permission :setting)
  (setting/set-many! (assoc (zipmap (keys cloud-mb-to-smtp-settings) (repeat nil))
                            :cloud-smtp-enabled false))
  api/generic-204-no-content)

(api.macros/defendpoint :post "/test"
  "Send a test email using the SMTP Settings. You must be a superuser or have `setting` permission to do this.
  Returns `{:ok true}` if we were able to send the message successfully, otherwise a standard 400 error response."
  []
  (perms/check-has-application-permission :setting)
  (when-not (and (channel.settings/email-smtp-port) (channel.settings/email-smtp-host))
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
       :body   (humanize-error-messages mb-to-smtp-settings response)})))
