(ns metabase.agent-api.auth
  "Authentication for the Agent API, in two modes.

   **Session-based.** The client exchanges a JWT at `/auth/sso` for a session token and passes it in
   `X-Metabase-Session`. The standard Metabase session middleware validates it before this middleware
   ever runs, so all that is left here is to give the request a scope set.

   **Stateless JWT.** The client passes `Authorization: Bearer <jwt>`, validated against the configured
   shared secret and max age. No session is created — good for one-off calls and simple integrations.

   Either way the request leaves here carrying `:token-scopes`, so downstream scope enforcement never
   has to special-case its absence."
  (:require
   [clojure.string :as str]
   [metabase.api.macros.scope :as scope]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- bearer-token
  "The token in a `Bearer <token>` authorization header, or nil when `auth-header` is not one."
  [auth-header]
  (when (and auth-header (str/starts-with? (u/lower-case-en auth-header) "bearer "))
    (str/trim (subs auth-header 7))))

(defn- error-response
  [error-type message]
  {:status  401
   :headers {"Content-Type" "application/json"}
   :body    {:error   error-type
             :message message}})

(defn- authenticate-with-jwt
  "Authenticate a stateless JWT. Returns `{:user <user>}` on success — plus `:scopes`, a parsed scope
   set, when the JWT carries a `scope` claim — or `{:error <type> :message <msg>}` on failure. Creates
   no session.

   Validation goes through `auth-identity/authenticate`, the same implementation `/auth/sso` uses, so
   the settings it honors are the settings the SSO login honors."
  [token]
  (let [result (auth-identity/authenticate :provider/jwt {:token token})]
    (if (:success? result)
      (if-let [user (when-let [email (get-in result [:user-data :email])]
                      (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))]
        (let [scope-entry (-> result :jwt-data (find :scope))]
          (cond-> {:user user}
            scope-entry (assoc :scopes (or (scope/parse-scopes (val scope-entry)) #{}))))
        ;; A valid JWT for an email nobody has gets the same refusal an invalid JWT gets: whether a user
        ;; exists is not something an unauthenticated caller may probe for.
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."})
      (case (:error result)
        :jwt-not-enabled {:error   "jwt_not_configured"
                          :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."}))))

(defn- enforce-authentication
  "Ring middleware that authenticates the request and guarantees `:token-scopes` on it.

   An already-authenticated request — a session, or the synthetic request an MCP tool call dispatches —
   keeps the scopes it arrived with, and gets `#{::scope/unrestricted}` when it carries none. A Bearer
   JWT derives its scopes from the token's `scope` claim, falling back to the request's own and finally
   to unrestricted."
  [handler]
  (fn [{:keys [headers metabase-user-id token-scopes] :as request} respond raise]
    (if metabase-user-id
      (handler (cond-> request
                 (not token-scopes) (assoc :token-scopes #{::scope/unrestricted}))
               respond raise)
      (let [auth-header (get headers "authorization")
            token       (bearer-token auth-header)]
        (cond
          (nil? auth-header)
          (respond (error-response "missing_authorization"
                                   (str "Authentication required. Use X-Metabase-Session header or "
                                        "Authorization: Bearer <jwt>.")))

          (nil? token)
          (respond (error-response "invalid_authorization_format"
                                   "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"))

          :else
          (let [result (authenticate-with-jwt token)]
            (if-let [user (:user result)]
              (do
                (when (and (:scopes result) token-scopes (not= (:scopes result) token-scopes))
                  (log/warn "JWT scopes" (:scopes result)
                            "differ from pre-existing token-scopes" token-scopes))
                (request/with-current-user (:id user)
                  (handler (assoc request :token-scopes (or (:scopes result)
                                                            token-scopes
                                                            #{::scope/unrestricted}))
                           respond raise)))
              (respond (error-response (:error result) (:message result))))))))))

(def +auth
  "Agent API authentication middleware. Supports both session-based and stateless JWT authentication."
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))
