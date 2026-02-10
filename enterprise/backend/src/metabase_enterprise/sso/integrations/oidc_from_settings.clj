(ns metabase-enterprise.sso.integrations.oidc-from-settings
  "Implementation of the generic OIDC SSO backend backed by settings.

   Each OIDC provider has its own pair of endpoints:
   - GET /auth/sso/:slug          - Initiate OIDC flow
   - GET /auth/sso/:slug/callback - Handle OIDC callback

   Flow:
   1. User accesses GET /auth/sso/:slug
   2. Metabase redirects to provider's authorization endpoint
   3. User authenticates with the IdP
   4. IdP redirects back to GET /auth/sso/:slug/callback?code=...&state=...
   5. Metabase exchanges code for tokens and creates session"
  (:require
   [java-time.api :as t]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- oidc-provider-redirect-uri
  "Generate the redirect URI for an OIDC provider callback."
  [provider-slug]
  (str (system/site-url) "/auth/sso/" provider-slug "/callback"))

(defn sso-initiate
  "Initiate the OIDC SSO flow for the given provider slug."
  [provider-slug request]
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))

  (when-not (sso-settings/oidc-enabled)
    (throw (ex-info (tru "OIDC is not enabled")
                    {:status-code 400})))

  (let [provider-config (sso-settings/get-oidc-provider provider-slug)]
    (when-not provider-config
      (throw (ex-info (tru "OIDC provider ''{0}'' not found" provider-slug)
                      {:status-code 404})))
    (when-not (:enabled provider-config)
      (throw (ex-info (tru "OIDC provider ''{0}'' is not enabled" provider-slug)
                      {:status-code 400}))))

  (let [redirect-url (let [redirect (get-in request [:params :redirect])]
                       (if redirect
                         (sso-utils/check-sso-redirect redirect)
                         "/"))
        auth-result  (auth-identity/authenticate
                      :provider/oidc-from-settings
                      (assoc request
                             :oidc-provider-slug provider-slug
                             :redirect-uri (oidc-provider-redirect-uri provider-slug)
                             :final-redirect redirect-url))]
    (if (= :redirect (:success? auth-result))
      (sso/wrap-oidc-redirect auth-result
                              request
                              (keyword (str "oidc-" provider-slug))
                              redirect-url
                              {:browser-id (:browser-id request)})
      (throw (ex-info (or (:message auth-result) (tru "Failed to initiate OIDC authentication"))
                      {:status-code 500})))))

(defn sso-callback
  "Handle the OIDC callback for the given provider slug."
  [provider-slug {{:keys [code state]} :params, :as request}]
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))

  (let [login-result (auth-identity/login!
                      :provider/oidc-from-settings
                      (assoc request
                             :oidc-provider-slug provider-slug
                             :code code
                             :state state
                             :oidc-provider (keyword (str "oidc-" provider-slug))
                             :redirect-uri (oidc-provider-redirect-uri provider-slug)
                             :device-info (request/device-info request)))]
    (if (:success? login-result)
      (let [final-redirect (or (:redirect-url login-result) "/")
            base-response  (-> (response/redirect final-redirect)
                               (sso/clear-oidc-state-cookie))]
        (log/infof "OIDC authentication successful for provider %s, user %s"
                   provider-slug (get-in login-result [:user :email]))
        (if-let [session (:session login-result)]
          (request/set-session-cookies request
                                       base-response
                                       session
                                       (t/zoned-date-time (t/zone-id "GMT")))
          base-response))
      (let [error-msg (or (:message login-result) (tru "OIDC authentication failed"))]
        (log/errorf "OIDC authentication failed for provider %s: %s" provider-slug error-msg)
        (throw (ex-info error-msg {:status-code 401}))))))
