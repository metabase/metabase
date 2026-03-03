(ns metabase-enterprise.sso.integrations.slack-connect
  "Implementation of the Slack Connect backend for SSO.

   Slack Connect uses OIDC (OpenID Connect) for authentication, which only uses GET requests.
   Both the initial authorization request and the callback are handled via GET.

   Flow:
   1. User accesses GET /auth/sso/slack-connect
   2. Metabase redirects to Slack authorization endpoint
   3. User authenticates with Slack
   4. Slack redirects back to GET /auth/sso/slack-connect/callback?code=...&state=...
   5. Metabase exchanges code for tokens and creates session"
  (:require
   [java-time.api :as t]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- slack-redirect-uri
  "Generate the redirect URI for Slack OIDC callback."
  []
  (str (system/site-url) "/auth/sso/slack-connect/callback"))

(defn- check-slack-connect-prereqs!
  "Check that Slack Connect is available and enabled. Throws on failure."
  []
  (premium-features/assert-has-feature :sso-slack (tru "Slack Connect authentication"))
  (when-not (sso-settings/slack-connect-enabled)
    (throw (ex-info (tru "Slack Connect is not enabled")
                    {:status-code 400}))))

(defn sso-initiate
  "Initiate Slack Connect SSO flow. Redirects to Slack authorization endpoint."
  [request]
  (check-slack-connect-prereqs!)
  (log/infof "Slack Connect SSO initiate: auth-mode=%s, has-session-cookie=%s, current-user-id=%s, redirect-uri=%s"
             (sso-settings/slack-connect-authentication-mode)
             (boolean (get-in request [:cookies request/metabase-session-cookie :value]))
             api/*current-user-id*
             (slack-redirect-uri))
  (let [{:keys [redirect]} (:params request)
        _ (when (and (= "link-only" (sso-settings/slack-connect-authentication-mode))
                     (not api/*current-user-id*))
            (throw (ex-info (tru "Account linking requires an authenticated session")
                            {:status-code 401})))
        redirect-url (if redirect
                       (sso-utils/check-sso-redirect redirect)
                       "/")
        auth-result (auth-identity/authenticate :provider/slack-connect
                                                (assoc request
                                                       :authenticated-user api/*current-user*
                                                       :redirect-uri (slack-redirect-uri)
                                                       :final-redirect redirect-url))]
    (log/infof "Slack Connect SSO initiate auth result: success=%s, has-redirect-url=%s, browser-id=%s"
               (:success? auth-result)
               (boolean (:redirect-url auth-result))
               (:browser-id request))
    (cond
      (= :redirect (:success? auth-result))
      (sso/wrap-oidc-redirect auth-result
                              request
                              :slack-connect
                              redirect-url
                              {:browser-id (:browser-id request)})
      :else
      (throw (ex-info (or (:message auth-result) (tru "Failed to initiate Slack authentication"))
                      {:status-code 500})))))

(defn sso-callback
  "Handle Slack Connect OIDC callback with authorization code."
  [request]
  (check-slack-connect-prereqs!)
  (let [{:keys [code state error error_description]} (:params request)
        oidc-state-cookie (get-in request [:cookies "metabase.OIDC_STATE" :value])]
    (log/infof "Slack Connect SSO callback: has-code=%s, state=%s, oidc-state-cookie=%s, error=%s, error_description=%s"
               (boolean code) state oidc-state-cookie error error_description)
    (when-not oidc-state-cookie
      (log/warnf "Slack Connect callback missing OIDC state cookie. Request cookies: %s"
                 (keys (:cookies request))))
    (let [login-result (auth-identity/login! :provider/slack-connect
                                             (assoc request
                                                    :authenticated-user api/*current-user*
                                                    :code code
                                                    :state state
                                                    :oidc-provider :slack-connect
                                                    :redirect-uri (slack-redirect-uri)
                                                    :device-info (request/device-info request)))]
      (log/infof "Slack Connect SSO callback login result: success=%s, has-session=%s, has-user=%s, redirect-url=%s"
                 (:success? login-result)
                 (boolean (:session login-result))
                 (boolean (:user login-result))
                 (:redirect-url login-result))
      (cond
        (:success? login-result)
        (let [final-redirect (or (:redirect-url login-result) "/")
              base-response (-> (response/redirect final-redirect)
                                (sso/clear-oidc-state-cookie))]
          (log/infof "Slack authentication successful for user %s, setting session cookie=%s"
                     (get-in login-result [:user :email])
                     (boolean (:session login-result)))
          (if-let [session (:session login-result)]
            (request/set-session-cookies request
                                         base-response
                                         session
                                         (t/zoned-date-time (t/zone-id "GMT")))
            base-response))

        :else
        (let [error-msg (or (:message login-result) (tru "Slack authentication failed"))]
          (log/errorf "Slack authentication failed: %s (full result: %s)" error-msg (pr-str login-result))
          (throw (ex-info error-msg {:status-code 401})))))))
