(ns metabase.channel.api.email
  "/api/email endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.email :as email]
   [metabase.channel.settings :as channel.settings]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]))

(set! *warn-on-reflection* true)

(def ^:private mb-to-smtp-settings
  {:email-smtp-host     :host
   :email-smtp-username :user
   :email-smtp-password :pass
   :email-smtp-port     :port
   :email-smtp-security :security})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
  (email/check-and-update-settings settings mb-to-smtp-settings (channel.settings/email-smtp-password)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/"
  "Clear all email related settings. You must be a superuser or have `setting` permission to do this."
  []
  (perms/check-has-application-permission :setting)
  (setting/set-many! (zipmap (keys mb-to-smtp-settings) (repeat nil)))
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
       :body   (email/humanize-error-messages mb-to-smtp-settings response)})))
