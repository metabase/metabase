(ns metabase-enterprise.metabot-v3.agent-api.api
  "Customer-facing Agent API for headless BI applications.

  Endpoints are versioned (e.g., /v1/search) and require JWT authentication using
  the same jwt-shared-secret configured for JWT SSO.

  Unlike the internal metabot tools API which uses {:structured_output ...} / {:output ...}
  conventions, this external API uses standard HTTP semantics (2xx + data, 4xx/5xx + error)."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping" :- [:map [:message :string]]
  "Health check endpoint for the Agent API."
  []
  {:message "pong"})

;;; ------------------------------------------------- Authentication -------------------------------------------------

(def ^:private ^:const max-token-age-seconds
  "Maximum age of JWT tokens in seconds. Matches the 3-minute limit used by JWT SSO."
  180)

(defn- decode-jwt
  "Decode and verify a JWT token. Returns the claims map if valid, throws on error."
  [token]
  (jwt/unsign token (sso-settings/jwt-shared-secret) {:max-age max-token-age-seconds}))

(defn- extract-bearer-token
  "Extract the token from a Bearer authorization header.
  Assumes the header starts with 'Bearer ' (case-insensitive)."
  [auth-header]
  (str/trim (subs auth-header 7)))

(defn- error-response
  "Create a structured error response for authentication failures."
  [error-type message]
  {:status 401
   :headers {"Content-Type" "application/json"}
   :body {:error error-type
          :message message}})

(defn- enforce-jwt-authentication
  "Middleware that validates JWT bearer tokens for Agent API requests.
   Extracts email from `sub` claim (with fallback to `email` claim) and looks up the user.
   Returns structured error responses for different failure modes."
  [handler]
  (fn [{:keys [headers] :as request} respond raise]
    (let [auth-header (get headers "authorization")]
      (cond
        ;; No authorization header
        (not auth-header)
        (respond (error-response "missing_authorization" "Authorization header is required"))

        ;; Invalid authorization header format
        (not (str/starts-with? (u/lower-case-en auth-header) "bearer "))
        (respond (error-response "invalid_authorization_format" "Authorization header must be 'Bearer <token>'"))

        ;; JWT secret not configured
        (not (sso-settings/jwt-shared-secret))
        (respond (error-response "jwt_not_configured" "JWT shared secret is not configured"))

        ;; Valid bearer token format - attempt authentication
        :else
        (let [token (extract-bearer-token auth-header)]
          (try
            (let [claims (decode-jwt token)
                  email  (or (:sub claims) (:email claims))]
              (if-not email
                (respond (error-response "invalid_token" "Invalid or expired JWT token"))
                (let [user (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true)]
                  (if user
                    (request/with-current-user (:id user)
                      (handler request respond raise))
                    (respond (error-response "invalid_token" "Invalid or expired JWT token"))))))
            (catch Exception e
              (respond (error-response "invalid_token"
                                       (or (ex-message e) "Invalid or expired JWT token"))))))))))

(def ^:private +jwt-auth
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-jwt-authentication))

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes."
  (api.macros/ns-handler *ns* +jwt-auth))
