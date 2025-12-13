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
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- slack-redirect-uri
  "Generate the redirect URI for Slack OIDC callback."
  []
  (str (system/site-url) "/auth/sso"))

(def ^:private slack-connect-state-cookie
  "Name of the cookie containing state/nonce of the slack authorization flow."
  "metabase.SLACK_CONNECT_STATE")

(def ^:private slack-connect-nonce-cookie
  "Name of the cookie containing state/nonce of the slack authorization flow."
  "metabase.SLACK_CONNECT_NONCE")

(def ^:private slack-connect-redirect-cookie
  "Name of the cookie containing state/nonce of the slack authorization flow."
  "metabase.SLACK_CONNECT_REDIRECT")

(defmethod sso.i/sso-get :slack-connect
  [{{:keys [code state redirect]} :params
    cookies :cookies
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
                         (sso-utils/check-sso-redirect #p redirect)
                         "/")
          auth-result (auth-identity/authenticate :provider/slack-connect
                                                  (assoc request
                                                         :authenticated-user api/*current-user*
                                                         :redirect-uri (slack-redirect-uri)
                                                         :final-redirect redirect-url))]

      (cond
        (= :redirect (:success? auth-result))
        (-> (response/redirect (:redirect-url auth-result))
            ;; TODO(edpaget 2025-11-17): return an identity and connect this to the internal auth-identity
            (response/set-cookie slack-connect-state-cookie (:state auth-result))
            (response/set-cookie slack-connect-nonce-cookie (:nonce auth-result))
            (response/set-cookie slack-connect-redirect-cookie redirect-url))
        :else
        (throw (ex-info (or (:message auth-result) (tru "Failed to initiate Slack authentication"))
                        {:status-code 500}))))

    ;; Case 2: Callback with code - complete authentication
    code
    (let [;; Validate state matches what we stored
          stored-state (get-in cookies [slack-connect-state-cookie :value])
          stored-nonce (get-in cookies [slack-connect-nonce-cookie :value])
          stored-redirect (get-in cookies [slack-connect-redirect-cookie :value])

          _ (when-not (= state stored-state)
              (log/warnf "State mismatch: expected %s, got %s" stored-state state)
              (throw (ex-info (tru "Invalid state parameter - possible CSRF attack")
                              {:status-code 400})))

          login-result (auth-identity/login! :provider/slack-connect
                                             (assoc request
                                                    :authenticated-user api/*current-user*
                                                    :code code
                                                    :state state
                                                    :nonce stored-nonce
                                                    :redirect-uri (slack-redirect-uri)
                                                    :device-info (request/device-info request)))]

      (cond
        (:success? login-result)
        (let [final-redirect (or (:redirect-url login-result) stored-redirect)]
          (log/infof "Slack authentication successful for user %s" (get-in login-result [:user :email]))
          (request/set-session-cookies request
                                       (response/redirect final-redirect)
                                       (:session login-result)
                                       (t/zoned-date-time (t/zone-id "GMT"))))

        ;; Login failed
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
