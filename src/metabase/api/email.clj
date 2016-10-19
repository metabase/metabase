(ns metabase.api.email
  "/api/email endpoints"
  (:require [clojure.tools.logging :as log]
            [clojure.set :as set]
            [compojure.core :refer [GET PUT DELETE POST]]
            [metabase.api.common :refer :all]
            [metabase.config :as config]
            [metabase.email :as email]
            [metabase.models.setting :as setting]))

(def ^:private ^:const mb-to-smtp-settings
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

(defendpoint PUT "/"
  "Update multiple `Settings` values.  You must be a superuser to do this."
  [:as {settings :body}]
  {settings [Required Dict]}
  (check-superuser)
  (let [email-settings (select-keys settings (keys mb-to-smtp-settings))
        smtp-settings  (-> (set/rename-keys email-settings mb-to-smtp-settings)
                           (assoc :port (Integer/parseInt (:email-smtp-port settings))))
        response       (if-not config/is-test?
                         ;; in normal conditions, validate connection
                         (email/test-smtp-connection smtp-settings)
                         ;; for unit testing just respond with a success message
                         {:error :SUCCESS})]
    (if (= :SUCCESS (:error response))
      ;; test was good, save our settings
      (setting/set-many! email-settings)
      ;; test failed, return response message
      {:status 500
       :body   (humanize-error-messages response)})))

(defendpoint POST "/test"
  "Send a test email. You must be a superuser to do this."
  []
  (check-superuser)
  (let [response (email/send-message
                   :subject      "Metabase Test Email"
                   :recipients   [(:email @*current-user*)]
                   :message-type :text
                   :message      "Your Metabase emails are working — hooray!")]
    (if (= :SUCCESS (:error response))
      {:ok true}
      {:status 500
       :body   (humanize-error-messages response)})))

(define-routes)
