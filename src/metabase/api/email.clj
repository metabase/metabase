(ns metabase.api.email
  "/api/email endpoints"
  (:require [clojure.data :as data]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE POST PUT]]
            [metabase.api.common :as api]
            [metabase.email :as email]
            [metabase.models.setting :as setting]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]))

(def ^:private mb-to-smtp-settings
  {:email-smtp-host     :host
   :email-smtp-username :user
   :email-smtp-password :pass
   :email-smtp-port     :port
   :email-smtp-security :security
   :email-from-address  :sender})

(defn- humanize-error-messages
  "Convert raw error message responses from our email functions into our normal api error response structure."
  [{::email/keys [error]}]
  (when error
    (let [conn-error  {:errors {:email-smtp-host "Wrong host or port"
                                :email-smtp-port "Wrong host or port"}}
          creds-error {:errors {:email-smtp-username "Wrong username or password"
                                :email-smtp-password "Wrong username or password"}}
          message     (str/join ": " (map ex-message (u/full-exception-chain error)))]
          (log/warn "Problem connecting to mail server:" message)
      (condp re-find message
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

        ;; everything else :(
        #".*"
        {:message (str "Sorry, something went wrong. Please try again. Error: " message)}))))

(defn- humanize-email-corrections
  "Formats warnings when security settings are autocorrected."
  [corrections]
  (into
   {}
   (for [[k v] corrections]
     [k (tru "{0} was autocorrected to {1}"
             (name (mb-to-smtp-settings k))
             (str/upper-case v))])))

(api/defendpoint PUT "/"
  "Update multiple email Settings. You must be a superuser to do this."
  [:as {settings :body}]
  {settings su/Map}
  (api/check-superuser)
  (let [settings (-> settings
                     (select-keys (keys mb-to-smtp-settings))
                     (set/rename-keys mb-to-smtp-settings))
        settings (cond-> settings
                   (string? (:port settings))     (update :port #(Long/parseLong ^String %))
                   (string? (:security settings)) (update :security keyword))
        response (email/test-smtp-connection settings)]
    (if-not (::email/error response)
      ;; test was good, save our settings
      (assoc (setting/set-many! (set/rename-keys response (set/map-invert mb-to-smtp-settings)))
             :with-corrections  (let [[_ corrections] (data/diff settings response)]
                                  (-> corrections
                                      (set/rename-keys (set/map-invert mb-to-smtp-settings))
                                      humanize-email-corrections)))
      ;; test failed, return response message
      {:status 400
       :body   (humanize-error-messages response)})))

(api/defendpoint DELETE "/"
  "Clear all email related settings. You must be a superuser to ddo this"
  []
  (api/check-superuser)
  (setting/set-many! (zipmap (keys mb-to-smtp-settings) (repeat nil)))
  api/generic-204-no-content)

(api/defendpoint POST "/test"
  "Send a test email using the SMTP Settings. You must be a superuser to do this. Returns `{:ok true}` if we were able
  to send the message successfully, otherwise a standard 400 error response."
  []
  (api/check-superuser)
  (let [response (email/send-message!
                   :subject      "Metabase Test Email"
                   :recipients   [(:email @api/*current-user*)]
                   :message-type :text
                   :message      "Your Metabase emails are working — hooray!")]
    (if-not (::email/error response)
      {:ok true}
      {:status 400
       :body   (humanize-error-messages response)})))

(api/define-routes)
