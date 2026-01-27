(ns metabase-enterprise.metabot-v3.agent-api.api
  "Customer-facing Agent API for headless BI applications.
  Endpoints are versioned (e.g., /v1/search) and use standard HTTP semantics."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.settings :as metabot-settings]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
;;    then passes it via `X-Metabase-Session` header. The standard Metabase session middleware
;;    handles validation and expiration checking automatically.
;;
;; 2. **Stateless JWT**: Client passes a JWT via `Authorization: Bearer <jwt>` header.
;;    The JWT is validated using the configured shared secret and max-age settings.
;;    Good for simple integrations and one-off API calls.

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
                {:max-age (metabot-settings/agent-api-jwt-max-age)})
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
        ;; Don't reveal whether the user exists or not - use same error as invalid JWT
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."})
      {:error   "invalid_jwt"
       :message "Invalid or expired JWT token."})))

;;; -------------------------------------------------- Middleware ----------------------------------------------------

(defn- enforce-authentication
  "Middleware that ensures requests are authenticated.

   Supports two authentication modes:
   - **Session-based**: Uses `X-Metabase-Session` header, validated by standard Metabase
     session middleware (which runs before this). If `:metabase-user-id` is set on the
     request, the user is already authenticated.
   - **Stateless JWT**: Uses `Authorization: Bearer <jwt>` header. The JWT is validated
     directly using jwt-shared-secret and agent-api-jwt-max-age settings."
  [handler]
  (fn [{:keys [headers metabase-user-id] :as request} respond raise]
    (cond
      ;; Already authenticated via X-Metabase-Session (standard middleware handled it)
      metabase-user-id
      (handler request respond raise)

      ;; Not authenticated via session - check for Bearer JWT
      :else
      (let [auth-header  (get headers "authorization")
            bearer-token (extract-bearer-token auth-header)]
        (cond
          ;; No authorization header and no session
          (nil? auth-header)
          (respond (error-response "missing_authorization"
                                   "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."))

          ;; Authorization header present but not Bearer format
          (nil? bearer-token)
          (respond (error-response "invalid_authorization_format"
                                   "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"))

          ;; Validate JWT
          :else
          (let [result (authenticate-with-jwt bearer-token)]
            (if-let [user (:user result)]
              (request/with-current-user (:id user)
                (handler request respond raise))
              (respond (error-response (:error result) (:message result))))))))))

(def ^:private +auth
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes."
  (api.macros/ns-handler *ns* +auth))
