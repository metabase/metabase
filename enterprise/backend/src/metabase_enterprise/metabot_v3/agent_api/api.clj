(ns metabase-enterprise.metabot-v3.agent-api.api
  "Customer-facing Agent API for headless BI applications.
  Endpoints are versioned (e.g., /v1/search) and use standard HTTP semantics."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.util :as u]
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

(defn- authenticate-with-jwt
  "Authenticate a request using a stateless JWT. Returns {:user <user>} on success,
   or {:error <type> :message <msg>} on failure. Does NOT create a session.

   Uses auth-identity/authenticate to validate the JWT, which reuses the same
   implementation as the /auth/sso endpoint and handles all settings validation."
  [token]
  (let [result (auth-identity/authenticate :provider/jwt {:token token})]
    (if (:success? result)
      ;; JWT is valid - look up user from the email extracted by the JWT provider
      ;; The provider uses jwt-attribute-email setting to extract the email from claims
      (if-let [user (when-let [email (get-in result [:user-data :email])]
                      (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))]
        {:user user}
        ;; Don't reveal whether the user exists or not - use same error as invalid JWT
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."})
      ;; Authentication failed - map error to agent API format
      (case (:error result)
        :jwt-not-enabled {:error   "jwt_not_configured"
                          :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
        ;; Default: use generic invalid JWT message (don't leak details)
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."}))))

;;; -------------------------------------------------- Middleware ----------------------------------------------------

(defn- enforce-authentication
  "Middleware that ensures requests are authenticated.

   Supports two authentication modes:
   - **Session-based**: Uses `X-Metabase-Session` header, validated by standard Metabase
     session middleware (which runs before this). If `:metabase-user-id` is set on the
     request, the user is already authenticated.
   - **Stateless JWT**: Uses `Authorization: Bearer <jwt>` header. The JWT is validated
     using the same auth-identity system as the /auth/sso endpoint."
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
