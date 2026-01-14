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
   [metabase.api.response :as api.response]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping"
  "Health check endpoint for the Agent API."
  []
  {:message "pong"})

;;; ------------------------------------------------- Authentication -------------------------------------------------

(def ^:private ^:const max-token-age-seconds
  "Maximum age of JWT tokens in seconds. Matches the 3-minute limit used by JWT SSO."
  180)

(defn- decode-jwt
  "Decode and verify a JWT token. Returns the claims map if valid, nil if invalid."
  [token]
  (try
    (jwt/unsign token (sso-settings/jwt-shared-secret) {:max-age max-token-age-seconds})
    (catch Exception _
      nil)))

(defn- enforce-jwt-authentication
  "Middleware that validates JWT bearer tokens for Agent API requests.
   Extracts email from `sub` claim (with fallback to `email` claim) and looks up the user."
  [handler]
  (fn [{:keys [headers] :as request} respond raise]
    (let [auth-header (get headers "authorization")
          token       (when (and auth-header (str/starts-with? (u/lower-case-en auth-header) "bearer "))
                        (str/trim (subs auth-header 7)))
          claims      (when token (decode-jwt token))
          email       (or (:sub claims) (:email claims))
          user        (when email
                        (t2/select-one :model/User :email email :is_active true))]
      (if user
        (request/with-current-user (:id user)
          (handler request respond raise))
        (respond api.response/response-unauthentic)))))

(def ^:private +jwt-auth
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-jwt-authentication))

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes."
  (api.macros/ns-handler *ns* +jwt-auth))
