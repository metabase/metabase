(ns metabase-enterprise.sso.integrations.slack-connect
  "Implementation of the Slack Connect backend for SSO.

   Slack Connect uses OIDC (OpenID Connect) for authentication, which only uses GET requests.
   Both the initial authorization request and the callback are handled via GET.

   Flow:
   1. User accesses GET /auth/sso?preferred_method=slack-connect
   2. Metabase redirects to Slack authorization endpoint
   3. User authenticates with Slack
   4. Slack redirects back to GET /auth/sso?code=...&state=...
   5. Metabase exchanges code for tokens and creates session"
  (:require
   [java-time.api :as t]
   [metabase-enterprise.sso.api.interface :as sso.i]
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
  (str (system/site-url) "/auth/sso"))

(defmethod sso.i/sso-get :slack-connect
  [{{:keys [code state redirect]} :params
    :as request}]
  ;; Check premium feature is available
  (premium-features/assert-has-feature :sso-slack (tru "Slack Connect authentication"))

  (when-not (sso-settings/slack-connect-enabled)
    (throw (ex-info (tru "Slack Connect is not enabled")
                    {:status-code 400})))

  (cond
    ;; Case 1: Initial request (no code) - start auth flow
    (not code)
    (let [_ (when (and (= "link-only" (sso-settings/slack-connect-authentication-mode))
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

      (cond
        (= :redirect (:success? auth-result))
        ;; Use encrypted cookie for state storage
        (sso/wrap-oidc-redirect auth-result
                                request
                                :slack-connect
                                redirect-url
                                {:browser-id (:browser-id request)})
        :else
        (throw (ex-info (or (:message auth-result) (tru "Failed to initiate Slack authentication"))
                        {:status-code 500}))))

    ;; Case 2: Callback with code - complete authentication
    ;; State validation happens inside login! via the OIDC provider
    code
    (let [login-result (auth-identity/login! :provider/slack-connect
                                             (assoc request
                                                    :authenticated-user api/*current-user*
                                                    :code code
                                                    :state state
                                                    :oidc-provider :slack-connect
                                                    :redirect-uri (slack-redirect-uri)
                                                    :device-info (request/device-info request)))]

      (cond
        (:success? login-result)
        (let [final-redirect (or (:redirect-url login-result) "/")
              base-response (-> (response/redirect final-redirect)
                                (sso/clear-oidc-state-cookie))]
          (log/infof "Slack authentication successful for user %s" (get-in login-result [:user :email]))
          ;; In link-only mode, there's no session to set - just return the redirect
          (if-let [session (:session login-result)]
            (request/set-session-cookies request
                                         base-response
                                         session
                                         (t/zoned-date-time (t/zone-id "GMT")))
            base-response))

        ;; Login failed (includes state validation failures)
        :else
        (let [error-msg (or (:message login-result) (tru "Slack authentication failed"))]
          (log/errorf "Slack authentication failed: %s" error-msg)
          (throw (ex-info error-msg {:status-code 401})))))))

;; OIDC only uses GET requests, so POST should not be used.
;; Return 405 Method Not Allowed.
(defmethod sso.i/sso-post :slack-connect
  [_request]
  {:status 405
   :headers {"Allow" "GET"}
   :body (tru "POST not supported for OIDC authentication. Use GET instead.")})
