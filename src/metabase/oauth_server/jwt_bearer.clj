(ns metabase.oauth-server.jwt-bearer
  "The JWT bearer grant (RFC 7523), which exchanges a signed JWT for an MCP access token for the user it names."
  (:require
   [clojure.string :as str]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.events.core :as events]
   [metabase.mcp.core :as mcp]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.request.core :as request]
   [oidc-provider.store :as oidc.store]
   [oidc-provider.token :as oidc.token])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def grant-type
  "The RFC 7523 `grant_type` of a JWT bearer grant request."
  "urn:ietf:params:oauth:grant-type:jwt-bearer")

(def ^:private client-id "metabase-jwt-bearer")

(defn available?
  "True when the token endpoint takes the JWT bearer grant, which needs JWT authentication and the MCP server."
  []
  (and (oauth-server/jwt-bearer-grant-enabled?) (mcp/mcp-enabled?)))

(defn- check-request!
  "Throws `ex-info` carrying the RFC 6749 `:error` for a request that is refused before its assertion is checked."
  [assertion scopes resource]
  (cond
    (not (oauth-server/jwt-bearer-grant-enabled?))
    (throw (ex-info "JWT authentication is not enabled"
                    {:error "unsupported_grant_type", :error-description "JWT authentication is not enabled."}))

    (not (mcp/mcp-enabled?))
    (throw (ex-info "the MCP server is not enabled"
                    {:error "unsupported_grant_type", :error-description "The MCP server is not enabled."}))

    (str/blank? assertion)
    (throw (ex-info "no assertion was sent"
                    {:error "invalid_request", :error-description "The request must include an assertion."}))

    (not-every? (set (mcp/v2-scopes)) scopes)
    (throw (ex-info "a requested scope is not an MCP scope"
                    {:error             "invalid_scope"
                     :error-description (str "Request only MCP scopes, or omit scope to get all of them: "
                                             (str/join " " (mcp/v2-scopes)))}))

    (not (oauth-server/mcp-endpoint-resource? resource))
    (throw (ex-info "resource is not the MCP endpoint"
                    {:error             "invalid_target"
                     :error-description (str "The resource must be the MCP endpoint, "
                                             (oauth-server/mcp-resource-url))}))))

(def ^:private own-reason-errors
  "The `:error`s of a refused JWT login whose `:message` Metabase wrote for the caller."
  #{:non-personal-user :missing-email :invalid-tenant})

(defn- refusal-description
  "The `error_description` for a refused JWT login, or nil to leave the token endpoint's generic one.

  The login's `message` goes back only when Metabase wrote it for the caller: the login returned one of
  [[own-reason-errors]], or threw with a 4xx `status-code`. A JWT that fails verification gets a fixed description,
  since the verifier's message is library text."
  [{:keys [error status-code message]}]
  (cond
    (= :invalid-jwt error)
    "The JWT could not be verified."

    (or (own-reason-errors error) (<= 400 (or status-code 0) 499))
    (str message)))

(defn- log-in!
  "Logs in the user that the JWT `assertion` names through JWT authentication, without a session, and returns them.
  Throws `ex-info` carrying `invalid_grant` and the [[refusal-description]] when the login is refused."
  [assertion request]
  (let [{:keys [success? user message] :as result}
        (try
          (auth-identity/login! :provider/jwt (assoc request
                                                     :token               assertion
                                                     :session/skip?       true
                                                     :user/personal-only? true))
          (catch ExceptionInfo e
            {:message     (ex-message e)
             :status-code (:status-code (ex-data e))}))]
    (if success?
      user
      (throw (ex-info (str message) {:error "invalid_grant", :error-description (refusal-description result)})))))

(defn- check-mcp-access!
  "Throws `ex-info` carrying `unsupported_grant_type` unless the groups of the User with `user-id` allow MCP."
  [user-id]
  (when-not (request/with-current-user user-id
              (mcp.perms/enabled? (mcp.perms/policy-for-current-user)))
    (throw (ex-info (str "MCP access is not enabled for the groups of user " user-id)
                    {:error             "unsupported_grant_type"
                     :error-description "MCP access is not enabled for this user's groups."}))))

(defn exchange-jwt-for-token!
  "Issues an MCP access token to the user that the JWT `assertion` names, and returns the RFC 6749 token response.

  The token carries `scopes`, or every MCP scope when `scopes` is nil, and is bound to the MCP endpoint, which
  `resource` must name when it is given. Throws `ex-info` carrying the RFC 6749 `:error` when the request is refused."
  [provider request {:keys [assertion scopes resource]}]
  (let [scopes  (or scopes (mcp/v2-scopes))
        _       (check-request! assertion scopes resource)
        user-id (:id (log-in! assertion request))
        _       (check-mcp-access! user-id)
        token   (oidc.token/generate-access-token)
        ttl     (oauth-settings/oauth-server-access-token-ttl)
        granted (str/join " " scopes)
        bound   [(oauth-server/mcp-resource-url)]]
    (oidc.store/save-access-token (:token-store provider) token (str user-id) client-id scopes
                                  (+ (System/currentTimeMillis) (* 1000 ttl)) bound)
    (events/publish-event! :event/mcp-jwt-token-issued {:user-id user-id, :details {:scope granted}})
    {:access_token token
     :token_type   "Bearer"
     :expires_in   ttl
     :scope        granted
     :resource     bound}))
