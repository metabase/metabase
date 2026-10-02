(ns metabase.mcp.ui-test-util
  "Helpers for tests that call the `/api/embed-mcp` handlers the way the MCP Apps iframe does: with a UI credential
  and the MCP session id it was minted for. A credential is minted from a live OAuth access token bound to the MCP
  resource, as the MCP endpoint's sessions are."
  (:require
   [metabase.lib.core :as lib]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.test-util :as mcp.tu]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [oidc-provider.util :as oidc.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def query-scopes
  "The scopes the iframe's query routes cost."
  #{"agent:query:run"})

(def ^:private client-id
  "The `client_id` of the OAuth client the access tokens behind these credentials are issued to."
  "mcp-ui-test-util-client")

(defn- ensure-client! []
  (when-not (t2/exists? :model/OAuthClient :client_id client-id)
    (t2/insert! :model/OAuthClient {:client_id         client-id
                                    :redirect_uris     ["https://example.com/callback"]
                                    :grant_types       ["authorization_code"]
                                    :response_types    ["code"]
                                    :scopes            ["openid"]
                                    :registration_type "static"})))

(defn access-token-id!
  "The id of a new OAuth access token row for `user-id` holding `scopes`. By default the token is bound to the MCP
  resource and live; `:resource` and `:expiry` override that, as in
  [[metabase.oauth-server.test-util/insert-access-token!]]."
  [user-id scopes & {:as options}]
  (mcp.tu/do-with-site-url!
   (fn []
     (ensure-client!)
     (let [token (oauth-server.tu/insert-access-token! user-id client-id scopes
                                                       (merge {:resource (oauth-server.tu/mcp-resource)} options))]
       (t2/select-one-pk :model/OAuthAccessToken :token (oidc.util/hash-token token))))))

(defn credential!
  "A UI credential for `user-id` on MCP session `session-id` holding `scopes`, minted from a new live MCP access
  token."
  [session-id user-id scopes]
  (mcp.session/issue-ui-credential session-id user-id scopes (access-token-id! user-id scopes)))

(defn ui-auth!
  "A fresh MCP session for `username` and a UI credential minted for it holding `scopes` (default
  [[query-scopes]]), as `{:user-id :session-id :token-id :credential}`."
  ([username]
   (ui-auth! username query-scopes))
  ([username scopes]
   (let [user-id    (mt/user->id username)
         session-id (mcp.session/create! user-id)
         token-id   (access-token-id! user-id scopes)]
     {:user-id    user-id
      :session-id session-id
      :token-id   token-id
      :credential (mcp.session/issue-ui-credential session-id user-id scopes token-id)})))

(defn encode-query
  "`query`, a lib query, in the base64 form a query handle stores."
  [query]
  (-> query lib/prepare-for-serialization json/encode u/encode-base64))

(defn decode-query
  "The query map stored in base64 `encoded`, as a handle stores it."
  [encoded]
  (-> encoded u/decode-base64 json/decode+kw))

(defn store-query-handle!
  "Store `query`, a lib query, under a new handle owned by `user-id` on MCP session `session-id`. Returns the handle."
  [session-id user-id query]
  (mcp.session/store-handle! session-id user-id (encode-query query)))

(defn headers
  "The request headers the iframe sends for `auth`, from [[ui-auth!]]."
  [{:keys [credential session-id]}]
  (cond-> {}
    credential (assoc "x-metabase-mcp-ui-auth" credential)
    session-id (assoc "mcp-session-id" session-id)))

(defn ui-request
  "Send `method` to `url` with the iframe's headers for `auth`, and `body` when given. `expected-status` may be nil.
  Returns the full response. Runs with the Site URL the credential's access token was bound under."
  ([auth method expected-status url]
   (ui-request auth method expected-status url nil))
  ([auth method expected-status url body]
   (mcp.tu/do-with-site-url!
    #(apply client/client-full-response
            (concat [method]
                    (when expected-status [expected-status])
                    [url {:request-options {:headers (headers auth)}}]
                    (when (some? body) [body]))))))
