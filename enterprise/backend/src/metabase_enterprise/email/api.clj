(ns metabase-enterprise.email.api
  "/api/ee/email endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.channel.email :as email]
   [metabase.channel.settings :as channel.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(def ^:private mb-to-smtp-override-settings
  {:email-smtp-host-override     :host
   :email-smtp-username-override :user
   :email-smtp-password-override :pass
   :email-smtp-port-override     :port
   :email-smtp-security-override :security})

(defn- check-features []
  (when (not (premium-features/is-hosted?))
    (throw (ex-info (tru "API is not available on non-hosted servers.")
                    {:status-code 402}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/override"
  "Update multiple cloud email Settings. You must be a superuser or have `setting` permission to do this.
  Calling this automatically sets `cloud-smtp-enabled` to true if the settings are valid."
  [_route-params
   _query-params
   settings :- [:map
                [:email-smtp-host-override {:optional true} [:or string? nil?]]
                [:email-smtp-password-override {:optional true} [:or string? nil?]]
                [:email-smtp-port-override {:optional true} [:or int? nil?]]
                [:email-smtp-security-override {:optional true} [:or string? nil?]]
                [:email-smtp-username-override {:optional true} [:or string? nil?]]]]
  (check-features)

  ;; Validations match validation in settings, but pre-checking here to avoid attempting network checks for invalid settings.
  (when (and (:email-smtp-port-override settings)
             (not (#{465 587 2525} (:email-smtp-port-override settings))))
    (throw (ex-info (tru "Invalid email-smtp-port-override value")
                    {:status-code 400})))
  (when (and (:email-smtp-security-override settings)
             (not (#{:tls :ssl :starttls} (keyword (:email-smtp-security-override settings)))))
    (throw (ex-info (tru "Invalid email-smtp-security-override value")
                    {:status-code 400})))

  (u/prog1 (email/check-and-update-settings settings mb-to-smtp-override-settings (channel.settings/email-smtp-password-override))
    (when (nil? (:errors (:body <>))) (channel.settings/smtp-override-enabled! true))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/override"
  "Clear all cloud email related settings. You must be a superuser or have `setting` permission to do this."
  []
  (check-features)
  (perms/check-has-application-permission :setting)
  (setting/set-many! (assoc (zipmap (keys mb-to-smtp-override-settings) (repeat nil))
                            :smtp-override-enabled false))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/email` routes."
  (api.macros/ns-handler *ns* +auth))
