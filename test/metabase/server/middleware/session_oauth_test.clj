(ns metabase.server.middleware.session-oauth-test
  "Tests for the OAuth bearer-token bridge in the core session middleware — the single place an OAuth
  access token authenticates a request to the general (`/api/*`) API, and the single place the granted
  OAuth scopes are mapped onto `:token-scopes` for the scope-enforcement middleware."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   ;; Loaded for its load-time side effects: it registers the agent API endpoints, from which the
   ;; OAuth provider derives its scopes-supported (see [[metabase.mcp.core/all-scopes]]). In a full
   ;; server boot [[metabase.api-routes.routes]] loads it; the isolated test classpath does not
   ;; mount the routes, so require it here as that route ns does.
   [metabase.agent-api.api]
   [metabase.api.macros.scope :as scope]
   [metabase.initialization-status.core :as init-status]
   [metabase.mcp.http-handler :as mcp.http-handler]
   [metabase.mcp.paths :as mcp.paths]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.events.revoke-on-deactivation] ; for side effects: revokes tokens on deactivation
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; The OAuth bearer path is gated on initialization being complete (like the session/api-key paths);
;; the isolated test runner never boots the web server, so mark init complete as session_test does.
(init-status/set-complete!)

(def ^:private merge-current-user-info
  (partial #'mw.session/merge-current-user-info mcp.http-handler/options))

(def ^:private oauth-token->token-scopes
  (partial #'mw.session/oauth-token->token-scopes oauth-server/full-access-scope))

(defn- bearer-request [token]
  {:headers {"authorization" (str "Bearer " token)}})

(defn- save-access-token!
  "Persist an OAuth access token into the live provider's token store (the one [[oauth-server/resolve-access-token]]
   reads from) for the given user, client, scopes, and expiry (epoch millis). `client-id` should come from
   [[oauth-server.tu/with-oauth-client]]."
  [token user-id client-id scopes expiry]
  (oidc.store/save-access-token (:token-store (oauth-server/get-provider))
                                token (str user-id) client-id (vec scopes) expiry nil))

(defn- revoke-access-token!
  "Revoke a token in the live provider's token store, as the `/oauth/revoke` endpoint does on logout."
  [token]
  (oidc.store/revoke-token (:token-store (oauth-server/get-provider)) token))

;; Wall-clock epoch millis for token expiry timestamps (not duration measurements) — use Date/inst-ms
;; rather than System/currentTimeMillis, matching the oauth-server store tests.
(defn- now-ms [] (inst-ms (java.util.Date.)))
(defn- in-one-hour [] (+ (now-ms) 3600000))
(defn- one-hour-ago [] (- (now-ms) 3600000))

;;; ----------------------------------------- scope mapping (the trust hinge) -----------------------------------------

(deftest oauth-token->token-scopes-test
  (testing "a token carrying the full-access scope maps to the unrestricted sentinel (general REST reachable)"
    (is (= #{::scope/unrestricted}
           (oauth-token->token-scopes #{oauth-server/full-access-scope})))
    (is (= #{::scope/unrestricted}
           (oauth-token->token-scopes #{oauth-server/full-access-scope "agent:query:execute"}))))
  (testing "any narrower scope set is passed through verbatim (only opted-in agent endpoints reachable)"
    (is (= #{"agent:query:execute"}
           (oauth-token->token-scopes #{"agent:query:execute"})))
    (is (= #{} (oauth-token->token-scopes #{})))))

(deftest token-scopes-satisfy-scope-middleware-test
  (testing "the full-access mapping passes endpoints that declare no :scope; a narrow one is rejected"
    (let [reached  (fn [token-scopes]
                     (let [p       (promise)
                           wrapped (scope/ensure-scopes-checked
                                    (fn [_ respond _] (respond {:status 200})))]
                       (wrapped {:token-scopes token-scopes}
                                (fn [resp] (deliver p (:status resp)))
                                (fn [e] (deliver p e)))
                       @p))]
      (is (= 200 (reached (oauth-token->token-scopes #{oauth-server/full-access-scope}))))
      (is (= 403 (reached (oauth-token->token-scopes #{"agent:query:execute"})))))))

;;; -------------------------------------------- end-to-end bridge (DB-backed) ----------------------------------------

;; The bearer bridge builds the OAuth provider (via `get-provider`), whose config derives its
;; issuer/endpoints from `site-url` — unset, that fails the provider's `ProviderSetup` schema. Set
;; it for every test that resolves a token, matching the other oauth-server tests.

(deftest bearer-bridge-full-access-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [user-id (mt/user->id :rasta)
              token   (str (random-uuid))]
          (save-access-token! token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
          (let [req (merge-current-user-info (bearer-request token))]
            (testing "resolves the bearer token to the user"
              (is (= user-id (:metabase-user-id req))))
            (testing "marks the request as oauth-authenticated"
              (is (= "oauth" (:embedding/auth-method req))))
            (testing "grants unrestricted token-scopes so the whole REST API is reachable"
              (is (= #{::scope/unrestricted} (:token-scopes req))))))))))

(deftest bearer-bridge-narrow-scope-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [user-id (mt/user->id :rasta)
              token   (str (random-uuid))]
          (save-access-token! token user-id client-id ["agent:query:execute"] (in-one-hour))
          (let [req (merge-current-user-info (bearer-request token))]
            (testing "resolves the user but only carries the narrow granted scopes"
              (is (= user-id (:metabase-user-id req)))
              (is (= #{"agent:query:execute"} (:token-scopes req))))))))))

(deftest bearer-bridge-marks-oauth-authentication-test
  (testing "GHY-4542: a request the bearer bridge authenticated is marked as OAuth-authenticated, which is what the
            scope middleware and the MCP transport key their fail-closed checks on"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (oauth-server.tu/with-oauth-client [client-id]
          (let [token (str (random-uuid))]
            (save-access-token! token (mt/user->id :rasta) client-id ["agent:query:execute"] (in-one-hour))
            (is (true? (:authenticated-via-oauth? (merge-current-user-info (bearer-request token)))))))))))

(defn- passes-scope-middleware?
  "Whether `request` gets through both [[scope/enforce-scope]] and [[scope/ensure-scopes-checked]]."
  [request]
  (let [status (fn [wrapped]
                 (let [p (promise)]
                   (wrapped request #(deliver p (:status %)) #(deliver p %))
                   (deref p 10000 ::timeout)))
        ok     (fn [_ respond _] (respond {:status 200}))]
    (= [200 200] [(status ((scope/enforce-scope "agent:query:execute") ok))
                  (status (scope/ensure-scopes-checked ok))])))

(deftest bearer-bridge-refuses-token-without-scopes-test
  (testing "GHY-4542: an access token with no scopes must not authenticate. Downstream, nil `:token-scopes` means
            scope-unaware auth and passes as unrestricted, so the only thing keeping such a token from becoming
            unrestricted would otherwise be an empty set surviving every hop. /oauth/authorize no longer issues
            one, so these are minted straight into the store."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      ;; Commit the client row instead of holding `with-temp`'s rollback-only transaction open across the four HTTP
      ;; round-trips below. The request runs on a conveyed connectable, so anything in its path that commits
      ;; implicitly -- the app DB creates its search index tables lazily, and DDL commits implicitly on H2 and MySQL
      ;; -- invalidates the savepoint and the scope exit throws instead of rolling back.
      (mt/test-helpers-set-global-values!
        (oauth-server.tu/with-oauth-client [client-id]
          (mt/with-model-cleanup [:model/OAuthAccessToken]
            (doseq [scopes [nil []]]
              (testing (str "scopes " (pr-str scopes))
                (let [token (str (random-uuid))]
                  (oidc.store/save-access-token (:token-store (oauth-server/get-provider))
                                                token (str (mt/user->id :rasta)) client-id scopes (in-one-hour) nil)
                  (testing "the bearer bridge does not authenticate the request"
                    (let [req (merge-current-user-info (bearer-request token))]
                      (is (nil? (:metabase-user-id req)))
                      (is (nil? (:token-scopes req)))
                      (is (nil? (:authenticated-via-oauth? req)))))
                  (testing "a general API endpoint answers 401"
                    (client/client :get 401 "user/current"
                                   {:request-options {:headers {"authorization" (str "Bearer " token)}}}))
                  (testing "an agent API endpoint that declares a scope does not serve it"
                    (client/client :post 401 "agent/v1/search"
                                   {:request-options {:headers {"authorization" (str "Bearer " token)}}}
                                   {:term_queries ["orders"]})))))))))))

(deftest non-oauth-auth-is-unaffected-by-oauth-fail-closed-test
  (testing "GHY-4542: session and API-key requests carry nil `:token-scopes` and must keep passing the scope
            middleware. A stray bearer header does not make a session request OAuth-authenticated: the session
            takes precedence and the bearer is never resolved."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [user-info {:metabase-user-id (mt/user->id :rasta) :is-superuser? false}]
        (testing "a session request"
          (mt/with-dynamic-fn-redefs [mw.session/current-user-info-for-session (fn [_ _] user-info)]
            (let [req (merge-current-user-info {:metabase-session-key "session-key"})]
              (is (= "session" (:embedding/auth-method req)))
              (is (nil? (:authenticated-via-oauth? req)))
              (is (passes-scope-middleware? req)))))
        (testing "an API-key request"
          (mt/with-dynamic-fn-redefs [mw.session/current-user-info-for-api-key (fn [_] user-info)]
            (let [req (merge-current-user-info {:headers {"x-api-key" "mb_whatever"}})]
              (is (= "api-key" (:embedding/auth-method req)))
              (is (nil? (:authenticated-via-oauth? req)))
              (is (passes-scope-middleware? req)))))
        (testing "a session request carrying a stray bearer header"
          (oauth-server.tu/with-oauth-client [client-id]
            (mt/with-model-cleanup [:model/OAuthAccessToken]
              (let [token (str (random-uuid))]
                (save-access-token! token (mt/user->id :rasta) client-id [] (in-one-hour))
                (mt/with-dynamic-fn-redefs [mw.session/current-user-info-for-session (fn [_ _] user-info)]
                  (let [req (merge-current-user-info (assoc (bearer-request token) :metabase-session-key "session-key"))]
                    (is (= (mt/user->id :rasta) (:metabase-user-id req)))
                    (is (= "session" (:embedding/auth-method req)))
                    (is (nil? (:authenticated-via-oauth? req)))
                    (is (passes-scope-middleware? req))))
                (testing "and over HTTP"
                  (let [options {:request-options {:headers {"authorization" (str "Bearer " token)}}}]
                    (is (= (mt/user->id :rasta)
                           (:id (mt/user-http-request :rasta :get 200 "user/current" options))))))))))))))

(deftest narrow-oauth-token-gets-insufficient-scope-challenge-test
  (testing "GHY-4542: a narrow OAuth token reaching an agent API endpoint that declares a scope it does not hold gets
            a 403 carrying the RFC 6750 section 3 `insufficient_scope` challenge, naming the scope that endpoint
            requires, so the client knows to re-authorize for it"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-server.tu/with-oauth-client [client-id]
        (mt/with-model-cleanup [:model/OAuthAccessToken]
          (let [token    (str (random-uuid))
                _        (save-access-token! token (mt/user->id :rasta) client-id
                                             ["agent:query:execute"] (in-one-hour))
                response (client/client-full-response
                          :post 403 "agent/v1/search"
                          {:request-options {:headers {"authorization" (str "Bearer " token)}}}
                          {:term_queries ["orders"]})]
            (is (= (str "Bearer error=\"insufficient_scope\", scope=\"agent:search\", "
                        "error_description=\"Insufficient scope for this operation.\"")
                   (get-in response [:headers "WWW-Authenticate"])))
            (is (= "unsupported_scope" (get-in response [:body :error])))))))))

(def ^:private unscoped-endpoint-requests
  "Requests to general REST endpoints whose `defendpoint` declares no `:scope`, as
   `[description method url body-key status-with-full-access]`."
  [["GET user/current"            :get  "user/current"          nil              200]
   ["GET database"                :get  "database"              nil              200]
   ["GET collection/root/items"   :get  "collection/root/items" nil              200]
   ["GET card"                    :get  "card"                  nil              200]
   ["POST dataset (native query)" :post "dataset"               :native-select-1 202]
   ["POST collection (a write)"   :post "collection"            :new-collection  200]])

(defn- request-body [body-key]
  (case body-key
    nil              nil
    :native-select-1 {:database (mt/id) :type "native" :native {:query "SELECT 'mcp-scoped-token-test'"}}
    :new-collection  {:name (str "oauth-scope-test-" (random-uuid))}))

(defn- bearer-response
  "The full response `method url` answers when called with `token` as an OAuth bearer token. Pass
  `:expected-status 401` for a request expected to be unauthenticated: the test client throws on a 401 it was not
  told to expect."
  [token method url body & {:keys [expected-status]}]
  (let [options {:request-options {:headers {"authorization" (str "Bearer " token)}}}
        args    (cond-> [method]
                  expected-status (conj expected-status)
                  true            (conj url options)
                  body            (conj body))]
    (apply client/client-full-response args)))

(defn- bearer-status
  "The HTTP status `method url` answers when called with `token` as an OAuth bearer token."
  [token method url body & {:as opts}]
  (:status (bearer-response token method url body opts)))

(deftest mcp-scoped-token-is-refused-by-unscoped-endpoints-test
  (testing "An OAuth token that holds only the MCP v2 scopes is refused by every endpoint that declares no `:scope`.
            Those endpoints are wrapped in `ensure-scopes-checked`, which admits only unrestricted (`mb:full`) or
            scope-unaware auth. So an MCP-scoped token does not reach the general REST API, and MCP scopes are
            not a no-op."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      ;; Commit the client row rather than hold a rollback-only transaction open across HTTP round-trips; see
      ;; `bearer-bridge-refuses-token-without-scopes-test`.
      (mt/test-helpers-set-global-values!
        (oauth-server.tu/with-oauth-client [client-id]
          (mt/with-model-cleanup [:model/OAuthAccessToken :model/Collection]
            (let [user-id    (mt/user->id :rasta)
                  mcp-token  (str (random-uuid))
                  full-token (str (random-uuid))]
              (save-access-token! mcp-token user-id client-id mcp.paths/v2-surface-scopes (in-one-hour))
              (save-access-token! full-token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
              (doseq [[description method url body-key full-access-status] unscoped-endpoint-requests]
                (testing description
                  (testing "is refused for a token holding only the MCP v2 scopes"
                    (is (= 403 (bearer-status mcp-token method url (request-body body-key)))))
                  (testing "succeeds for an `mb:full` token for the same user, so the refusal comes from the scopes"
                    (is (= full-access-status
                           (bearer-status full-token method url (request-body body-key)))))))
              (testing "Regression guard: the agent API's read-resource endpoint declares `agent:resource:read`, which
                        used to be an MCP v2 scope too, so an MCP-scoped token reached it. No MCP scope is an
                        endpoint scope any more, so it is refused like the rest."
                (is (= 403 (bearer-status mcp-token :post "agent/v1/read-resource"
                                          {:uris ["metabase://databases"]})))))))))))

;;; ------------------------------------ audience binding (RFC 8707 `resource`) ------------------------------------

(defn- do-with-committed-oauth-client!
  "Call `f` with the id of a committed OAuth client, cleaning up the client and every access token afterwards.
  Committed rather than rolled back for the reason given in `bearer-bridge-refuses-token-without-scopes-test`."
  [f]
  (mt/test-helpers-set-global-values!
    (oauth-server.tu/with-oauth-client [client-id]
      (mt/with-model-cleanup [:model/OAuthAccessToken]
        (f client-id)))))

(defn- mcp-initialize-response
  "The response of an MCP `initialize` at `path` with `token` as the bearer."
  [token path & {:as opts}]
  (bearer-response token :post path {:jsonrpc "2.0" :method "initialize" :params {:capabilities {}} :id 1}
                   opts))

(deftest mcp-token-authenticates-at-every-mcp-endpoint-path-test
  (testing "A token whose stored resource names the MCP endpoint authenticates `initialize` at the canonical path and
            at the `/api/mcp` alias. The stored resource is compared in canonical form, because clients spell the
            same resource differently."
    (doseq [[site-url resource] [["http://localhost:3000"  "http://localhost:3000/api/metabase-mcp"]
                                 ["http://localhost:3000"  "http://localhost:3000/api/mcp"]
                                 ["http://localhost:3000"  "http://localhost:3000/api/metabase-mcp/"]
                                 ["http://localhost:3000"  "http://LOCALHOST:3000/api/metabase-mcp"]
                                 ["https://mb.example.com" "https://mb.example.com:443/api/metabase-mcp"]]]
      (testing (str "site-url " site-url ", stored resource " resource)
        (mt/with-temporary-setting-values [site-url site-url]
          (do-with-committed-oauth-client!
           (fn [client-id]
             (let [token (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id
                                                               mcp.paths/v2-baseline-scopes
                                                               :resource [resource])]
               (doseq [path ["metabase-mcp" "mcp"]]
                 (testing path
                   (is (= 200 (:status (mcp-initialize-response token path))))))))))))))

(deftest mcp-token-does-not-authenticate-off-the-mcp-endpoint-test
  (testing "A token bound to the MCP endpoint by its stored resource authenticates nothing else. Off the MCP
            endpoint the request is anonymous, so it gets the answer an unauthenticated request gets. The binding
            does this, not the scopes: the token is refused even when it holds a scope the endpoint declares, or
            `mb:full`."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (do-with-committed-oauth-client!
       (fn [client-id]
         (let [mint (fn [scopes]
                      (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id scopes
                                                            :resource (oauth-server.tu/mcp-resource)))]
           (doseq [[label scopes] [["MCP scopes" mcp.paths/v2-surface-scopes]
                                   ["mb:full"    [oauth-server/full-access-scope]]]]
             (testing label
               (let [token (mint scopes)]
                 (testing "GET user/current"
                   (is (= 401 (bearer-status token :get "user/current" nil :expected-status 401))))
                 (testing "POST dataset"
                   (is (= 401 (bearer-status token :post "dataset"
                                             {:database (mt/id) :type "native" :native {:query "SELECT 'mcp-token-off-mcp-endpoint-test'"}}
                                             :expected-status 401))))
                 (testing "GET /oauth/authorize, a defendpoint outside /api, sends the anonymous user to log in"
                   (is (= 302 (:status (binding [client/*url-prefix* ""]
                                         (client/client-full-response :get "oauth/authorize"
                                                                      {:request-options
                                                                       {:headers {"authorization" (str "Bearer " token)}}})))))))))
           (testing "an agent API endpoint, with the scope it declares"
             (is (= 401 (bearer-status (mint ["agent:search"]) :post "agent/v1/search"
                                       {:term_queries ["orders"]} :expected-status 401))))))))))

(def ^:private mcp-invalid-token-description
  "The `error_description` auth-param of the MCP endpoint's `invalid_token` challenge."
  "error_description=\"This token is not valid for this server. Authorize again for this resource.\"")

(deftest expired-mcp-token-gets-the-explained-challenge-test
  (testing "An expired MCP-bound token gets the same 401 invalid_token challenge, with its error_description and the
            RFC 9728 discovery parameters, as any other bearer the MCP endpoint does not accept"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (do-with-committed-oauth-client!
       (fn [client-id]
         (let [token     (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id
                                                               mcp.paths/v2-baseline-scopes
                                                               :resource (oauth-server.tu/mcp-resource)
                                                               :expiry (one-hour-ago))
               response  (mcp-initialize-response token "metabase-mcp" :expected-status 401)
               challenge (get-in response [:headers "WWW-Authenticate"] "")]
           (is (= 401 (:status response)))
           (is (str/includes? challenge "error=\"invalid_token\""))
           (is (str/includes? challenge mcp-invalid-token-description))
           (is (str/includes? challenge "resource_metadata="))))))))

(deftest rest-token-is-refused-by-the-mcp-endpoint-test
  (testing "A token with no stored resource is a REST token. The MCP endpoint refuses it with 401 and an
            `invalid_token` challenge carrying the RFC 9728 discovery parameters, so the client re-authorizes for
            the MCP resource. A CLI `mb:full` token keeps working on the REST API."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (do-with-committed-oauth-client!
       (fn [client-id]
         (doseq [[label scopes] [["MCP scopes" mcp.paths/v2-surface-scopes]
                                 ["mb:full"    [oauth-server/full-access-scope]]]]
           (testing label
             (let [token (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id scopes)]
               (doseq [path ["metabase-mcp" "mcp"]]
                 (testing path
                   (let [response  (mcp-initialize-response token path :expected-status 401)
                         challenge (get-in response [:headers "WWW-Authenticate"] "")]
                     (is (= 401 (:status response)))
                     (is (str/includes? challenge "error=\"invalid_token\""))
                     (is (str/includes? challenge mcp-invalid-token-description))
                     (is (str/includes? challenge "resource_metadata=")))))))
           (testing "the CLI `mb:full` token reaches the REST API"
             (let [token (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id
                                                               [oauth-server/full-access-scope])]
               (is (= 200 (bearer-status token :get "user/current" nil)))))))))))

(deftest bearer-bridge-mcp-token-keeps-its-raw-scopes-test
  (testing "An MCP-bound token is never stamped unrestricted, even when it holds `mb:full`: the MCP endpoint reads
            only its literal MCP scopes"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (do-with-committed-oauth-client!
       (fn [client-id]
         (let [token (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id
                                                           [oauth-server/full-access-scope "agent:query:run"]
                                                           :resource (oauth-server.tu/mcp-resource))
               req   (merge-current-user-info (assoc (bearer-request token) :uri "/api/metabase-mcp"))]
           (is (= (mt/user->id :rasta) (:metabase-user-id req)))
           (is (= #{oauth-server/full-access-scope "agent:query:run"} (:token-scopes req)))))))))

(defn- user-id-at
  "The user the bearer bridge resolves `token` to for a request to `uri`, or nil."
  [token uri]
  (:metabase-user-id (merge-current-user-info (assoc (bearer-request token) :uri uri))))

(deftest mcp-token-survives-a-site-url-change-test
  (testing "A token issued for the MCP endpoint still authenticates there after an admin changes the Site URL, and
            still authenticates nothing else. The binding is decided by the path of the stored resource, not by the
            Site URL it was issued under."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (do-with-committed-oauth-client!
       (fn [client-id]
         (let [token (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id
                                                           mcp.paths/v2-baseline-scopes
                                                           :resource (oauth-server.tu/mcp-resource))]
           (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
             (is (= (mt/user->id :rasta) (user-id-at token "/api/metabase-mcp")))
             (testing "and is still refused off the MCP endpoint"
               (is (nil? (user-id-at token "/api/user/current")))))))))))

(deftest mcp-token-under-a-subpath-site-url-test
  (testing "A token issued under a Site URL with a subpath is MCP-bound, and stays bound when the host or the subpath
            changes"
    (mt/with-temporary-setting-values [site-url "https://host.example.com/metabase"]
      (do-with-committed-oauth-client!
       (fn [client-id]
         (let [token (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id
                                                           mcp.paths/v2-baseline-scopes
                                                           :resource (oauth-server.tu/mcp-resource))]
           (is (= ["https://host.example.com/metabase/api/metabase-mcp"] (oauth-server.tu/mcp-resource)))
           (is (= (mt/user->id :rasta) (user-id-at token "/api/metabase-mcp")))
           (is (nil? (user-id-at token "/api/user/current")))
           (doseq [new-site-url ["https://other.example.com/metabase" "https://host.example.com/analytics"]]
             (testing new-site-url
               (mt/with-temporary-setting-values [site-url new-site-url]
                 (is (= (mt/user->id :rasta) (user-id-at token "/api/metabase-mcp")))
                 (is (nil? (user-id-at token "/api/user/current"))))))))))))

(deftest migrated-legacy-mcp-token-is-confined-to-the-mcp-endpoint-test
  (testing "A token shaped like one `BindLegacyMcpOAuthTokens` rebinds from the old baseline (its MCP scopes, with
            agent:resource:read dropped, and the migration's localhost MCP resource) is refused by the agent API's
            read-resource endpoint and accepted at the MCP endpoint, whatever the Site URL"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
      (do-with-committed-oauth-client!
       (fn [client-id]
         (let [token (oauth-server.tu/insert-access-token! (mt/user->id :rasta) client-id
                                                           ["agent:content:read" "agent:query:run"]
                                                           :resource ["http://localhost/api/metabase-mcp"])]
           (is (= 401 (bearer-status token :post "agent/v1/read-resource" {:uris ["metabase://databases"]}
                                     :expected-status 401)))
           (is (= 200 (:status (mcp-initialize-response token "metabase-mcp"))))))))))

(deftest look-alike-resource-paths-are-not-mcp-bound-test
  (testing "A resource whose path only resembles an MCP endpoint path is not MCP-bound: the path must end with an
            MCP endpoint path at a segment boundary"
    (doseq [resource ["http://localhost:3000/notapi/mcp"
                      "http://localhost:3000/api/mcp-evil"
                      "http://localhost:3000/api/metabase-mcp/extra"
                      "http://localhost:3000/api"
                      "not a uri"]]
      (testing resource
        (is (false? (oauth-server/mcp-resource? [resource])))))
    (testing "while the MCP endpoint paths themselves, under any host or subpath, are"
      (doseq [resource ["http://localhost:3000/api/mcp"
                        "https://a.example.com/x/y/api/metabase-mcp"
                        "HTTPS://A.EXAMPLE.COM:443/api/metabase-mcp/"]]
        (testing resource
          (is (true? (oauth-server/mcp-resource? [resource]))))))))

(deftest bearer-bridge-expired-token-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [token (str (random-uuid))]
          (save-access-token! token (mt/user->id :rasta) client-id [oauth-server/full-access-scope] (one-hour-ago))
          (let [req (merge-current-user-info (bearer-request token))]
            (testing "an expired access token does not authenticate"
              (is (nil? (:metabase-user-id req)))
              (is (nil? (:token-scopes req))))))))))

(deftest bearer-bridge-unknown-token-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (let [req (merge-current-user-info (bearer-request (str (random-uuid))))]
      (testing "an unknown bearer token does not authenticate"
        (is (nil? (:metabase-user-id req)))
        (is (nil? (:token-scopes req)))))))

(deftest bearer-bridge-revoked-token-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [user-id (mt/user->id :rasta)
              token   (str (random-uuid))]
          (save-access-token! token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
          (testing "the token authenticates before it is revoked"
            (is (= user-id (:metabase-user-id (merge-current-user-info (bearer-request token))))))
          (revoke-access-token! token)
          (testing "after revocation (as on logout) the same token no longer authenticates"
            (let [req (merge-current-user-info (bearer-request token))]
              (is (nil? (:metabase-user-id req)))
              (is (nil? (:token-scopes req))))))))))

(deftest bearer-bridge-deactivation-revokes-test
  (testing "deactivating the user revokes the bearer token, and reactivating does NOT revive it (SEC-863)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (oauth-server.tu/with-oauth-client [client-id]
          (let [user-id (mt/user->id :rasta)
                token   (str (random-uuid))]
            (save-access-token! token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
            (testing "authenticates before deactivation"
              (is (= user-id (:metabase-user-id (merge-current-user-info (bearer-request token))))))
            (t2/update! :model/User user-id {:is_active false})
            (testing "after deactivation the token no longer authenticates"
              (is (nil? (:metabase-user-id (merge-current-user-info (bearer-request token))))))
            (t2/update! :model/User user-id {:is_active true})
            (testing "after reactivation the same token STILL does not authenticate"
              (is (nil? (:metabase-user-id (merge-current-user-info (bearer-request token))))))))))))

(deftest resolve-access-token-deactivated-user-test
  (testing "S1: a still-live token for a user who has since been deactivated does NOT resolve — the shared
            resolver gates on is_active so the v1 MCP transport (which dispatches straight on :user-id,
            with no is_active re-check of its own) can't authenticate a deactivated user's bearer token"
    ;; Deactivates with a raw UPDATE, not `t2/update! :model/User`: the model's before-update hook fires
    ;; `:event/user-credentials-revoked`, whose handler stamps `revoked_at` on the token and would make the
    ;; store lookup fail first — the resolver's own is_active gate would never be what this test exercises.
    ;; The raw UPDATE is exactly the path the gate exists for.
    ;; Uses :rasta (a shared fixture user) but restores `is_active` and deletes the token in a `finally`,
    ;; so the deactivation can't leak to sibling tests. A rollback-only transaction does NOT isolate the
    ;; update from tests running on other connections; a `with-temp` user hits an FK on teardown because the
    ;; token row still references it.
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [user-id (mt/user->id :rasta)
              token   (str (random-uuid))]
          (try
            (save-access-token! token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
            (testing "resolves while the user is active"
              (is (= user-id (:user-id (oauth-server/resolve-access-token token)))))
            (t2/query {:update :core_user :set {:is_active false} :where [:= :id user-id]})
            (testing "stops resolving once the user is deactivated"
              (is (nil? (oauth-server/resolve-access-token token)))
              (testing "and the token itself was not revoked — the resolver's gate did the refusing"
                (is (nil? (t2/select-one-fn :revoked_at :model/OAuthAccessToken :token token)))))
            (finally
              (t2/query {:update :core_user :set {:is_active true} :where [:= :id user-id]})
              (t2/delete! :model/OAuthAccessToken :token token))))))))

(deftest bearer-bridge-precedence-test
  (testing "session/api-key auth takes precedence — bearer resolution is not even attempted"
    (let [called? (atom false)]
      (mt/with-dynamic-fn-redefs [oauth-server/resolve-access-token (fn [_] (reset! called? true) nil)
                                  ;; pretend an API key authenticated the request
                                  mw.session/current-user-info-for-api-key (fn [_] {:metabase-user-id 99 :is-superuser? false})]
        (let [req (merge-current-user-info {:headers {"authorization" "Bearer anything"
                                                      "x-api-key"     "mb_whatever"}})]
          (is (= 99 (:metabase-user-id req)))
          (is (= "api-key" (:embedding/auth-method req)))
          (is (nil? (:token-scopes req)) "api-key auth must not set token-scopes")
          (is (false? @called?) "bearer token store must not be consulted when api-key already authenticated"))))))
