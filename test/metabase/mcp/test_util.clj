(ns metabase.mcp.test-util
  "Helpers for tests that call the MCP endpoint over HTTP. The endpoint serves only OAuth bearer tokens bound to the MCP
  resource, so these mint such a token for a test user and send it the way an MCP client does."
  (:require
   [metabase.mcp.paths :as mcp.paths]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def all-scopes
  "Every MCP v2 scope, as a set: what a test that does not exercise scopes grants its token."
  (set mcp.paths/v2-surface-scopes))

(def ^:private default-site-url
  "The Site URL these helpers use when a test has not set one: the OAuth provider and the resource binding both need
  one."
  "http://localhost:3000")

(def ^:private client-id
  "The `client_id` of the OAuth client these helpers mint tokens against."
  "mcp-test-util-client")

(defonce ^:private tokens (atom {}))

(defn- ensure-client! []
  (when-not (t2/exists? :model/OAuthClient :client_id client-id)
    (t2/insert! :model/OAuthClient {:client_id         client-id
                                    :redirect_uris     ["https://example.com/callback"]
                                    :grant_types       ["authorization_code"]
                                    :response_types    ["code"]
                                    :scopes            ["openid"]
                                    :registration_type "static"})))

(defn- token-for!
  "A live access token for `username` holding `scopes` and bound to the MCP resource. Cached, and minted again when a
  test has deleted, revoked or rolled back the cached one."
  [username scopes]
  (let [k [username (set scopes) (system/site-url)]]
    (or (when-let [token (get @tokens k)]
          (when (oauth-server/resolve-access-token token)
            token))
        (do (ensure-client!)
            (let [token (oauth-server.tu/insert-access-token! (mt/user->id username) client-id scopes
                                                              :resource (oauth-server.tu/mcp-resource))]
              (swap! tokens assoc k token)
              token)))))

(defn do-with-site-url!
  "Call `thunk` with the Site URL set, keeping the one the test set if any."
  [thunk]
  (if (system/site-url)
    (thunk)
    (mt/with-temporary-setting-values [site-url default-site-url]
      (thunk))))

(defn bearer-headers!
  "The `Authorization` header of an MCP-bound OAuth token for `username` (default `:crowberto`) holding `scopes`
  (default [[all-scopes]]). Needs the Site URL set; see [[do-with-site-url!]]."
  ([] (bearer-headers! :crowberto))
  ([username] (bearer-headers! username all-scopes))
  ([username scopes]
   {"authorization" (str "Bearer " (token-for! username scopes))}))

(defn- with-auth-header
  "Client `args` (as after the credentials of [[client/client-full-response]]) with `headers` merged into the
  request options."
  [headers [method & more]]
  (let [[status more] (if (integer? (first more)) [(first more) (rest more)] [nil more])
        [url & more]  more
        [opts more]   (if (and (map? (first more)) (contains? (first more) :request-options))
                        [(first more) (rest more)]
                        [{} more])]
    (concat [method] (when status [status]) [url]
            [(update-in opts [:request-options :headers] #(merge headers %))]
            more)))

(defn client-full-response!
  "Like [[client/client-full-response]], authenticated as `username` with an MCP-bound OAuth token holding every MCP
  scope instead of a session. `args` are what follows the credentials there: method, optional expected status, url,
  optional request options, optional body."
  [username & args]
  (do-with-site-url!
   #(apply client/client-full-response (with-auth-header (bearer-headers! username) args))))
