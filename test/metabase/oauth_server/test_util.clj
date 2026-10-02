(ns metabase.oauth-server.test-util
  "Helpers for tests that exercise the OAuth server."
  (:require
   [metabase.mcp.core :as mcp]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [oidc-provider.util :as oidc.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro with-oauth-client
  "Execute `body` with a freshly registered `oauth_client` row, binding `client-id-binding` to its
   `client_id`, and delete the row when `body` exits. Save test tokens against this client id —
   see [[metabase.oauth-server.core/resolve-access-token]] for why a token needs a live client."
  [[client-id-binding] & body]
  `(mt/with-temp [:model/OAuthClient {~client-id-binding :client_id}
                  {:client_id         (str (random-uuid))
                   :redirect_uris     ["https://example.com/callback"]
                   :grant_types       ["authorization_code"]
                   :response_types    ["code"]
                   :scopes            ["openid"]
                   :registration_type "static"}]
     ~@body))

(defn mcp-resource
  "The RFC 8707 resource indicator of the canonical MCP endpoint, as a token issued for MCP stores it."
  []
  [(str (system/site-url) (mcp/mcp-canonical-path))])

(defn insert-access-token!
  "Insert an OAuth access token row for `user-id` on `client-id` holding `scopes`, and return the raw token to
  present as a bearer. `:resource` is the stored RFC 8707 binding (nil for a REST token; pass [[mcp-resource]] for
  a token used at the MCP endpoint), and `:expiry` defaults to an hour from now. The row is written the way an
  issued token is: hashed, against a live client. Call inside `with-model-cleanup`."
  [user-id client-id scopes & {:keys [resource expiry]}]
  (let [token (str (random-uuid))]
    (t2/insert! :model/OAuthAccessToken
                (cond-> {:token     (oidc.util/hash-token token)
                         :user_id   user-id
                         :client_id client-id
                         :scope     (vec scopes)
                         :expiry    (or expiry (+ (System/currentTimeMillis) 3600000))}
                  resource (assoc :resource (vec resource))))
    token))
