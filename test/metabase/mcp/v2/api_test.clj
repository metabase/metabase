(ns metabase.mcp.v2.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.oauth-server.api.metadata :as oauth.metadata]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private endpoint "metabase-mcp/v2")

(defn- mcp-v2-request
  ([body]
   (mcp-v2-request body {}))
  ([body extra-headers]
   (client/client-full-response (test.users/username->token :crowberto)
                                :post endpoint
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- jsonrpc-request
  ([method] (jsonrpc-request method {}))
  ([method params] {:jsonrpc "2.0" :method method :params params :id 1}))

(defn- initialize!
  "Perform the v2 initialize handshake; returns [session-id init-response]."
  []
  (let [response   (mcp-v2-request (jsonrpc-request "initialize" {:capabilities {}}))
        session-id (get-in response [:headers "Mcp-Session-Id"])]
    (mcp-v2-request {:jsonrpc "2.0" :method "notifications/initialized" :params {}}
                    {"mcp-session-id" session-id})
    [session-id response]))

(deftest mcp-v2-enabled-gate-test
  (testing "the v2 route is dark by default (mcp-v2-enabled defaults to false)"
    (let [response (mcp-v2-request (jsonrpc-request "initialize"))]
      (is (= 403 (:status response)))
      (is (= "MCP v2 server is not enabled." (:body response)))))
  (testing "v1 keeps serving while v2 is dark"
    (let [response (client/client-full-response (test.users/username->token :crowberto)
                                                :post "metabase-mcp"
                                                {:request-options {:headers {}}}
                                                (jsonrpc-request "initialize"))]
      (is (= 200 (:status response))))))

(deftest initialize-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-enabled true]
    (testing "initialize on the v2 path returns the handshake and a session header"
      (let [[session-id response] (initialize!)]
        (is (= 200 (:status response)))
        (is (some? session-id))
        (is (= "2025-03-26" (get-in response [:body :result :protocolVersion])))
        (is (= {:name "metabase" :version "0.1.0"} (get-in response [:body :result :serverInfo])))
        (testing "only tools are advertised — v2 answers resources/prompts with method-not-found"
          (is (= {:tools {:listChanged true}}
                 (get-in response [:body :result :capabilities]))))))))

(deftest tools-list-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-enabled true]
    (let [[session-id _] (initialize!)
          response       (mcp-v2-request (jsonrpc-request "tools/list")
                                         {"mcp-session-id" session-id})
          tools          (get-in response [:body :result :tools])]
      (testing "the registry drives tools/list; cookie sessions see every tool"
        (is (= 200 (:status response)))
        (is (some #(= "ping_v2" (:name %)) tools)))
      (testing "inputSchema is strict JSON Schema (required + closed), safe for strict clients"
        (let [schema (:inputSchema (first (filter #(= "ping_v2" (:name %)) tools)))]
          (is (= "object" (:type schema)))
          (is (false? (:additionalProperties schema))))))))

(deftest tools-call-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-enabled true]
    (let [[session-id _] (initialize!)]
      (testing "tools/call dispatches through the registry"
        (let [response (mcp-v2-request (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {}})
                                       {"mcp-session-id" session-id})
              result   (get-in response [:body :result])]
          (is (= 200 (:status response)))
          (is (not (:isError result)))
          (is (= {:ok true :message "pong"} (:structuredContent result)))))
      (testing "argument validation failures are teaching errors, not schema dumps"
        (let [response (mcp-v2-request (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {:message 42}})
                                       {"mcp-session-id" session-id})
              result   (get-in response [:body :result])]
          (is (:isError result))
          (is (str/starts-with? (-> result :content first :text) "Invalid arguments"))))
      (testing "an unknown tool is a method-not-found style error"
        (let [response (mcp-v2-request (jsonrpc-request "tools/call" {:name "nope" :arguments {}})
                                       {"mcp-session-id" session-id})
              result   (get-in response [:body :result])]
          (is (:isError result))
          (is (= "Unknown tool: nope" (-> result :content first :text))))))))

(deftest disabled-tools-kill-switch-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-enabled true]
    (let [[session-id _] (initialize!)]
      (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["ping_v2"]]
        (testing "a disabled tool disappears from tools/list"
          (let [response (mcp-v2-request (jsonrpc-request "tools/list")
                                         {"mcp-session-id" session-id})]
            (is (not (some #(= "ping_v2" (:name %))
                           (get-in response [:body :result :tools]))))))
        (testing "a disabled tool is rejected by tools/call as if it never existed"
          (let [response (mcp-v2-request (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {}})
                                         {"mcp-session-id" session-id})
                result   (get-in response [:body :result])]
            (is (:isError result))
            (is (= "Unknown tool: ping_v2" (-> result :content first :text)))))))))

(deftest unauthenticated-discovery-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-enabled true
                                     site-url "http://localhost:3000"]
    (testing "an unauthenticated v2 request advertises the v2 protected-resource metadata"
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options {:headers {}}}
                                                  (jsonrpc-request "initialize"))]
        (is (= 401 (:status response)))
        (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "")
                           "/.well-known/oauth-protected-resource/api/metabase-mcp/v2"))))))

(deftest protected-resource-metadata-test
  (testing "RFC 9728 metadata for the v2 path advertises the v2 resource and the net-new scopes"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [{:keys [body]} (#'oauth.metadata/protected-resource-metadata "/api/metabase-mcp/v2")]
        (is (str/ends-with? (:resource body) "/api/metabase-mcp/v2"))
        (is (contains? (set (:scopes_supported body)) "agent:search"))))))
