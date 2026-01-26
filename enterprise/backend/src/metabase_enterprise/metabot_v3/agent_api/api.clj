(ns metabase-enterprise.metabot-v3.agent-api.api
  "Customer-facing Agent API for headless BI applications.

  Endpoints are versioned (e.g., /v1/search) and require Bearer token authentication.
  Supports both session tokens and JWTs for authorization.

  Unlike the internal metabot tools API which uses {:structured_output ...} / {:output ...}
  conventions, this external API uses standard HTTP semantics (2xx + data, 4xx/5xx + error)."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.request.core :as request]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Settings ----------------------------------------------------

(defsetting agent-api-jwt-max-age
  (deferred-tru "Maximum age in seconds for JWT tokens used with the Agent API. Controls how long stateless JWTs are valid for API authorization.")
  :type       :integer
  :default    3600
  :visibility :settings-manager
  :feature    :metabot-v3
  :export?    true
  :audit      :getter
  :doc        "The number of seconds that JWT tokens are valid for Agent API authorization. Default is 3600 (1 hour).")

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping" :- [:map [:message :string]]
  "Health check endpoint for the Agent API."
  []
  {:message "pong"})

;;; ------------------------------------------------- Authentication -------------------------------------------------
;;
;; The Agent API supports two authentication modes:
;;
;; 1. **Session-based**: Client exchanges JWT at `/auth/sso` endpoint to get a session token,
;;    then uses that session token for all subsequent requests. The session token is a UUID
;;    that references a server-side session. Good for long-running connections.
;;
;; 2. **Stateless JWT**: Client passes a JWT directly on each request. The JWT is validated
;;    and the user is looked up from claims, but no session is created. Good for simple
;;    integrations and one-off API calls.
;;
;; Both modes use Bearer token authentication: `Authorization: Bearer <token>`

(def ^:private uuid-pattern
  "Pattern matching UUID format (session tokens are UUIDs)."
  #"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

(defn- extract-bearer-token
  "Extract the token from a Bearer authorization header."
  [auth-header]
  (when (and auth-header (str/starts-with? (u/lower-case-en auth-header) "bearer "))
    (str/trim (subs auth-header 7))))

(defn- error-response
  "Create a 401 error response with structured JSON body."
  [error-type message]
  {:status  401
   :headers {"Content-Type" "application/json"}
   :body    {:error   error-type
             :message message}})

;;; -------------------------------------------- Stateless JWT Authentication --------------------------------------------

(defn- decode-and-verify-jwt
  "Decode and verify a JWT token using the configured shared secret and agent API max-age.
   Returns the claims map if valid, or nil if invalid/expired."
  [token]
  (try
    (jwt/unsign token
                (sso-settings/jwt-shared-secret)
                {:max-age (agent-api-jwt-max-age)})
    (catch clojure.lang.ExceptionInfo e
      (log/debugf "JWT validation failed: %s" (ex-message e))
      nil)
    (catch Exception e
      (log/debugf "Unexpected error validating JWT: %s" (ex-message e))
      nil)))

(defn- jwt-claims->user
  "Look up an active user from JWT claims. Returns the user map or nil if not found.
   Expects email in either the 'email' claim or 'sub' claim."
  [claims]
  (when-let [email (or (:email claims) (:sub claims))]
    (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true)))

(defn- authenticate-with-jwt
  "Authenticate a request using a stateless JWT. Returns {:user <user>} on success,
   or {:error <type> :message <msg>} on failure. Does NOT create a session."
  [token]
  (cond
    (str/blank? (sso-settings/jwt-shared-secret))
    {:error   "jwt_not_configured"
     :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}

    :else
    (if-let [claims (decode-and-verify-jwt token)]
      (if-let [user (jwt-claims->user claims)]
        {:user user}
        {:error   "user_not_found"
         :message "No active user found for the email in this JWT."})
      {:error   "invalid_jwt"
       :message "Invalid or expired JWT token."})))

;;; --------------------------------------------- Bearer Token Middleware ---------------------------------------------

(defn- enforce-bearer-authentication
  "Middleware that authenticates requests using Bearer tokens.

   Supports two token types:
   - **Session tokens** (UUID format): Passed through to Metabase's session middleware
     via the X-Metabase-Session header. Session validation happens downstream.
   - **JWTs** (non-UUID): Validated directly using the jwt-shared-secret and
     agent-api-jwt-max-age settings. User is bound for the request without creating a session."
  [handler]
  (fn [{:keys [headers] :as request} respond raise]
    (let [auth-header  (get headers "authorization")
          bearer-token (extract-bearer-token auth-header)]
      (cond
        ;; No authorization header at all
        (nil? auth-header)
        (respond (error-response "missing_authorization"
                                 "Authorization header is required."))

        ;; Authorization header present but not Bearer format
        (nil? bearer-token)
        (respond (error-response "invalid_authorization_format"
                                 "Authorization header must use Bearer scheme: Authorization: Bearer <token>"))

        ;; UUID format = session token, delegate to session middleware
        (re-matches uuid-pattern bearer-token)
        (handler (assoc-in request [:headers "x-metabase-session"] bearer-token) respond raise)

        ;; Non-UUID = JWT, authenticate directly
        :else
        (let [result (authenticate-with-jwt bearer-token)]
          (if-let [user (:user result)]
            (request/with-current-user (:id user)
              (handler request respond raise))
            (respond (error-response (:error result) (:message result)))))))))

(def ^:private +bearer-auth
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-bearer-authentication))

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes."
  (api.macros/ns-handler *ns* +bearer-auth))
