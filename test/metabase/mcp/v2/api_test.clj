(ns metabase.mcp.v2.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.mcp.paths :as mcp.paths]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.mcp.v2.api :as v2.api]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [oidc-provider.util :as oidc.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;; During the v1→v2 migration the v2 surface is mounted only at `/v2`; the canonical path still
;; serves v1. The final switchover PR repoints this at "metabase-mcp".
(def ^:private endpoint "metabase-mcp/v2")

(defn- mcp-request
  ([body]
   (mcp-request body {}))
  ([body extra-headers]
   (client/client-full-response (test.users/username->token :crowberto)
                                :post endpoint
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- jsonrpc-request
  ([method] (jsonrpc-request method {}))
  ([method params] {:jsonrpc "2.0" :method method :params params :id 1}))

(defn- initialize!
  "Perform the initialize handshake; returns [session-id init-response]."
  []
  (let [response   (mcp-request (jsonrpc-request "initialize" {:capabilities {}}))
        session-id (get-in response [:headers "Mcp-Session-Id"])]
    (mcp-request {:jsonrpc "2.0" :method "notifications/initialized" :params {}}
                 {"mcp-session-id" session-id})
    [session-id response]))

(deftest mcp-enabled-gate-test
  (testing "the route serves by default — `mcp-enabled?` is the admin toggle and defaults to true"
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize"))))))
  (testing "GHY-4250: the admin toggle darkens the surface"
    (mt/with-temporary-setting-values [mcp.settings/mcp-enabled? false]
      (let [response (mcp-request (jsonrpc-request "initialize"))]
        (is (= 403 (:status response)))
        (is (= "MCP server is not enabled." (:body response)))))))

(deftest every-alias-serves-the-same-surface-test
  (testing "every MCP path serves a working surface — during migration the legacy paths reach v1
            and /v2 reaches this surface, so existing client configs don't break. (The final
            switchover PR repoints the legacy paths at v2; these assertions are surface-agnostic
            and hold across it — GHY-4250.)"
    (doseq [path ["metabase-mcp" "mcp" "metabase-mcp/v2"]]
      (testing path
        (let [response (client/client-full-response (test.users/username->token :crowberto)
                                                    :post path
                                                    {:request-options {:headers {}}}
                                                    (jsonrpc-request "initialize"))]
          (is (= 200 (:status response)))
          (is (some? (get-in response [:headers "Mcp-Session-Id"]))))))))

(deftest initialize-test
  (testing "initialize returns the handshake and a session header"
    (let [[session-id response] (initialize!)]
      (is (= 200 (:status response)))
      (is (some? session-id))
      (is (= "2025-03-26" (get-in response [:body :result :protocolVersion])))
      (is (= {:name "metabase" :version "0.1.0"} (get-in response [:body :result :serverInfo])))
      (testing "GHY-4157: tools and resources are advertised — resources serve the MCP Apps iframe shells; prompts stay unimplemented and so unadvertised"
        (is (= {:tools {:listChanged true} :resources {}}
               (get-in response [:body :result :capabilities]))))
      (testing "the handshake carries the skills instructions — the one pre-tool-call channel"
        (is (re-find #"learn\(\)" (get-in response [:body :result :instructions])))))))

(deftest tools-list-test
  (let [[session-id _] (initialize!)
        response       (mcp-request (jsonrpc-request "tools/list")
                                    {"mcp-session-id" session-id})
        tools          (get-in response [:body :result :tools])]
    (testing "the registry drives tools/list; cookie sessions see every tool"
      (is (= 200 (:status response)))
      (is (some #(= "ping_v2" (:name %)) tools)))
    (testing "inputSchema is strict JSON Schema (required + closed), safe for strict clients"
      (let [schema (:inputSchema (first (filter #(= "ping_v2" (:name %)) tools)))]
        (is (= "object" (:type schema)))
        (is (false? (:additionalProperties schema)))))))

(deftest tools-call-test
  (let [[session-id _] (initialize!)]
    (testing "tools/call dispatches through the registry"
      (let [response (mcp-request (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {}})
                                  {"mcp-session-id" session-id})
            result   (get-in response [:body :result])]
        (is (= 200 (:status response)))
        (is (not (:isError result)))
        (is (= {:ok true :message "pong"} (:structuredContent result)))))
    (testing "argument validation failures are teaching errors, not schema dumps"
      (let [response (mcp-request (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {:message 42}})
                                  {"mcp-session-id" session-id})
            result   (get-in response [:body :result])]
        (is (:isError result))
        (is (str/starts-with? (-> result :content first :text) "Invalid arguments"))))
    (testing "an unknown tool is a method-not-found style error"
      (let [response (mcp-request (jsonrpc-request "tools/call" {:name "nope" :arguments {}})
                                  {"mcp-session-id" session-id})
            result   (get-in response [:body :result])]
        (is (:isError result))
        (is (= "Unknown tool: nope" (-> result :content first :text)))))))

(deftest disabled-tools-kill-switch-test
  (let [[session-id _] (initialize!)]
    (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["ping_v2"]]
      (testing "a disabled tool disappears from tools/list"
        (let [response (mcp-request (jsonrpc-request "tools/list")
                                    {"mcp-session-id" session-id})]
          (is (not (some #(= "ping_v2" (:name %))
                         (get-in response [:body :result :tools]))))))
      (testing "a disabled tool is rejected by tools/call as if it never existed"
        (let [response (mcp-request (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {}})
                                    {"mcp-session-id" session-id})
              result   (get-in response [:body :result])]
          (is (:isError result))
          (is (= "Unknown tool: ping_v2" (-> result :content first :text))))))))

(deftest method-dispatch-fallthrough-test
  (let [[session-id _] (initialize!)]
    (testing "methods the surface can't serve fall through to JSON-RPC method-not-found"
      (doseq [method ["prompts/list"]]
        (testing method
          (let [response (mcp-request (jsonrpc-request method)
                                      {"mcp-session-id" session-id})]
            (is (= -32601 (get-in response [:body :error :code])))
            (is (str/includes? (get-in response [:body :error :message]) "Method not found"))))))
    (testing "ping is handled and returns an empty success result, not a fallthrough error"
      (let [response (mcp-request (jsonrpc-request "ping")
                                  {"mcp-session-id" session-id})]
        (is (= 200 (:status response)))
        (is (nil? (get-in response [:body :error])))
        (is (= {} (get-in response [:body :result])))))))

(deftest resources-list-and-read-test
  (mcp.ui-resource/with-fallback-template
    (let [[session-id _] (initialize!)
          listed (-> (mcp-request (jsonrpc-request "resources/list")
                                  {"mcp-session-id" session-id})
                     (get-in [:body :result :resources]))]
      (testing "GHY-4157: resources/list serves the MCP Apps iframe shells and the fields catalog"
        (is (= #{v2.resources/visualize-query-uri v2.resources/render-drill-through-uri
                 v2.resources/fields-catalog-uri}
               (set (map :uri listed))))
        (is (every? #(= "text/html;profile=mcp-app" (:mimeType %))
                    (remove #(= v2.resources/fields-catalog-uri (:uri %)) listed)))
        (is (= "application/json"
               (:mimeType (first (filter #(= v2.resources/fields-catalog-uri (:uri %)) listed))))))
      (testing "GHY-4157: resources/read renders a shell the host can sandbox"
        (let [content (-> (mcp-request (jsonrpc-request "resources/read"
                                                        {:uri v2.resources/visualize-query-uri})
                                       {"mcp-session-id" session-id})
                          (get-in [:body :result :contents])
                          first)]
          (is (= v2.resources/visualize-query-uri (:uri content)))
          (is (str/includes? (:text content) "metabaseConfig"))
          (is (contains? (get-in content [:_meta :ui]) :csp))))
      (testing "GHY-4157: an unknown URI is an invalid-params error, not a rendered shell"
        (let [response (mcp-request (jsonrpc-request "resources/read" {:uri "ui://metabase/nope.html"})
                                    {"mcp-session-id" session-id})]
          (is (= -32602 (get-in response [:body :error :code])))))
      (testing "GHY-4157: a missing uri parameter is rejected"
        (let [response (mcp-request (jsonrpc-request "resources/read" {})
                                    {"mcp-session-id" session-id})]
          (is (= -32602 (get-in response [:body :error :code]))))))))

(deftest credential-is-minted-only-where-it-is-embedded-test
  (testing "GHY-4157: `resources/read` minted a UI credential before it knew what had been asked for, so every
            read paid for one and handed it to the render — including data resources whose render-fn ignores it,
            and reads that turn out to be unknown or scope-denied. A credential is a live 5-minute authenticator
            for the /api/dataset surface; it should exist only where something actually embeds it, so that a
            resource added later cannot start leaking one by accident."
    (mcp.ui-resource/with-fallback-template
      (let [[session-id _] (initialize!)
            minted (atom 0)]
        ;; Delegation captures the original through `mt/original-fn` — a value captured before the
        ;; redef would be the dynamic-redef proxy if an earlier test already patched the var.
        (mt/with-dynamic-fn-redefs [mcp.session/issue-ui-credential
                                    (fn [& args]
                                      (swap! minted inc)
                                      (apply (mt/original-fn #'mcp.session/issue-ui-credential) args))]
          (testing "a data resource does not mint one — its render-fn never asks"
            (mcp-request (jsonrpc-request "resources/read" {:uri v2.resources/fields-catalog-uri})
                         {"mcp-session-id" session-id})
            (is (zero? @minted)))
          (testing "nor does a read that resolves to nothing"
            (mcp-request (jsonrpc-request "resources/read" {:uri "ui://metabase/nope.html"})
                         {"mcp-session-id" session-id})
            (is (zero? @minted)))
          (testing "the iframe shell still gets exactly one, and still embeds it"
            (let [text (-> (mcp-request (jsonrpc-request "resources/read"
                                                         {:uri v2.resources/visualize-query-uri})
                                        {"mcp-session-id" session-id})
                           (get-in [:body :result :contents])
                           first
                           :text)]
              (is (= 1 @minted))
              (is (str/includes? text "uiCredential")))))))))

(deftest v2-credentials-are-never-legacy-test
  (testing "GHY-4318: `issue-legacy-ui-credential` (and the 2-arity that forwards to it) mints a credential
            EXEMPT from the native-SQL scope gate. That exemption exists only so wiring the gate would not change
            v1's behavior — v1's iframe visualizes execute_sql handles. A v2 caller reaching for it, now or when
            the visualize tools land, would silently opt this surface back out of the gate and reopen the hole
            the gate closes.

            The arity is the trap: `(issue-ui-credential session-id user-id)` reads like a perfectly reasonable
            call. So this asserts the property on the wire instead of trusting the name — every credential the
            v2 surface hands out carries a scope claim and is not marked legacy."
    (mcp.ui-resource/with-fallback-template
      (let [[session-id _] (initialize!)
            html   (-> (mcp-request (jsonrpc-request "resources/read" {:uri v2.resources/visualize-query-uri})
                                    {"mcp-session-id" session-id})
                       (get-in [:body :result :contents])
                       first
                       :text)
            claims (some-> (second (re-find #"uiCredential:\s*\"([^\"]+)\"" html))
                           mcp.session/resolve-ui-credential)]
        (is (some? claims) "the shell must render a resolvable credential — otherwise this passes vacuously")
        (is (nil? (:legacy claims))
            "a v2-minted credential must never carry the v1 exemption marker")
        (is (contains? claims :scp)
            "and must carry a scope claim, which is what subjects it to the native-SQL gate")))))

(deftest v2-surface-scopes-match-metabot-scope-test
  (testing "`v2-surface-scopes` spells its scopes as literals because `metabase.mcp.paths` must stay
            dependency-free — `metabase.server.middleware.security` requires `metabase.mcp.core`, so requiring
            `metabot.scope` from anything `mcp.core` reaches deadlocks namespace loading at web-server start.
            This is what keeps the literals honest in place of that require."
    (is (= [metabot.scope/agent-content-read
            metabot.scope/agent-content-write
            metabot.scope/agent-query-run
            metabot.scope/agent-sql-run
            metabot.scope/agent-delivery-write
            metabot.scope/agent-resource-read]
           mcp.paths/v2-surface-scopes))))

(deftest challenge-scopes-are-grantable-test
  (testing "GHY-4226: the 401 challenge tells an uninstructed client what to ask for, and the OAuth server
            validates a requested scope against `all-agent-scopes`. A challenge naming scopes that set does not
            contain is not merely over-broad — the client asks for exactly what it was told, is answered
            \"Invalid scope\", and the connect fails outright. The surface becomes unreachable over OAuth."
    (let [grantable (set ((requiring-resolve 'metabase.oauth-server.core/all-agent-scopes)))]
      (doseq [scope @#'v2.api/default-ask-scopes]
        (testing scope
          (is (contains? grantable scope)
              "a scope the v2 challenge asks for must be one the OAuth server will actually grant"))))))

(deftest unauthenticated-discovery-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "an unauthenticated request advertises the protected-resource metadata for the path it hit"
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options {:headers {}}}
                                                  (jsonrpc-request "initialize"))]
        (is (= 401 (:status response)))
        (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "")
                           "/.well-known/oauth-protected-resource/api/metabase-mcp/v2"))))
    (testing "the challenge names every scope the surface accepts, which a client that reads it prefers
              over the resource metadata's `scopes_supported`. Asking for less would hide the write
              tools from `tools/list` with no in-product way for the user to ask for them."
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options {:headers {}}}
                                                  (jsonrpc-request "initialize"))]
        (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "")
                           ", scope=\"agent:content:read agent:content:write agent:query:run agent:sql:run agent:delivery:write agent:resource:read\""))))
    (testing "auth-params are comma-delimited per RFC 7235, the form every spec and vendor example
              uses and the only one a strict parser accepts"
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options {:headers {}}}
                                                  (jsonrpc-request "initialize"))]
        (is (= (str "Bearer realm=\"mcp\", "
                    "resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource"
                    "/api/metabase-mcp/v2\", "
                    "scope=\"agent:content:read agent:content:write agent:query:run agent:sql:run agent:delivery:write agent:resource:read\"")
               (get-in response [:headers "WWW-Authenticate"])))))))

;;; ------------------------------------------------ Auth methods --------------------------------------------------

(deftest sso-provisioned-session-dispatches-test
  (testing "GHY-4287: refusing API keys must not close the embedding integration path that replaces them — a
            customer's backend signs a JWT per end user, exchanges it for a Metabase session at `/auth/sso`, and
            drives MCP with that session, so every call lands on a real, billable `:type \"personal\"` user. An
            SSO login mints its session through `create-session-with-auth-tracking!`, which links it to the
            user's `auth_identity` row; the session middleware then reports that row's provider as the auth
            method, so an SSO session is classified by provider, never \"api-key\", and a refusal keyed on
            API-key auth must not catch it.

            The customer's provider is JWT, but every provider mints its session through that one fn, and only
            OSS providers derive `::provider/provider` in an OSS run — so this uses OIDC to hold the guarantee in
            both editions rather than only where JWT SSO exists."
    (mt/with-temp [:model/User user {}
                   :model/AuthIdentity _sso-identity {:user_id (:id user) :provider "oidc"}]
      (let [session (auth-identity/create-session-with-auth-tracking! user nil :provider/oidc)]
        (testing "the session really is auth-identity-linked — otherwise this degrades into a plain-session test"
          (is (some? (:auth_identity_id session))))
        (testing "the user is one the seat count bills, unlike the `:type :api-key` user an API key authenticates as"
          (is (= :personal (t2/select-one-fn :type :model/User (:id user)))))
        (let [session-key (:key session)
              init        (client/client-full-response session-key :post 200 endpoint
                                                       {:request-options {:headers {}}}
                                                       (jsonrpc-request "initialize" {:capabilities {}}))
              session-id  (get-in init [:headers "Mcp-Session-Id"])]
          (testing "initialize is served, not met with the API-key refusal"
            (is (= 200 (:status init)))
            (is (some? session-id)))
          (testing "and a tool actually dispatches — the SSO session reaches the surface, not just the handshake"
            (let [response (client/client-full-response session-key :post 200 endpoint
                                                        {:request-options {:headers {"mcp-session-id" session-id}}}
                                                        (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {}}))
                  result   (get-in response [:body :result])]
              (is (not (:isError result)))
              (is (= {:ok true :message "pong"} (:structuredContent result))))))))))

(defn- do-with-temp-tool!
  "Register a throwaway tool for the body, then restore the registry. Lets a test assert scope filtering against a
  tool whose scope differs from the token's without depending on a not-yet-landed real tool."
  [tool thunk]
  (let [tools-atom @#'registry/tools*
        snapshot   @tools-atom]
    (try
      (registry/register-tool! tool)
      (thunk)
      (finally
        (reset! tools-atom snapshot)
        ;; register-tool! flushes the manifest cache; do the same on the way out so a later test doesn't see
        ;; a manifest that still lists the throwaway tool.
        (reset! @#'registry/manifest-cache nil)))))

(defn- do-with-bearer-token!
  "Issue an OAuth access token carrying `scopes` for crowberto and call `f` with the auth headers."
  [scopes f]
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (oauth-server.tu/with-oauth-client [client-id]
      (mt/with-model-cleanup [:model/OAuthAccessToken]
        (let [token (str (random-uuid))]
          ;; `:token` is stored hashed — the resolver hashes the presented string before looking it
          ;; up, so the row has to be written the same way a real issued token would be — including a
          ;; live `oauth_client` row, since the resolver fails closed on a token whose client is gone.
          (t2/insert! :model/OAuthAccessToken
                      {:token     (oidc.util/hash-token token)
                       :user_id   (mt/user->id :crowberto)
                       :client_id client-id
                       :scope     (vec scopes)
                       :expiry    (+ (System/currentTimeMillis) 3600000)})
          (f {"authorization" (str "Bearer " token)}))))))

(defn- ui-credential-for
  "Drive the full MCP Apps handshake as a client holding `scopes`: initialize, read the
  visualize-query shell, and pull the credential back out of the rendered HTML — the same path a
  host's iframe bootstrap takes."
  [headers]
  (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                    {:request-options {:headers headers}}
                                                    (jsonrpc-request "initialize" {:capabilities {}}))
                       (get-in [:headers "Mcp-Session-Id"]))
        html       (-> (client/client-full-response
                        :post 200 endpoint
                        {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                        (jsonrpc-request "resources/read" {:uri v2.resources/visualize-query-uri}))
                       (get-in [:body :result :contents])
                       first
                       :text)]
    (second (re-find #"uiCredential:\s*\"([^\"]+)\"" html))))

(deftest ui-credential-cannot-outrun-its-scopes-test
  (testing "GHY-4318: the iframe credential is delivered to the CLIENT inside the resource HTML, so a client
            holding only `agent:query:run` can lift it out and POST straight to /api/dataset. The credential is
            stamped unrestricted for the endpoint scope middleware, so the only thing standing between it and raw
            SQL is `check-mcp-ui-native-query!` — which must actually be wired into the query endpoints, not just
            unit-tested. Without the wiring, `agent:query:run` silently becomes `agent:sql:run`."
    (mcp.ui-resource/with-fallback-template
      ;; Both payloads are hand-rolled legacy MBQL rather than built with Lib, deliberately and
      ;; symmetrically: what is under test is the shape a client actually PUTs on the wire reaching the
      ;; guard, so constructing it through Lib would test Lib's output instead of the client's.
      (let [native-query {:database (mt/id) :type "native" :native {:query "SELECT 1"}}
            mbql-query   {:database (mt/id) :type "query" :query {:source-table (mt/id :venues) :limit 1}}]
        (testing "a client without agent:sql:run is refused, and told which scope it needs"
          (do-with-bearer-token!
           #{"agent:query:run"}
           (fn [headers]
             (let [credential (ui-credential-for headers)]
               (is (string? credential)
                   "the shell must render a credential — otherwise this test passes vacuously")
               (let [response (client/client-full-response
                               :post 403 "dataset"
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential}}}
                               native-query)]
                 (is (re-find #"agent:sql:run" (str (:body response)))))))))
        (testing "the same client's non-native queries are untouched — the gate is on raw SQL, not on the credential"
          (do-with-bearer-token!
           #{"agent:query:run"}
           (fn [headers]
             (let [credential (ui-credential-for headers)]
               (is (= 202 (:status (client/client-full-response
                                    :post 202 "dataset"
                                    {:request-options {:headers {"x-metabase-mcp-ui-auth" credential}}}
                                    mbql-query))))))))
        (testing "a client that WAS granted agent:sql:run runs the same native query"
          (do-with-bearer-token!
           #{"agent:query:run" "agent:sql:run"}
           (fn [headers]
             (let [credential (ui-credential-for headers)]
               (is (= 202 (:status (client/client-full-response
                                    :post 202 "dataset"
                                    {:request-options {:headers {"x-metabase-mcp-ui-auth" credential}}}
                                    native-query))))))))))))

(deftest resource-scope-gate-is-enforced-over-http-test
  (testing "GHY-4157: every v2 resource carries a required scope, but `resources-list-and-read-test` above drives a
            cookie session — which is stamped unrestricted, so it never exercises the gate at all. Over a real
            bearer token the gate is the only thing between a read-only client and the iframe shell, and reading
            that shell is what mints a UI credential. That has to be asserted on the wire, not just in the
            registry."
    (mcp.ui-resource/with-fallback-template
      (do-with-bearer-token!
       #{"agent:content:read"}
       (fn [headers]
         (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                           {:request-options {:headers headers}}
                                                           (jsonrpc-request "initialize" {:capabilities {}}))
                              (get-in [:headers "Mcp-Session-Id"]))
               session!   (fn [body]
                            (client/client-full-response
                             :post 200 endpoint
                             {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                             body))
               read!      #(session! (jsonrpc-request "resources/read" {:uri %}))]
           (testing "the UI shell is refused — it gates on agent:query:run, which this token does not carry"
             (let [response (read! v2.resources/visualize-query-uri)]
               (is (= -32602 (get-in response [:body :error :code])))
               (testing "with the same message an unknown URI gets, so a scope denial is not an existence oracle"
                 (is (= "Resource not found" (get-in response [:body :error :message])))
                 (is (= (get-in (read! "ui://metabase/does-not-exist.html") [:body :error :message])
                        (get-in response [:body :error :message]))))
               (testing "and no credential is minted into the response"
                 (is (not (str/includes? (str (:body response)) "uiCredential"))))))
           (testing "the fields catalog is refused too — agent:resource:read, also absent from this token"
             (is (= -32602 (get-in (read! v2.resources/fields-catalog-uri) [:body :error :code]))))
           (testing "and nothing is advertised to this token in the first place"
             (is (empty? (-> (session! (jsonrpc-request "resources/list"))
                             (get-in [:body :result :resources])))))))))))

(deftest bearer-token-dispatches-with-its-own-scopes-test
  (testing "GHY-4287: the session middleware resolves an OAuth bearer token itself, so a bearer request reaches the
            transport on the same authenticated branch a cookie session does. It must still dispatch with the
            token's granted scopes — the unrestricted fallback that branch gives a cookie session would hand a
            narrow token every tool."
    ;; This slice's registry holds only ping_v2 + learn, both `agent:content:read`, so asserting the absence of a
    ;; not-yet-landed write tool would pass even with scope filtering deleted. Register a throwaway tool on a DIFFERENT
    ;; scope (`agent:content:write`, which the token below does not carry) so the negative half of the scope contract
    ;; actually has teeth: this test fails if `list-tools`' scope filter is removed.
    (do-with-temp-tool!
     {:name        "scope_probe_write"
      :scope       metabot.scope/agent-content-write
      :description "test-only tool gated on a write scope the narrow token lacks"
      :annotations {:readOnlyHint false}
      :args        [:map]
      :handler     (fn [_ _] nil)}
     (fn []
       (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
         (oauth-server.tu/with-oauth-client [client-id]
           (mt/with-model-cleanup [:model/OAuthAccessToken]
             (let [token   (str (random-uuid))
                   headers {"authorization" (str "Bearer " token)}]
               ;; `:token` is stored hashed — the resolver hashes the presented string before looking it
               ;; up, so the row has to be written the same way a real issued token would be — including a
               ;; live `oauth_client` row, since the resolver fails closed on a token whose client is gone.
               (t2/insert! :model/OAuthAccessToken
                           {:token     (oidc.util/hash-token token)
                            :user_id   (mt/user->id :crowberto)
                            :client_id client-id
                            :scope     ["agent:content:read"]
                            :expiry    (+ (System/currentTimeMillis) 3600000)})
               (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                                 {:request-options {:headers headers}}
                                                                 (jsonrpc-request "initialize" {:capabilities {}}))
                                    (get-in [:headers "Mcp-Session-Id"]))
                     tool-names (-> (client/client-full-response
                                     :post 200 endpoint
                                     {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                                     (jsonrpc-request "tools/list"))
                                    (get-in [:body :result :tools])
                                    (->> (map :name) set))]
                 (is (some? session-id))
                 (testing "a tool inside the granted scope (agent:content:read) is served"
                   (is (contains? tool-names "ping_v2")))
                 (testing "a tool gated on a scope the token lacks (agent:content:write) is filtered out"
                   (is (not (contains? tool-names "scope_probe_write"))
                       "scope filtering must hide a write-scoped tool from a read-only token")))))))))))
