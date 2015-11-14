(ns metabase.api.email
  "/api/email endpoints"
  (:require [compojure.core :refer [GET PUT DELETE POST]]
            [metabase.api.common :refer :all]
            [metabase.email :as email]
            [metabase.models.setting :as setting]
            [clojure.set :as set]))

(defonce ^:private ^:const email-settings
  {:email-smtp-host     :host
   :email-smtp-username :user
   :email-smtp-password :pass
   :email-smtp-port     :port
   :email-smtp-security :security
   :email-from-address  :from})

(defendpoint PUT "/"
  "Update multiple `Settings` values.  You must be a superuser to do this."
  [:as {settings :body}]
  {settings [Required Dict]}
  (check-superuser)
  (setting/set-all (select-keys settings (keys email-settings))))

(defendpoint POST "/test"
  "Send a test email. You must be a superuser to do this."
  []
  (check-superuser)
  (let [response (email/send-message
                   :subject      "Metabase Test Email"
                   :recipients   [(:email @*current-user*)]
                   :message-type :text
                   :message      "The Metabase emails are working, hooray!")]
    (if (= (:error response) :SUCCESS)
      response
      {:status 500
       :body   response})))

(define-routes)
