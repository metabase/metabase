(ns metabase.mcp.v2.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.mcp.core :as mcp.core]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.oauth-server.api.metadata :as oauth.metadata]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [oidc-provider.util :as oidc.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private endpoint "metabase-mcp")

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
  (testing "GHY-4250: v1's paths keep working — they now reach the surviving surface, so existing
            client configs (and the connector-directory listing) don't break"
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

(deftest unauthenticated-discovery-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "an unauthenticated request advertises the protected-resource metadata for the path it hit"
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options {:headers {}}}
                                                  (jsonrpc-request "initialize"))]
        (is (= 401 (:status response)))
        (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "")
                           "/.well-known/oauth-protected-resource/api/metabase-mcp"))))
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
                    "/api/metabase-mcp\", "
                    "scope=\"agent:content:read agent:content:write agent:query:run agent:sql:run agent:delivery:write agent:resource:read\"")
               (get-in response [:headers "WWW-Authenticate"])))))))

;;; ------------------------------------------------ Auth methods --------------------------------------------------

(deftest sso-provisioned-session-dispatches-test
  (testing "GHY-4287: refusing API keys must not close the embedding integration path that replaces them — a
            customer's backend signs a JWT per end user, exchanges it for a Metabase session at `/auth/sso`, and
            drives MCP with that session, so every call lands on a real, billable `:type \"personal\"` user. An
            SSO login mints its session through `create-session-with-auth-tracking!`, which links it to the
            user's `auth_identity` row; the session middleware then reports that row's provider as the auth
            method, so an SSO session is classified \"jwt\", never \"api-key\", and the refusal must not catch it."
    (mt/with-temp [:model/User user {}
                   :model/AuthIdentity _jwt-identity {:user_id (:id user) :provider "jwt"}]
      (let [session (auth-identity/create-session-with-auth-tracking! user nil :provider/jwt)]
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

(deftest bearer-token-dispatches-with-its-own-scopes-test
  (testing "GHY-4287: the session middleware resolves an OAuth bearer token itself, so a bearer request reaches the
            transport on the same authenticated branch a cookie session does. It must still dispatch with the
            token's granted scopes — the unrestricted fallback that branch gives a cookie session would hand a
            narrow token every tool."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (mt/with-model-cleanup [:model/OAuthAccessToken]
        (let [token   (str (random-uuid))
              headers {"authorization" (str "Bearer " token)}]
          ;; `:token` is stored hashed — the resolver hashes the presented string before looking it
          ;; up, so the row has to be written the same way a real issued token would be.
          (t2/insert! :model/OAuthAccessToken
                      {:token     (oidc.util/hash-token token)
                       :user_id   (mt/user->id :crowberto)
                       :client_id (str (random-uuid))
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
            (testing "a tool inside the granted scope is served"
              (is (contains? tool-names "ping_v2")))
            (testing "a tool outside it is not"
              (is (not (contains? tool-names "collection_write"))))))))))

(deftest protected-resource-metadata-test
  (testing "RFC 9728 metadata advertises the MCP resource and the rationalized scopes"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [{:keys [body]} (#'oauth.metadata/protected-resource-metadata
                            (mcp.core/mcp-canonical-path)
                            oauth-server/mcp-resource-scopes)]
        (is (str/ends-with? (:resource body) "/api/metabase-mcp"))
        (is (contains? (set (:scopes_supported body)) "agent:content:read"))))))
