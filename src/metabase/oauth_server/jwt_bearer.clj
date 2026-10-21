(ns metabase.oauth-server.jwt-bearer
  "Exchange a signed JWT for an MCP access token using the JWT bearer grant (RFC 7523).

  The token belongs to the user named in the JWT."
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
  "Return whether the token endpoint accepts the JWT bearer grant.

  JWT authentication and the MCP server must be enabled."
  []
  (and (oauth-server/jwt-bearer-grant-enabled?) (mcp/mcp-enabled?)))

(defn- check-request!
  "Throw `ex-info` with the RFC 6749 `:error` if the request is refused before checking its assertion."
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

    (or (empty? scopes)
        (not-every? (set (mcp/v2-scopes)) scopes))
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
  "These `:error` values identify refused JWT logins whose `:message` was written by Metabase for the caller."
  #{:non-personal-user :missing-email :missing-exp-or-iat :future-iat :invalid-tenant})

(defn- refusal-description
  "Return `error_description` for a refused JWT login, or nil to use the token endpoint's generic one.

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
  "Log in through JWT authentication without creating a session.

  Return the user named in the JWT `assertion`, which must have `exp` and `iat` claims.
  Throw `ex-info` carrying `invalid_grant` and the [[refusal-description]] when the login is refused."
  [assertion request]
  (let [{:keys [success? user message] :as result}
        (try
          (auth-identity/login! :provider/jwt (assoc request
                                                     :token                    assertion
                                                     :session/skip?            true
                                                     :user/personal-only?      true
                                                     :jwt/require-exp-and-iat? true))
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
  "Issue an MCP access token to the user named in the JWT `assertion`.

  Return the RFC 6749 token response. The token carries `scopes`, or every MCP scope when `scopes` is nil,
  and is bound to the MCP endpoint, which `resource` must name when it is given.
  Throw `ex-info` carrying the RFC 6749 `:error` when the request is refused."
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
