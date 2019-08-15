(ns metabase.api.email
  "/api/email endpoints"
  (:require [clojure
             [data :as data]
             [set :as set]
             [string :as str]]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE POST PUT]]
            [metabase
             [config :as config]
             [email :as email]]
            [metabase.api.common :as api]
            [metabase.models.setting :as setting]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]))

(def ^:private mb-to-smtp-settings
  {:email-smtp-host     :host
   :email-smtp-username :user
   :email-smtp-password :pass
   :email-smtp-port     :port
   :email-smtp-security :security
   :email-from-address  :sender})

(defn- humanize-error-messages
  "Convert raw error message responses from our email functions into our normal api error response structure."
  [{:keys [error message]}]
  (when (not= :SUCCESS error)
    (log/warn "Problem connecting to mail server:" message)
    (let [conn-error  {:errors {:email-smtp-host "Wrong host or port"
                                :email-smtp-port "Wrong host or port"}}
          creds-error {:errors {:email-smtp-username "Wrong username or password"
                                :email-smtp-password "Wrong username or password"}}]
      (condp re-matches message
        ;; bad host = "Unknown SMTP host: foobar"
        #"^Unknown SMTP host:.*$"
        conn-error

        ;; host seems valid, but host/port failed connection = "Could not connect to SMTP host: localhost, port: 123"
        #"^Could not connect to SMTP host:.*$"
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
        {:message "Sorry, something went wrong.  Please try again."}))))

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
  (let [email-settings (select-keys settings (keys mb-to-smtp-settings))
        smtp-settings  (-> (set/rename-keys email-settings mb-to-smtp-settings)
                           (assoc :port (some-> (:email-smtp-port settings) Integer/parseInt)))
        ;; TODO - this is :thumbs_down`, we should just use `with-redefs` for `email/test-smtp-connection` where
        ;; needed in the tests. FIXME!
        response       (if-not config/is-test?
                         ;; in normal conditions, validate connection
                         (email/test-smtp-connection smtp-settings)
                         ;; for unit testing just respond with a success message
                         {:error :SUCCESS})
        tested-settings  (merge settings (select-keys response [:port :security]))
        [_ corrections _] (data/diff settings tested-settings)
        properly-named-corrections (set/rename-keys corrections (set/map-invert mb-to-smtp-settings))
        corrected-settings (merge email-settings properly-named-corrections)]
    (if (= :SUCCESS (:error response))
      ;; test was good, save our settings
      (assoc (setting/set-many! corrected-settings)
        :with-corrections (humanize-email-corrections properly-named-corrections))
      ;; test failed, return response message
      {:status 500
       :body   (humanize-error-messages response)})))

(api/defendpoint DELETE "/"
  "Clear all email related settings. You must be a superuser to ddo this"
  []
  (api/check-superuser)
  (setting/set-many! (zipmap (keys mb-to-smtp-settings) (repeat nil)))
  api/generic-204-no-content)

(api/defendpoint POST "/test"
  "Send a test email. You must be a superuser to do this."
  []
  (api/check-superuser)
  (let [response (email/send-message!
                   :subject      "Metabase Test Email"
                   :recipients   [(:email @api/*current-user*)]
                   :message-type :text
                   :message      "Your Metabase emails are working — hooray!")]
    (if (= :SUCCESS (:error response))
      {:ok true}
      {:status 500
       :body   (humanize-error-messages response)})))

(api/define-routes)
