(ns metabase.mcp.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.macros.scope :as scope]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.api :as mcp.api]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.search.test-util :as search.tu]
   [metabase.system.settings :as system.settings]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;; Backend-only test runs don't produce embed-mcp.html; install the inline fallback.
(use-fixtures :each
  (fn [thunk]
    (mcp.resources/with-fallback-template (thunk))))

;;; --------------------------------------------------- Helpers ----------------------------------------------------

(defn- mcp-request
  "Make a POST request to /api/mcp with the given JSON-RPC body and optional extra headers.
   Authenticates as :crowberto (superuser) by default."
  ([body]
   (mcp-request body {}))
  ([body extra-headers]
   (client/client-full-response (test.users/username->token :crowberto)
                                :post "mcp"
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- mcp-request-as
  "Like `mcp-request` but authenticates as the given test username."
  [username body extra-headers]
  (client/client-full-response (test.users/username->token username)
                               :post "mcp"
                               {:request-options {:headers extra-headers}}
                               body))

(defn- mcp-request-unauthenticated
  "Make an unauthenticated POST request to /api/mcp."
  ([body]
   (mcp-request-unauthenticated body {}))
  ([body extra-headers]
   (client/client-full-response :post 401 "mcp"
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- mcp-request-with-bearer
  "Make a POST request to /api/mcp with a bearer token and optional extra headers."
  [bearer-token expected-status body extra-headers]
  (client/client-full-response :post expected-status "mcp"
                               {:request-options {:headers (merge {"authorization" (str "Bearer " bearer-token)}
                                                                  extra-headers)}}
                               body))

(defn- mcp-delete
  "Make a DELETE request to /api/mcp with optional headers.
   Authenticates as :crowberto (superuser) by default."
  [extra-headers]
  (client/client-full-response (test.users/username->token :crowberto)
                               :delete "mcp"
                               {:request-options {:headers extra-headers}}))

(def ^:private mcp-endpoint-paths
  "Client paths that serve the MCP endpoint, appended to the test client's `/api`: the canonical
   `metabase-mcp` and the legacy `mcp` alias."
  ["metabase-mcp" "mcp"])

(defn- mcp-request-to
  "Like `mcp-request` but to an explicit endpoint path (e.g. \"metabase-mcp\"), authenticated as :crowberto."
  [path body]
  (client/client-full-response (test.users/username->token :crowberto)
                               :post path
                               {:request-options {:headers {}}}
                               body))

(defn- mcp-request-unauthenticated-to
  "Make an unauthenticated POST to an explicit endpoint path, expecting a 401."
  [path body]
  (client/client-full-response :post 401 path {:request-options {:headers {}}} body))

(defn- jsonrpc-request
  "Build a JSON-RPC 2.0 request map."
  ([method]
   (jsonrpc-request method {} 1))
  ([method params]
   (jsonrpc-request method params 1))
  ([method params id]
   {:jsonrpc "2.0" :method method :params params :id id}))

(defn- jsonrpc-notification
  "Build a JSON-RPC 2.0 notification (no id)."
  ([method]
   (jsonrpc-notification method {}))
  ([method params]
   {:jsonrpc "2.0" :method method :params params}))

(def ^:private mcp-app-ui-capabilities
  {:extensions {:io.modelcontextprotocol/ui {:mimeTypes ["text/html;profile=mcp-app"]}}})

(defn- initialize-with-params!
  "Perform the full MCP initialize handshake with custom initialize params.
   Returns [session-id init-response]."
  [params]
  (let [response   (mcp-request (jsonrpc-request "initialize" params))
        session-id (get-in response [:headers "Mcp-Session-Id"])]
    ;; Complete the handshake so the session is marked initialized
    (mcp-request (jsonrpc-notification "notifications/initialized")
                 {"mcp-session-id" session-id})
    [session-id response]))

(defn- initialize!
  "Perform the full MCP initialize handshake (initialize + notifications/initialized).
   Returns [session-id init-response]."
  []
  (initialize-with-params! {:capabilities mcp-app-ui-capabilities}))

(defn- initialize-without-ui!
  "Perform the full MCP initialize handshake without MCP Apps UI capability.
   Returns [session-id init-response]."
  []
  (initialize-with-params! {}))

(defn- initialize-as!
  "Like `initialize!` but authenticates as the given test username."
  [username]
  (let [response   (mcp-request-as username
                                   (jsonrpc-request "initialize" {:capabilities mcp-app-ui-capabilities})
                                   {})
        session-id (get-in response [:headers "Mcp-Session-Id"])]
    (mcp-request-as username
                    (jsonrpc-notification "notifications/initialized")
                    {"mcp-session-id" session-id})
    [session-id response]))

(defn- call-tool
  "Call an MCP tool within an initialized session. Returns the parsed MCP result
   content (the JSON-decoded text from the first content block).
   Records test failures if the response status is not 200 or the tool returns an error."
  [session-id tool-name arguments]
  (let [response (mcp-request (jsonrpc-request "tools/call"
                                               {:name tool-name :arguments arguments})
                              {"mcp-session-id" session-id})
        result   (get-in response [:body :result])]
    (is (= 200 (:status response))
        (str "Expected 200 from tools/call " tool-name))
    (is (not (:isError result))
        (str "Tool " tool-name " error: " (some-> result :content first :text)))
    (when-not (:isError result)
      (is (contains? result :structuredContent)
          (str "Tool " tool-name " declared an outputSchema in tools/list but did "
               "not return structuredContent — MCP spec violation."))
      (json/decode+kw (:text (first (:content result)))))))

;;; ---------------------------------------------------- Tests -----------------------------------------------------

(deftest authentication-required-test
  (testing "unauthenticated requests return 401"
    (let [response (client/client-full-response :post 401 "mcp"
                                                (jsonrpc-request "initialize"))]
      (is (= 401 (:status response)))
      (is (= -32603 (get-in response [:body :error :code]))))))

(deftest origin-validation-test
  (testing "cross-origin browser requests are rejected when the origin is not configured"
    (let [response (mcp-request (jsonrpc-request "initialize")
                                {"host"   "mbtest.poom.dev"
                                 "origin" "http://127.0.0.1:6274"})]
      (is (= 403 (:status response)))
      (is (= "Origin not allowed" (get-in response [:body :error :message])))))
  (testing "cross-origin browser requests are accepted for configured MCP client origins"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins "http://127.0.0.1:6274"]
      (let [response (mcp-request (jsonrpc-request "initialize")
                                  {"host"   "mbtest.poom.dev"
                                   "origin" "http://127.0.0.1:6274"})]
        (is (= 200 (:status response)))
        (is (some? (get-in response [:headers "Mcp-Session-Id"]))))))
  (testing "same-origin requests with bracketed IPv6 hosts are accepted"
    (let [response (mcp-request (jsonrpc-request "initialize")
                                {"host"   "[::1]:3000"
                                 "origin" "http://[::1]:3000"})]
      (is (= 200 (:status response)))))
  (testing "same-origin requests with mixed-case host/origin are accepted"
    (let [response (mcp-request (jsonrpc-request "initialize")
                                {"host"   "Example.com"
                                 "origin" "https://example.COM"})]
      (is (= 200 (:status response)))))
  (testing "approved MCP origins match the Origin header case-insensitively"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins "https://Example.COM"]
      (let [response (mcp-request (jsonrpc-request "initialize")
                                  {"host"   "mbtest.poom.dev"
                                   "origin" "HTTPS://example.com"})]
        (is (= 200 (:status response)))
        (is (some? (get-in response [:headers "Mcp-Session-Id"]))))))
  (testing "a trailing slash on a configured MCP CORS origin has no effect (#75839)"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins "http://127.0.0.1:6274/"]
      (let [response (mcp-request (jsonrpc-request "initialize")
                                  {"host"   "mbtest.poom.dev"
                                   "origin" "http://127.0.0.1:6274"})]
        (is (= 200 (:status response)))
        (is (some? (get-in response [:headers "Mcp-Session-Id"])))))))

(deftest mcp-enabled-setting-test
  (testing "external MCP requests return 403 when disabled"
    (mt/with-temporary-setting-values [mcp.settings/mcp-enabled? false]
      (let [response (mcp-request (jsonrpc-request "initialize"))]
        (is (= 403 (:status response)))
        (is (= "MCP server is not enabled." (:body response)))))))

(deftest ai-features-enabled-setting-test
  (testing "external MCP requests return 403 when AI features are globally disabled"
    (mt/with-temporary-raw-setting-values [:ai-features-enabled? "false"
                                           :mcp-enabled?         "true"]
      (let [response (mcp-request (jsonrpc-request "initialize"))]
        (is (= 403 (:status response)))
        (is (= "AI features are not enabled." (:body response)))))))

(deftest initialize-test
  (testing "initialize returns protocol version, capabilities, and server info"
    (let [[session-id response] (initialize!)]
      (is (= 200 (:status response)))
      (is (some? session-id))
      (is (= "2.0" (get-in response [:body :jsonrpc])))
      (is (= 1 (get-in response [:body :id])))
      (let [result (get-in response [:body :result])]
        (is (= "2025-03-26" (:protocolVersion result)))
        (is (= {:tools {:listChanged true} :resources {}} (:capabilities result)))
        (is (= {:name "metabase" :version "0.1.0"} (:serverInfo result)))))))

(deftest notifications-initialized-test
  (testing "notifications/initialized returns 202"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-notification "notifications/initialized")
                                {"mcp-session-id" session-id})]
      (is (= 202 (:status response))))))

(deftest session-validation-test
  (testing "requests without a session ID return 400"
    (let [response (mcp-request (jsonrpc-request "tools/list"))]
      (is (= 400 (:status response)))
      (is (= -32600 (get-in response [:body :error :code])))))
  (testing "requests with an invalid session ID return 404"
    (let [response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" "bogus-session-id"})]
      (is (= 404 (:status response)))
      (is (= -32600 (get-in response [:body :error :code]))))))

(deftest session-delete-test
  (testing "DELETE succeeds for a valid session"
    (let [[session-id _] (initialize!)
          delete-response (mcp-delete {"mcp-session-id" session-id})]
      (is (= 200 (:status delete-response))))))

(def ^:private all-tool-names
  #{"construct_query"
    "create_collection"
    "create_dashboard"
    "create_question"
    "execute_query"
    "execute_sql"
    "query"
    "read_resource"
    "render_drill_through"
    "search"
    "update_dashboard"
    "update_question"
    "visualize_query"})

(deftest ui-tools-declare-required-extensions-test
  (testing "UI tools declare their own required client extensions"
    (doseq [{:keys [name required-extensions]} (mcp.resources/list-ui-tools)]
      (is (= #{:mcp-app-ui} required-extensions)
          (str name " should require MCP Apps UI support")))))

(deftest tools-list-all-tools-declare-required-hints-test
  (testing "every tool advertises readOnlyHint, destructiveHint, openWorldHint (some MCP clients reject tools that omit them)"
    (let [[session-id _] (initialize!)
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tools          (get-in response [:body :result :tools])]
      (is (seq tools) "tools/list should return at least one tool")
      (doseq [{:keys [name annotations]} tools]
        (is (contains? annotations :readOnlyHint)    (str name " missing :readOnlyHint"))
        (is (contains? annotations :destructiveHint) (str name " missing :destructiveHint"))
        (is (contains? annotations :openWorldHint)   (str name " missing :openWorldHint"))))))

(deftest tools-list-omits-ui-tools-without-ui-capability-test
  (testing "clients that do not advertise MCP Apps UI support do not see UI-only tools"
    (let [[session-id _] (initialize-without-ui!)
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tool-names     (set (map :name (get-in response [:body :result :tools])))]
      (is (= (disj all-tool-names "visualize_query" "render_drill_through") tool-names))
      (is (not (contains? tool-names "visualize_query")))
      (is (not (contains? tool-names "render_drill_through")))))
  (testing "clients that advertise MCP Apps UI support see UI-only tools"
    (let [[session-id _] (initialize!)
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tool-names     (set (map :name (get-in response [:body :result :tools])))]
      (is (contains? tool-names "visualize_query"))
      (is (contains? tool-names "render_drill_through")))))

(deftest ui-capability-detection-requires-mcp-ui-extension-test
  (testing "the MCP Apps UI extension path enables UI-only tools"
    (let [[session-id _] (initialize-with-params! {:capabilities mcp-app-ui-capabilities})
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tool-names     (set (map :name (get-in response [:body :result :tools])))]
      (is (contains? tool-names "visualize_query"))
      (is (contains? tool-names "render_drill_through"))))
  (testing "an unrelated nested MCP Apps mimeType does not enable UI-only tools"
    (let [[session-id _] (initialize-with-params!
                          {:capabilities {:experimental {:mimeTypes ["text/html;profile=mcp-app"]}}})
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tool-names     (set (map :name (get-in response [:body :result :tools])))]
      (is (not (contains? tool-names "visualize_query")))
      (is (not (contains? tool-names "render_drill_through"))))))

(deftest text-content-includes-structured-content-for-maps-test
  (testing "text-content emits structuredContent for map values — MCP spec requires it for tools with outputSchema"
    (let [text-content (var-get #'mcp.tools/text-content)]
      (testing "map → both content and structuredContent"
        (let [result (text-content {:foo "bar"})]
          (is (= {:foo "bar"} (:structuredContent result)))
          (is (= "{\"foo\":\"bar\"}" (-> result :content first :text)))))
      (testing "sequential → structuredContent is the collection"
        (is (= [1 2 3] (:structuredContent (text-content [1 2 3])))))
      (testing "string → no structuredContent (nothing to structure)"
        (let [result (text-content "ok")]
          (is (not (contains? result :structuredContent)))
          (is (= "ok" (-> result :content first :text))))))))

(deftest tool-result-emits-structured-content-test
  (testing "tools that declare outputSchema emit structuredContent — guards the regression where Claude Desktop got 500s because we declared outputSchema without matching structuredContent"
    (let [[session-id _] (initialize!)
          response       (mcp-request (jsonrpc-request "tools/call"
                                                       {:name      "read_resource"
                                                        :arguments {:uris ["metabase://databases"]}})
                                      {"mcp-session-id" session-id})
          result         (get-in response [:body :result])]
      (is (= 200 (:status response)))
      (is (not (:isError result))
          (str "read_resource should succeed: " (some-> result :content first :text)))
      (is (contains? result :structuredContent)
          "read_resource declares outputSchema → MUST emit structuredContent")
      (is (map? (:structuredContent result))
          "structuredContent should be the parsed response object, not a string")
      (is (sequential? (-> result :structuredContent :resources))
          "structuredContent should mirror the endpoint response shape"))))

(deftest tools-list-strict-shape-test
  (testing "no tool's inputSchema uses JSON-Schema constructs that ChatGPT's strict MCP validator rejects"
    ;; Pins the strict-shape guarantee across the whole exposed tool surface. `construct_query` had
    ;; this asserted before; broadening it to every tool catches drift in any wire schema (e.g.
    ;; `query`'s `:multi` body referencing agent-lib `:tuple` schemas) that would silently leak
    ;; `:allOf`/`:prefixItems`/`items:false` constructs into a tool that worked before the regression.
    (let [[session-id _] (initialize!)
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tools          (get-in response [:body :result :tools])]
      (is (pos? (count tools)))
      (doseq [{:keys [name inputSchema]} tools]
        (let [schema-keys (atom #{})]
          (walk/postwalk (fn [x] (when (map? x) (swap! schema-keys into (keys x))) x) inputSchema)
          (is (empty? (select-keys (frequencies @schema-keys) [:allOf :prefixItems]))
              (str "Tool " name " inputSchema contains :allOf or :prefixItems"))
          (is (not (some #(false? (:items %))
                         (->> (tree-seq coll? seq inputSchema) (filter map?))))
              (str "Tool " name " inputSchema contains `items: false` (tuple closure)")))))))

(deftest tools-list-test
  (testing "tools/list returns the agent and UI tools"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" session-id})
          tools (get-in response [:body :result :tools])]
      (is (= 200 (:status response)))
      (is (pos? (count tools)))
      (is (= all-tool-names (set (map :name tools))))
      (testing "each tool has a description and inputSchema"
        (doseq [tool tools]
          (is (string? (:description tool)))
          (is (map? (:inputSchema tool)))))
      (testing "search description guides clients toward the expected array shape"
        (let [tools-by-name   (into {} (map (juxt :name identity)) tools)
              search-tool     (get tools-by-name "search")
              property-schema (fn [tool-name property-name]
                                (or (get-in tools-by-name [tool-name :inputSchema :properties property-name])
                                    (get-in tools-by-name [tool-name :inputSchema :properties (keyword property-name)])))
              collect-leaves  (fn collect-leaves [schema]
                                (cond
                                  (nil? schema)         []
                                  (:oneOf schema)       (mapcat collect-leaves (:oneOf schema))
                                  (:anyOf schema)       (mapcat collect-leaves (:anyOf schema))
                                  :else                 [schema]))
              leaf-types      (fn [schema] (set (keep :type (collect-leaves schema))))
              array-branch    (fn [schema]
                                (some #(when (= "array" (:type %)) %) (collect-leaves schema)))]
          (is (str/includes? (:description search-tool) "arrays of strings"))
          (is (contains? (leaf-types (property-schema "search" "term_queries")) "array"))
          (is (= "string" (get-in (array-branch (property-schema "search" "term_queries")) [:items :type])))
          (is (contains? (leaf-types (property-schema "search" "semantic_queries")) "array"))
          (is (= "string" (get-in (array-branch (property-schema "search" "semantic_queries")) [:items :type])))))
      (testing "construct_query expects the portable external-query JSON body"
        (let [tools-by-name          (into {} (map (juxt :name identity)) tools)
              construct-query-tool   (get tools-by-name "construct_query")
              construct-query-schema (:inputSchema construct-query-tool)
              query-schema           (or (get-in construct-query-schema [:properties "query"])
                                         (get-in construct-query-schema [:properties :query]))
              required-fields        (set (:required construct-query-schema))
              ;; ::lib.schema/external-query is generated as a deeply-nested :allOf, so the
              ;; root :type tag lives under the first branch rather than the top level.
              query-leaf-type        (or (:type query-schema)
                                         (some :type (:allOf query-schema)))]
          (is (str/includes? (:description construct-query-tool) "construct_notebook_query"))
          (is (contains? required-fields "query"))
          (is (= "object" query-leaf-type)))))))

(deftest ping-test
  (testing "ping returns empty result"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "ping")
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (= {} (get-in response [:body :result]))))))

(deftest method-not-found-test
  (testing "unknown method returns -32601 error"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "nonexistent/method")
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (= -32601 (get-in response [:body :error :code]))))))

(deftest batch-request-test
  (testing "batch requests are processed together"
    (let [[session-id _] (initialize!)
          response (mcp-request [(jsonrpc-request "ping" {} 1)
                                 (jsonrpc-request "tools/list" {} 2)]
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (sequential? (:body response)))
      (is (= 2 (count (:body response))))
      (is (= #{1 2} (set (map :id (:body response))))))))

(deftest tools-call-unknown-tool-test
  (testing "calling an unknown tool returns isError content"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/call"
                                                 {:name "nonexistent_tool" :arguments {}})
                                {"mcp-session-id" session-id})
          result (get-in response [:body :result])]
      (is (= 200 (:status response)))
      (is (true? (:isError result)))
      (is (= "text" (:type (first (:content result))))))))

(deftest tools-call-search-test
  (testing "search tool invocation works and returns parseable results"
    ;; Revert to the in-place search engine so test doesn't depend on the appdb search index being built.
    (search.tu/with-legacy-search
      (let [[session-id _] (initialize!)
            response (mcp-request (jsonrpc-request "tools/call"
                                                   {:name      "search"
                                                    :arguments {:term_queries ["orders"]}})
                                  {"mcp-session-id" session-id})
            result   (get-in response [:body :result])]
        (is (= 200 (:status response)))
        (is (nil? (:isError result)))
        (is (= "text" (:type (first (:content result)))))
        (let [search-data (json/decode+kw (:text (first (:content result))))]
          (is (contains? search-data :data))
          (is (contains? search-data :total_count))))))
  (testing "search accepts a singleton string as a one-element query list"
    (search.tu/with-legacy-search
      (let [[session-id _] (initialize!)
            response       (mcp-request (jsonrpc-request "tools/call"
                                                         {:name      "search"
                                                          :arguments {:term_queries "orders"}})
                                        {"mcp-session-id" session-id})
            result         (get-in response [:body :result])]
        (is (= 200 (:status response)))
        (is (nil? (:isError result)))
        (let [search-data (json/decode+kw (:text (first (:content result))))]
          (is (contains? search-data :data))))))
  (testing "search coerces JSON-stringified arrays so clients that serialize args through a string layer still work"
    (search.tu/with-legacy-search
      (let [[session-id _] (initialize!)
            response       (mcp-request (jsonrpc-request "tools/call"
                                                         {:name      "search"
                                                          :arguments {:term_queries "[\"orders\"]"}})
                                        {"mcp-session-id" session-id})
            result         (get-in response [:body :result])]
        (is (= 200 (:status response)))
        (is (nil? (:isError result)))
        (let [search-data (json/decode+kw (:text (first (:content result))))]
          (is (contains? search-data :data))
          (is (contains? search-data :total_count)))))))

;;; ------------------------------------------------ SSE Transport -------------------------------------------------

(deftest sse-post-response-test
  (testing "POST with Accept: text/event-stream returns SSE format"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "ping")
                                {"mcp-session-id" session-id
                                 "accept"         "text/event-stream"})]
      (is (= 200 (:status response)))
      (is (= "text/event-stream" (get-in response [:headers "Content-Type"])))
      ;; Body should be SSE events (raw string since it's not JSON)
      (is (string? (:body response)))
      (is (str/includes? (:body response) "event: message"))
      (is (str/includes? (:body response) "data: "))))
  (testing "POST without Accept: text/event-stream returns JSON (backward-compatible)"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "ping")
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (= "application/json" (get-in response [:headers "Content-Type"])))
      ;; Body should be parsed JSON
      (is (map? (:body response))))))

(deftest sse-post-initialize-test
  (testing "initialize via SSE returns session header and SSE body"
    (let [response (mcp-request (jsonrpc-request "initialize")
                                {"accept" "text/event-stream"})]
      (is (= 200 (:status response)))
      (is (some? (get-in response [:headers "Mcp-Session-Id"])))
      (is (= "text/event-stream" (get-in response [:headers "Content-Type"])))
      (is (string? (:body response)))
      ;; Parse the SSE data line to verify JSON-RPC structure
      (let [data-line (->> (str/split-lines (:body response))
                           (filter #(str/starts-with? % "data: "))
                           first)
            json-data (json/decode+kw (subs data-line 6))]
        (is (= "2.0" (:jsonrpc json-data)))
        (is (= 1 (:id json-data)))
        (is (some? (get-in json-data [:result :protocolVersion])))))))

(deftest get-without-session-test
  (testing "GET without auth returns 401"
    (let [response (client/client-full-response (test.users/username->token :crowberto)
                                                :get "mcp")]
      (is (= 400 (:status response)))
      (is (= -32600 (get-in response [:body :error :code]))))))

(deftest initialized-notification-compatibility-test
  (testing "requests succeed without notifications/initialized"
    (let [response      (mcp-request (jsonrpc-request "initialize"))
          session-id    (get-in response [:headers "Mcp-Session-Id"])
          list-response (mcp-request (jsonrpc-request "tools/list")
                                     {"mcp-session-id" session-id})]
      (is (= 200 (:status list-response)))
      (is (some? (get-in list-response [:body :result :tools])))))
  (testing "notifications/initialized is accepted as a no-op for compatibility"
    (let [response   (mcp-request (jsonrpc-request "initialize"))
          session-id (get-in response [:headers "Mcp-Session-Id"])]
      (is (= 202 (:status (mcp-request (jsonrpc-notification "notifications/initialized")
                                       {"mcp-session-id" session-id})))))))

(deftest full-handshake-test
  (testing "complete MCP handshake flow"
    (let [[session-id _] (initialize!)
          list-response  (mcp-request (jsonrpc-request "tools/list")
                                      {"mcp-session-id" session-id})]
      (is (= 200 (:status list-response)))
      (is (seq (get-in list-response [:body :result :tools]))))))

(deftest batch-with-notifications-test
  (testing "batch with mix of notifications and requests returns only request responses"
    (let [[session-id _] (initialize!)
          response (mcp-request [(jsonrpc-notification "notifications/initialized")
                                 (jsonrpc-request "ping" {} 1)]
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (sequential? (:body response)))
      (is (= 1 (count (:body response))))
      (is (= 1 (:id (first (:body response))))))))

(deftest tools-call-missing-params-test
  (testing "tools/call without name returns an error"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/call"
                                                 {:arguments {}})
                                {"mcp-session-id" session-id})
          result (get-in response [:body :result])]
      (is (= 200 (:status response)))
      (is (true? (:isError result)))))
  (testing "tools/call with missing path params returns an error"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/call"
                                                 {:name "update_question" :arguments {}})
                                {"mcp-session-id" session-id})
          result (get-in response [:body :result])]
      (is (= 200 (:status response)))
      (is (true? (:isError result)))
      (is (str/includes? (:text (first (:content result))) "Missing required path parameter")))))

(deftest tools-call-string-body-error-surfaces-actionable-message-test
  (testing (str "Claude's connector review explicitly rejects bare-status error messages — "
                "when the agent-api returns a string body (e.g. 404 \"Not found.\"), the MCP "
                "error content surfaces the body verbatim rather than collapsing to "
                "\"Agent API error: <status>\".")
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/call"
                                                 {:name      "update_question"
                                                  :arguments {:id 999999 :name "Bogus"}})
                                {"mcp-session-id" session-id})
          result   (get-in response [:body :result])
          message  (:text (first (:content result)))]
      (is (= 200 (:status response)))
      (is (true? (:isError result)))
      (is (= "Not found." message)
          "string body should be surfaced verbatim")
      (is (not (str/includes? message "Agent API error"))
          "must not fall through to the bare-status fallback"))))

(deftest tools-list-no-refs-test
  (testing "tool inputSchemas have no $ref, no $defs, root type is always object,
            and no top-level oneOf/anyOf/allOf (rejected by mcpjam)"
    (let [tools (mcp.tools/list-tools nil)]
      (doseq [tool tools]
        (when-let [schema (:inputSchema tool)]
          (let [as-str (pr-str schema)]
            (testing (:name tool)
              (is (not (re-find #"\$ref" as-str))
                  (str (:name tool) " should have no $ref"))
              (is (not (contains? schema :$defs))
                  (str (:name tool) " should have no $defs"))
              (is (= "object" (:type schema))
                  (str (:name tool) " root type should be object"))
              (doseq [k [:oneOf :anyOf :allOf]]
                (is (not (contains? schema k))
                    (str (:name tool) " should have no top-level " k))))))))))

(defn- orders-count-query
  "Simple count query on the orders table — used as the dataset_query for smoke-test metrics."
  []
  (-> (lib/query (mt/metadata-provider)
                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
      (lib/aggregate (lib/count))))

(def ^:private smoke-tested-tools
  "Tools exercised by `tools-call-smoke-test`. New tools must be added here (and
   below) — the test compares this set against the Agent API-backed tools and
   fails when they diverge, ensuring no Agent API tool ships without a basic
   invocation check."
  #{"search" "construct_query" "query" "execute_query" "execute_sql"
    "read_resource"
    "create_question" "create_dashboard"
    "update_question" "update_dashboard" "create_collection"})

(deftest tools-call-smoke-test-covers-all-agent-api-backed-tools-test
  (testing "every Agent API-backed tool is exercised by the smoke test"
    (is (= (apply disj (set (map :name (mcp.tools/list-tools nil)))
                  ["visualize_query" "render_drill_through"])
           smoke-tested-tools)
        "Add the missing tool to `smoke-tested-tools` and the call sequence below.")))

(deftest tools-call-smoke-test
  (testing "every tool returns a successful response with valid parameters"
    (mt/with-temporary-setting-values [system.settings/site-url "https://stats.metabase.test"]
      (search.tu/with-legacy-search
        (mt/with-temp [:model/Card _metric {:name          "Smoke Metric"
                                            :type          :metric
                                            :database_id   (mt/id)
                                            :dataset_query (orders-count-query)}]
          (let [[session-id _] (initialize!)
                db-name        (t2/select-one-fn :name :model/Database (mt/id))
                orders-query   {:lib/type "mbql/query"
                                :stages   [{:lib/type     "mbql.stage/mbql"
                                            :source-table [db-name "PUBLIC" "ORDERS"]
                                            :limit        5}]}
                ;; Track write-tool outputs in atoms so the `finally` cleanup runs even if an
                ;; assertion in `call-tool` fails partway through the sequence.
                question-id    (atom nil)
                dash-id        (atom nil)
                coll-id        (atom nil)]
            (try
              (let [;; Discovery tools — call-tool helper asserts (not :isError) internally.
                    _              (call-tool session-id "search" {:term_queries ["orders"]})
                    ;; Query construction + execution
                    construct-data (call-tool session-id "construct_query" {:query orders-query})
                    _              (call-tool session-id "query" {:query orders-query})
                    _              (call-tool session-id "execute_query"
                                              {:query_handle (:query_handle construct-data)})
                    _              (call-tool session-id "execute_sql"
                                              {:database_id (mt/id)
                                               :sql         "SELECT 1"})
                    _              (call-tool session-id "read_resource"
                                              {:uris ["metabase://databases"]})
                    ;; Write tools — record IDs as soon as they're known so the `finally` block
                    ;; can clean up even if a later step throws.
                    question-data  (call-tool session-id "create_question"
                                              {:name  "Smoke Question"
                                               :query (mcp.session/read-handle session-id
                                                                               (mt/user->id :crowberto)
                                                                               (:query_handle construct-data))})
                    _              (reset! question-id (:id question-data))
                    _              (is (= (format "https://stats.metabase.test/question/%d" @question-id)
                                          (:url question-data)))
                    ;; No collection_id given → defaults to the caller's personal collection;
                    ;; collection_path must survive MCP forwarding.
                    _              (is (= (collection/user->personal-collection-name (mt/user->id :crowberto) :user)
                                          (:collection_path question-data)))
                    _              (call-tool session-id "update_question"
                                              {:id          (:id question-data)
                                               :description "Smoke updated description"})
                    dash-data      (call-tool session-id "create_dashboard"
                                              {:name "Smoke Dashboard"})
                    _              (reset! dash-id (:id dash-data))
                    _              (is (= (format "https://stats.metabase.test/dashboard/%d" @dash-id)
                                          (:url dash-data)))
                    _              (call-tool session-id "update_dashboard"
                                              {:id          (:id dash-data)
                                               :description "Smoke updated dashboard"})
                    coll-data      (call-tool session-id "create_collection"
                                              {:name "Smoke Collection"})]
                (reset! coll-id (:id coll-data)))
              (finally
                (when-let [qid @question-id] (t2/delete! :model/Card :id qid))
                (when-let [did @dash-id]     (t2/delete! :model/Dashboard :id did))
                (when-let [cid @coll-id]     (t2/delete! :model/Collection :id cid))))))))))

(deftest tools-call-visualize-query-direct-test
  (testing "visualize_query returns UI structured content"
    (let [result (mcp.tools/call-tool nil nil "visualize_query" {:query "card__1"})]
      (is (not (:isError result)))
      (is (=? {:content           [{:type "text"}]
               :structuredContent {:query "card__1"}}
              result)))))

(deftest tools-call-rejects-ui-tools-without-ui-capability-test
  (testing "direct calls to UI-only tools are rejected for clients without MCP Apps UI support"
    (let [[session-id _] (initialize-without-ui!)
          response       (mcp-request (jsonrpc-request "tools/call"
                                                       {:name      "visualize_query"
                                                        :arguments {:query "card__1"}})
                                      {"mcp-session-id" session-id})]
      (is (=? {:status 200
               :body   {:result {:isError true
                                 :content [{:text #(str/includes? % "requires a client that supports MCP Apps UI")}]}}}
              response)))))

(deftest tools-call-execute-query-test
  (testing "execute_query returns a streaming response captured as MCP text content"
    (let [streamed? (atom false)
          original-fn       (mt/original-fn #'mcp.tools/capture-streaming-response)]
      (mt/with-dynamic-fn-redefs [mcp.tools/capture-streaming-response
                                  (fn [response]
                                    (reset! streamed? true)
                                    (original-fn response))]
        (let [[session-id _] (initialize!)
              db-name        (t2/select-one-fn :name :model/Database (mt/id))
              external-query {:lib/type "mbql/query"
                              :stages   [{:lib/type     "mbql.stage/mbql"
                                          :source-table [db-name "PUBLIC" "ORDERS"]
                                          :limit        5}]}
              construct-data (call-tool session-id "construct_query" {:query external-query})
              execute-data   (call-tool session-id "execute_query"
                                        {:query_handle (:query_handle construct-data)})]
          (is (true? @streamed?) "execute_query should use the streaming response path")
          (is (=? {:status    "completed"
                   :row_count 5
                   :data      {:cols sequential?
                               :rows (fn [rows] (= 5 (count rows)))}}
                  execute-data)))))))

(deftest tools-call-query-accepts-query-handle-test
  (testing "the `query` tool resolves a query_handle and streams results, same as a fresh query body"
    (let [[session-id _] (initialize!)
          db-name        (t2/select-one-fn :name :model/Database (mt/id))
          external-query {:lib/type "mbql/query"
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table [db-name "PUBLIC" "ORDERS"]
                                      :limit        5}]}
          construct-data (call-tool session-id "construct_query" {:query external-query})
          query-data     (call-tool session-id "query"
                                    {:query_handle (:query_handle construct-data)})]
      (is (=? {:status             "completed"
               :row_count          5
               :continuation_token nil?
               :data               {:cols sequential?
                                    :rows (fn [rows] (= 5 (count rows)))}}
              query-data)))))

(deftest tools-call-query-stale-query-handle-test
  (testing "the `query` tool returns a tool-level error for an unknown handle rather than a 500"
    (let [[session-id _] (initialize!)
          result         (mcp-request (jsonrpc-request "tools/call"
                                                       {:name      "query"
                                                        :arguments {:query_handle (str (random-uuid))}})
                                      {"mcp-session-id" session-id})]
      (is (=? {:status 200
               :body   {:result {:isError true
                                 :content [{:text #(str/includes? % "Query handle not found")}]}}}
              result)))))

(deftest tools-call-create-question-accepts-query-handle-test
  (testing "create_question resolves query_handle through the MCP layer instead of requiring raw base64"
    (let [[session-id _] (initialize!)
          db-name        (t2/select-one-fn :name :model/Database (mt/id))
          construct-data (call-tool session-id "construct_query"
                                    {:query {:lib/type "mbql/query"
                                             :stages   [{:lib/type     "mbql.stage/mbql"
                                                         :source-table [db-name "PUBLIC" "ORDERS"]
                                                         :limit        5}]}})
          question-id    (atom nil)]
      (try
        (let [question-data (call-tool session-id "create_question"
                                       {:name         "Handle-Path Question"
                                        :query_handle (:query_handle construct-data)})]
          (reset! question-id (:id question-data))
          (is (pos-int? (:id question-data)))
          (is (= "Handle-Path Question" (:name question-data)))
          ;; Card was actually persisted with a dataset_query (handle resolved correctly).
          (is (some? (t2/select-one-fn :dataset_query :model/Card :id (:id question-data)))))
        (finally
          (when-let [qid @question-id] (t2/delete! :model/Card :id qid)))))))

(deftest tools-call-update-question-accepts-query-handle-test
  (testing "update_question resolves query_handle through the MCP layer"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Card To Re-query via Handle"
                                              :dataset_query (-> (lib/query (mt/metadata-provider)
                                                                            (lib.metadata/table (mt/metadata-provider)
                                                                                                (mt/id :orders)))
                                                                 (lib/aggregate (lib/count)))
                                              :display       :table}]
      (let [db-name         (t2/select-one-fn :name :model/Database (mt/id))
            products-id     (mt/id :products)
            products-fk     [db-name "PUBLIC" "PRODUCTS"]
            [session-id _]  (initialize!)
            construct-data  (call-tool session-id "construct_query"
                                       {:query {:lib/type "mbql/query"
                                                :stages   [{:lib/type     "mbql.stage/mbql"
                                                            :source-table products-fk
                                                            :limit        5}]}})
            update-data     (call-tool session-id "update_question"
                                       {:id           card-id
                                        :query_handle (:query_handle construct-data)})
            persisted       (t2/select-one-fn :dataset_query :model/Card :id card-id)
            persisted-table (some :source-table (:stages persisted))]
        (is (= card-id (:id update-data)))
        ;; Handle was resolved and applied to the card. Construct sends portable FKs over the
        ;; wire; the persisted dataset_query is the resolved MBQL 5 map with numeric IDs.
        (is (= products-id persisted-table)
            (str "Expected handle-resolved query's :source-table = products id " products-id
                 ", got " persisted-table))))))

(deftest tools-call-update-question-stale-query-handle-test
  (testing "An unknown query_handle returns a tool-level error rather than 500"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Stale-Handle Target"
                                              :dataset_query (-> (lib/query (mt/metadata-provider)
                                                                            (lib.metadata/table (mt/metadata-provider)
                                                                                                (mt/id :orders)))
                                                                 (lib/aggregate (lib/count)))
                                              :display       :table}]
      (let [[session-id _] (initialize!)
            response       (mcp-request (jsonrpc-request "tools/call"
                                                         {:name      "update_question"
                                                          :arguments {:id           card-id
                                                                      :query_handle (str (random-uuid))}})
                                        {"mcp-session-id" session-id})
            result         (get-in response [:body :result])]
        ;; JSON-RPC: HTTP 200, result.isError, friendly message.
        (is (= 200 (:status response)))
        (is (nil? (get-in response [:body :error])))
        (is (true? (:isError result)))
        (is (str/includes? (-> result :content first :text) "Query handle not found")
            "Stale handle should surface the dedicated message from mcp/tools.clj")
        ;; Card should be unchanged - still pointed at orders, not whatever the stale handle would have meant.
        (let [persisted (t2/select-one-fn :dataset_query :model/Card :id card-id)]
          (is (= (mt/id :orders) (some :source-table (:stages persisted)))
              "A stale handle must not mutate the card's source table."))))))

(deftest tools-call-update-dashboard-move-without-position-test
  (testing "Missing required field on a discriminated mutation surfaces as a tool error, not a JSON-RPC error"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "MCP move validation"}
                   :model/Card          {card-id :id} {:name "x" :dataset_query (-> (lib/query (mt/metadata-provider)
                                                                                               (lib.metadata/table (mt/metadata-provider)
                                                                                                                   (mt/id :orders)))
                                                                                    (lib/aggregate (lib/count)))
                                                       :display :table}
                   :model/DashboardCard {dc-id :id}   {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 0 :size_x 6 :size_y 4}]
      (let [[session-id _] (initialize!)
            response       (mcp-request (jsonrpc-request "tools/call"
                                                         {:name      "update_dashboard"
                                                          :arguments {:id        dash-id
                                                                      :dashcards [{:action "move" :dashcard_id dc-id}]}})
                                        {"mcp-session-id" session-id})
            result         (get-in response [:body :result])]
        ;; JSON-RPC layer: HTTP 200, response in `result` not `error`. Bad-input is a tool-level error.
        (is (= 200 (:status response)))
        (is (nil? (get-in response [:body :error])))
        (is (true? (:isError result))
            "missing :position on move should surface as a tool error")))))

(deftest tools-call-read-resource-test
  (testing "read_resource returns the shared dispatcher's response shape"
    (let [[session-id _] (initialize!)
          result         (call-tool session-id "read_resource"
                                    {:uris ["metabase://databases"]})]
      ;; `result` is the parsed MCP text-content JSON, which is the dispatcher's
      ;; full return map (`:resources` per-URI + formatted `:output` string).
      (is (sequential? (:resources result)))
      (is (= 1 (count (:resources result))))
      (is (= "metabase://databases" (-> result :resources first :uri)))
      (is (some? (-> result :resources first :content))
          "Top-level navigation URI must come back with :content (no :error)")
      (is (string? (:output result)))
      (is (str/includes? (:output result) "<resources>")
          "Output is XML-shaped for LLM consumption")))
  (testing "read_resource fetches a single-entity URI"
    (let [[session-id _] (initialize!)
          uri            (str "metabase://table/" (mt/id :orders))
          result         (call-tool session-id "read_resource" {:uris [uri]})]
      (is (= [uri] (mapv :uri (:resources result))))
      (is (some? (-> result :resources first :content)))))
  (testing "read_resource reports a per-URI error rather than failing the whole call"
    (let [[session-id _] (initialize!)
          result         (call-tool session-id "read_resource"
                                    {:uris ["metabase://nonsense/path"]})]
      (is (= 1 (count (:resources result))))
      (is (nil? (-> result :resources first :content)))
      (is (some? (-> result :resources first :error))))))

;;; ----------------------------------------------- Drill Handles ---------------------------------------------------

(deftest render-drill-through-publishes-its-own-resource-uri-test
  (testing "render_drill_through publishes a distinct `_meta.ui.resourceUri` from visualize_query — ChatGPT dedupes iframes by URI, and reusing the visualize_query URI would prevent a fresh drill widget from mounting"
    (let [[session-id _] (initialize!)
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tools-by-name  (into {} (map (juxt :name identity)) (get-in response [:body :result :tools]))
          drill-uri      (get-in tools-by-name ["render_drill_through" :_meta :ui :resourceUri])
          viz-uri        (get-in tools-by-name ["visualize_query"      :_meta :ui :resourceUri])]
      (is (string? drill-uri))
      (is (string? viz-uri))
      (is (not= drill-uri viz-uri)
          "render_drill_through and visualize_query must publish different resourceUris"))))

(deftest tools-call-render-drill-through-test
  (testing "render_drill_through resolves a stored handle to its encoded query"
    (let [user-id        (mt/user->id :crowberto)
          [session-id _] (initialize!)
          handle         (mt/with-current-user user-id
                           (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA=="))]
      ;; The error path returns no :structuredContent, so asserting it is present is
      ;; equivalent to asserting :isError is not set.
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query "ZW5jb2RlZA=="}}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "render_drill_through"
                                             :arguments {:handle handle}})
                           {"mcp-session-id" session-id})))))
  (testing "render_drill_through returns an error when the handle is unknown"
    (let [[session-id _] (initialize!)]
      (is (=? {:status 200
               :body   {:result {:isError true}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "render_drill_through"
                                             :arguments {:handle (str (random-uuid))}})
                           {"mcp-session-id" session-id}))))))

(deftest tools-call-visualize-query-test
  (testing "visualize_query echoes the inline query"
    (let [[session-id _] (initialize!)]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query "ZW5jb2RlZA=="}}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "visualize_query"
                                             :arguments {:query "ZW5jb2RlZA=="}})
                           {"mcp-session-id" session-id}))))))

(deftest tools-call-visualize-query-test-2
  (testing "visualize_query resolves a stored handle"
    (let [user-id        (mt/user->id :crowberto)
          [session-id _] (initialize!)
          handle         (mt/with-current-user user-id
                           (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA=="))]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query "ZW5jb2RlZA=="}}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "visualize_query"
                                             :arguments {:query_handle handle}})
                           {"mcp-session-id" session-id}))))))

(deftest tools-call-visualize-query-test-3
  (testing "visualize_query includes the prompt stored with a construct_query handle"
    ;; Mirrors master's assertion that the user's original prompt round-trips through the
    ;; construct→store→visualize flow so the iframe can include it when submitting
    ;; visualization feedback. Adapted from master's `:source`/`:operations` shape to our
    ;; branch's `:query` representations shape; the `:prompt` round-trip semantic is
    ;; preserved exactly.
    (let [[session-id _] (initialize!)
          db-name        (t2/select-one-fn :name :model/Database (mt/id))
          external-query {:lib/type "mbql/query"
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table [db-name "PUBLIC" "ORDERS"]
                                      :limit        5}]}
          construct-data (call-tool session-id "construct_query"
                                    {:query  external-query
                                     :prompt "show 5 orders"})
          response       (mcp-request (jsonrpc-request "tools/call"
                                                       {:name      "visualize_query"
                                                        :arguments {:query_handle (:query_handle construct-data)}})
                                      {"mcp-session-id" session-id})]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query  string?
                                                     :prompt "show 5 orders"}}}}
              response)))))

(deftest tools-call-visualize-query-test-4
  (testing "visualize_query asks for an argument when neither query nor handle is provided"
    (let [[session-id _] (initialize!)]
      (is (=? {:status 200
               :body   {:result {:isError true
                                 :content [{:text #(str/includes? % "Provide either")}]}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "visualize_query"
                                             :arguments {}})
                           {"mcp-session-id" session-id}))))))

(deftest tools-call-visualize-query-test-5
  (testing "visualize_query returns 'handle not found' when query_handle is unknown"
    (let [[session-id _] (initialize!)]
      (is (=? {:status 200
               :body   {:result {:isError true
                                 :content [{:text #(str/includes? % "Query handle not found")}]}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "visualize_query"
                                             :arguments {:query_handle (str (random-uuid))}})
                           {"mcp-session-id" session-id}))))))

;;; --------------------------------------- cross-session handle resolution -------------------------------------

(deftest tools-expose-output-schema-test
  (testing "MCP tools/list declares outputSchema for tools that emit structuredContent"
    (let [[session-id _] (initialize!)
          response       (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
          tools          (get-in response [:body :result :tools])
          tools-by-name  (into {} (map (juxt :name identity)) tools)]
      (testing "construct_query advertises {query_handle} as its output"
        (let [output-schema (get-in tools-by-name ["construct_query" :outputSchema])
              prop-names    (set (map name (keys (:properties output-schema))))]
          (is (= "object" (:type output-schema)))
          (is (contains? prop-names "query_handle"))
          (is (not (contains? prop-names "widgetSessionId"))
              "widgetSessionId was retired in favour of cross-session per-user lookup")))
      (testing "visualize_query advertises its structuredContent shape"
        (let [output-schema (get-in tools-by-name ["visualize_query" :outputSchema])]
          (is (= "object" (:type output-schema)))
          (is (contains? (set (map name (keys (:properties output-schema)))) "query"))))
      (testing "render_drill_through advertises its structuredContent shape"
        (let [output-schema (get-in tools-by-name ["render_drill_through" :outputSchema])]
          (is (= "object" (:type output-schema)))
          (is (contains? (set (map name (keys (:properties output-schema)))) "query")))))))

(deftest construct-query-returns-bare-handle-test
  (testing "construct_query returns just `{:query_handle uuid}` — no widget session plumbing"
    ;; Adapted from master's `:source`/`:operations` legacy program shape to our branch's
    ;; representations `:query` shape. The semantic — that the response is a bare handle
    ;; with no widgetSessionId field — is preserved.
    (let [[session-id _] (initialize!)
          db-name        (t2/select-one-fn :name :model/Database (mt/id))
          external-query {:lib/type "mbql/query"
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table [db-name "PUBLIC" "ORDERS"]
                                      :limit        5}]}
          construct-data (call-tool session-id "construct_query"
                                    {:query  external-query
                                     :prompt "show 5 orders"})]
      (is (some? (parse-uuid (:query_handle construct-data))))
      (is (not (contains? construct-data :widgetSessionId))))))

(deftest visualize-query-resolves-via-cross-session-fallback-test
  (testing "visualize_query resolves a handle stored in another session of the same user — no widgetSessionId needed"
    (let [user-id             (mt/user->id :crowberto)
          [owner-session _]   (initialize!)
          [rotated-session _] (initialize!)
          handle              (mt/with-current-user user-id
                                (mcp.session/store-handle! owner-session user-id "ZW5jb2RlZA=="))]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query "ZW5jb2RlZA=="}}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "visualize_query"
                                             :arguments {:query_handle handle}})
                           {"mcp-session-id" rotated-session}))))))

(deftest execute-query-resolves-via-cross-session-fallback-test
  (testing "execute_query resolves a handle stored in another session of the same user — no widgetSessionId needed"
    ;; Adapted from master's `:source`/`:operations` legacy program shape to our branch's
    ;; representations `:query` shape. The semantic — cross-session same-user resolution —
    ;; is preserved.
    (let [[owner-session _]   (initialize!)
          [rotated-session _] (initialize!)
          db-name             (t2/select-one-fn :name :model/Database (mt/id))
          external-query      {:lib/type "mbql/query"
                               :stages   [{:lib/type     "mbql.stage/mbql"
                                           :source-table [db-name "PUBLIC" "ORDERS"]
                                           :limit        5}]}
          construct-data      (call-tool owner-session "construct_query"
                                         {:query  external-query
                                          :prompt "show 5 orders"})
          response            (mcp-request (jsonrpc-request "tools/call"
                                                            {:name      "execute_query"
                                                             :arguments {:query_handle (:query_handle construct-data)}})
                                           {"mcp-session-id" rotated-session})]
      (is (= 200 (:status response)))
      (is (not (get-in response [:body :result :isError]))))))

(deftest render-drill-through-resolves-via-cross-session-fallback-test
  (testing "render_drill_through resolves a handle stored in another session of the same user"
    (let [user-id             (mt/user->id :crowberto)
          [owner-session _]   (initialize!)
          [rotated-session _] (initialize!)
          handle              (mt/with-current-user user-id
                                (mcp.session/store-handle! owner-session user-id "ZW5jb2RlZA=="))]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query "ZW5jb2RlZA=="}}}}
              (mcp-request (jsonrpc-request "tools/call"
                                            {:name      "render_drill_through"
                                             :arguments {:handle handle}})
                           {"mcp-session-id" rotated-session}))))))

(deftest visualize-query-refuses-cross-user-handle-test
  (testing "visualize_query refuses to resolve another user's handle"
    (let [owner-id              (mt/user->id :crowberto)
          [owner-session _]     (initialize!)                     ;; crowberto
          ;; Fresh UUID-shaped sentinel for the stored payload so the leak
          ;; assertion below can't accidentally match against any other test fixture.
          encoded-payload       (str (random-uuid))
          handle                (mt/with-current-user owner-id
                                  (mcp.session/store-handle! owner-session owner-id encoded-payload))
          [attacker-session _]  (initialize-as! :rasta)
          response              (mcp-request-as :rasta
                                                (jsonrpc-request "tools/call"
                                                                 {:name      "visualize_query"
                                                                  :arguments {:query_handle handle}})
                                                {"mcp-session-id" attacker-session})]
      (testing "the response is an error, NOT crowberto's encoded query"
        (is (=? {:status 200
                 :body   {:result {:isError true
                                   :content [{:text #(str/includes? % "Query handle not found")}]}}}
                response))
        (is (not= encoded-payload
                  (get-in response [:body :result :structuredContent :query]))
            "cross-user handle resolution must fail")))))

;;; --------------------------------------------- OAuth Bearer Auth -------------------------------------------------

(deftest unauthenticated-returns-401-test
  (testing "POST without any auth returns 401 with WWW-Authenticate discovery header"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (mcp-request-unauthenticated (jsonrpc-request "initialize"))]
        (is (=? {:status  401
                 :headers {"WWW-Authenticate" #(str/includes? % "oauth-protected-resource")}}
                response))))))

;;; ----------------------------------------- Canonical and legacy endpoints ---------------------------------------

(deftest endpoint-alias-routing-test
  (testing "initialize succeeds (session auth) on both the canonical and legacy MCP paths"
    (doseq [path mcp-endpoint-paths]
      (testing (str "/api/" path)
        (is (=? {:status  200
                 :headers {"Mcp-Session-Id" some?}
                 :body    {:result {:serverInfo {:name "metabase"}}}}
                (mcp-request-to path (jsonrpc-request "initialize"))))))))

(deftest endpoint-alias-discovery-401-test
  (testing "unauthenticated request on each path advertises that same path as the protected resource"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (doseq [path mcp-endpoint-paths]
        (testing (str "/api/" path)
          ;; The trailing quote pins the match to the exact path (so /api/mcp can't match /api/metabase-mcp).
          (let [expected (str "/.well-known/oauth-protected-resource/api/" path "\"")]
            (is (=? {:status  401
                     :headers {"WWW-Authenticate" #(str/includes? % expected)}}
                    (mcp-request-unauthenticated-to path (jsonrpc-request "initialize"))))))))))

(deftest endpoint-alias-trailing-slash-discovery-test
  (testing "a trailing-slash request still advertises the matching path (not canonical fallback)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [expected "/.well-known/oauth-protected-resource/api/mcp\""]
        (is (=? {:status  401
                 :headers {"WWW-Authenticate" #(str/includes? % expected)}}
                (mcp-request-unauthenticated-to "mcp/" (jsonrpc-request "initialize"))))))))

(deftest endpoint-alias-bearer-token-test
  (testing "bearer-token handling is identical on the legacy path — same invalid_token 401 as canonical"
    ;; Bearer validation (validate-bearer-token) has no path logic, so reaching it via the legacy
    ;; alias must behave exactly like the canonical path. We assert the invalid-token branch since
    ;; it's deterministic and doesn't depend on minting a live token.
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-server/reset-provider!)
      (try
        (doseq [path mcp-endpoint-paths]
          (testing (str "/api/" path)
            (is (=? {:status  401
                     :headers {"WWW-Authenticate" #(str/includes? % "invalid_token")}}
                    (client/client-full-response
                     :post 401 path
                     {:request-options {:headers {"authorization" "Bearer totally-bogus-token"}}}
                     (jsonrpc-request "initialize"))))))
        (finally
          (oauth-server/reset-provider!))))))

(deftest invalid-bearer-token-returns-401-test
  (testing "POST with invalid bearer token returns 401 with invalid_token error"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-server/reset-provider!)
      (try
        (let [response (mcp-request-with-bearer "totally-bogus-token" 401
                                                (jsonrpc-request "initialize")
                                                {})]
          (is (=? {:status  401
                   :headers {"WWW-Authenticate" #(str/includes? % "invalid_token")}}
                  response)))
        (finally
          (oauth-server/reset-provider!))))))

;;; ---------------------------------------------- Resources -------------------------------------------------------

(def ^:private construct-query-uri "metabase://docs/construct-query.md")

(deftest resources-list-test
  (testing "resources/list returns the registered construct-query reference resource"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "resources/list")
                                {"mcp-session-id" session-id})
          resources (get-in response [:body :result :resources])]
      (is (= 200 (:status response)))
      (is (=? [{:uri         construct-query-uri
                :name        "Construct Query Reference"
                :description string?
                :mimeType    "text/markdown"}]
              (filter #(= construct-query-uri (:uri %)) resources))))))

(deftest resources-read-test
  (testing "resources/read returns the markdown contents for the construct-query reference"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "resources/read"
                                                 {:uri construct-query-uri})
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (=? {:contents [{:uri      construct-query-uri
                           :mimeType "text/markdown"
                           :text     #(str/starts-with? % "# Construct Query Reference")}]}
              (get-in response [:body :result])))))
  (testing "resources/read for an unknown URI returns -32602"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "resources/read"
                                                 {:uri "metabase://does/not/exist"})
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (= -32602 (get-in response [:body :error :code])))))
  (testing "resources/read with missing :uri reports the missing parameter"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "resources/read" {})
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (=? {:error {:code    -32602
                       :message #(str/starts-with? % "Missing required parameter")}}
              (:body response)))))
  (testing "resources/read with a blank :uri reports the missing parameter (not 'Resource not found')"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "resources/read" {:uri ""})
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (=? {:error {:code    -32602
                       :message #(str/starts-with? % "Missing required parameter")}}
              (:body response))))))

(def ^:private scoped-test-uri "test://mcp/api-test/scoped")

(defn- dispatch-initialized-request [msg token-scopes]
  (let [session-id (str (random-uuid))]
    (#'mcp.api/dispatch-request msg session-id token-scopes)))

(defn- with-scoped-test-resource! [f]
  (let [registry @#'mcp.resources/registry
        snapshot @registry]
    (try
      (mcp.resources/register-resource!
       {:uri         scoped-test-uri
        :name        "Scoped Test Resource"
        :description "Requires the agent:search scope."
        :scope       "agent:search"
        :mimeType    "text/plain"
        :render-fn   (constantly "secret body")})
      (f)
      (finally
        (reset! registry snapshot)))))

(deftest ui-resource-read-not-found-test
  (testing "resources/read returns -32602 \"Resource not found\" when caller lacks the required scope"
    (with-scoped-test-resource!
      (fn []
        (let [response (dispatch-initialized-request
                        (jsonrpc-request "resources/read" {:uri scoped-test-uri})
                        #{"agent:other"})]
          (is (=? {:jsonrpc "2.0"
                   :id      1
                   :error   {:code    -32602
                             :message "Resource not found"}}
                  response))))))
  (testing "resources/read for a scoped resource succeeds when the caller has a matching scope"
    (with-scoped-test-resource!
      (fn []
        (let [response (dispatch-initialized-request
                        (jsonrpc-request "resources/read" {:uri scoped-test-uri})
                        #{"agent:search"})]
          (is (=? {:result {:contents [{:uri  scoped-test-uri
                                        :text "secret body"}]}}
                  response)))))))

(deftest resources-list-scope-filtering-test
  (testing "resources/list omits scoped resources the caller cannot access"
    (with-scoped-test-resource!
      (fn []
        (let [response (#'mcp.api/dispatch-request
                        (jsonrpc-request "resources/list")
                        "session-id"
                        #{"agent:other"})
              uris    (set (map :uri (get-in response [:result :resources])))]
          (is (contains? uris construct-query-uri)
              "public construct-query reference is still listed")
          (is (not (contains? uris scoped-test-uri))
              "scoped resource must not leak via resources/list")))))
  (testing "resources/list includes scoped resources for callers with matching scope"
    (with-scoped-test-resource!
      (fn []
        (let [response (#'mcp.api/dispatch-request
                        (jsonrpc-request "resources/list")
                        "session-id"
                        #{"agent:search"})
              uris    (set (map :uri (get-in response [:result :resources])))]
          (is (contains? uris scoped-test-uri)))))))

;;; --------------------------------------------- Scope Filtering ---------------------------------------------------

(deftest tools-list-scope-filtering-test
  (testing "tools/list with unrestricted scopes returns all tools"
    (let [tools (mcp.tools/list-tools #{::scope/unrestricted})]
      (is (= all-tool-names (set (map :name tools))))))
  (testing "tools/list with specific scope only returns matching tools"
    (let [tools     (mcp.tools/list-tools #{"agent:search"})
          tool-names (set (map :name tools))]
      ;; Should include search (matches scope)
      (is (contains? tool-names "search"))
      ;; Should NOT include tools with other scopes
      (is (not (contains? tool-names "update_question")))
      (is (not (contains? tool-names "construct_query")))))
  (testing "tools/list with wildcard scope matches all agent and UI tools"
    (let [tools (mcp.tools/list-tools #{"agent:*"})]
      (is (= all-tool-names (set (map :name tools))))))
  (testing "tools/list with nil scopes returns all tools"
    (let [tools (mcp.tools/list-tools nil)]
      (is (= all-tool-names (set (map :name tools))))))
  (testing "tools/list with empty scopes does not return all tools"
    (let [tools (mcp.tools/list-tools #{})]
      (is (empty? tools)
          "Empty scopes should not grant access to scoped tools"))))

(defn- insert-expired-oauth-token!
  "Insert an OAuth access token into the DB with an expiry in the past.
   Returns the token string."
  [user-id client-id]
  (let [token   (str (random-uuid))
        expired (- (quot (System/currentTimeMillis) 1000) 3600)]
    (t2/insert! :model/OAuthAccessToken
                {:token     token
                 :user_id   user-id
                 :client_id client-id
                 :scope     ["openid"]
                 :expiry    expired})
    token))

(deftest expired-oauth-bearer-token-returns-401-test
  (testing "POST with expired OAuth bearer token returns 401"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (oauth-server/reset-provider!)
        (let [user-id  (mt/user->id :crowberto)
              token    (insert-expired-oauth-token! user-id (str (random-uuid)))
              response (mcp-request-with-bearer token 401
                                                (jsonrpc-request "initialize")
                                                {})]
          (is (=? {:status  401
                   :headers {"WWW-Authenticate" #(str/includes? % "invalid_token")}}
                  response)))))))

(deftest tools-call-scope-enforcement-test
  (mt/with-temp [:model/Card {card-id :id} {:name          "Scope Test Card"
                                            :dataset_query (orders-count-query)
                                            :display       :table}]
    (testing "tool call is rejected when token scopes don't include the required scope"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (mcp.tools/call-tool #{"agent:search"} nil "update_question"
                                          {:id card-id :name "Renamed"}))]
        (is (=? {:isError true} result))
        (is (str/includes? (-> result :content first :text) "Insufficient scope")
            "Scope enforcement error from defendpoint middleware")))
    (testing "tool call with matching scope is not rejected by scope enforcement"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (mcp.tools/call-tool #{"agent:question:update"} nil "update_question"
                                          {:id card-id :name "Renamed Again"}))]
        (is (not (:isError result)))))
    (testing "tool call with empty scopes is rejected for scoped tools"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (mcp.tools/call-tool #{} nil "update_question"
                                          {:id card-id :name "Nope"}))]
        (is (=? {:isError true} result))
        (is (str/includes? (-> result :content first :text) "Insufficient scope")
            "Scope enforcement error from defendpoint middleware"))))
  (testing "scope failures take precedence over missing client extensions"
    (let [result (mt/with-current-user (mt/user->id :crowberto)
                   (mcp.tools/call-tool #{} nil "visualize_query" {:query "card__1"} {:supports-mcp-ui? false}))
          message (-> result :content first :text)]
      (is (=? {:isError true} result))
      (is (str/includes? message "Insufficient scope"))
      (is (not (str/includes? message "requires a client that supports MCP Apps UI"))))))

(deftest check-resource-access-test
  (testing "returns :ok for a known URI with matching scope"
    (is (= :ok (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{"agent:viz:mcp-ui:query"}))))
  (testing "returns :ok with wildcard scope"
    (is (= :ok (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{"agent:*"}))))
  (testing "returns :scope-denied for a known URI with non-matching scope"
    (is (= :scope-denied (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{"agent:search"}))))
  (testing "returns :scope-denied for a known URI with empty scopes"
    (is (= :scope-denied (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{}))))
  (testing "returns :not-found for an unknown URI"
    (is (= :not-found (mcp.resources/check-resource-access "ui://metabase/nonexistent.html" #{"agent:*"})))))

(deftest resources-read-scope-denied-test
  (testing "resources/read returns -32602 for unknown URI"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "resources/read"
                                                 {:uri "ui://metabase/nonexistent.html"})
                                {"mcp-session-id" session-id})]
      (is (= 200 (:status response)))
      (is (= -32602 (get-in response [:body :error :code])))
      (is (= "Resource not found"
             (get-in response [:body :error :message]))))))

(deftest agent-api-preserves-token-scopes-test
  (testing "scoped token restrictions are enforced by the Agent API layer (defense-in-depth)"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Scope Probe Card"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (testing "restricted scopes that don't match the endpoint are rejected by Agent API"
        (let [result (mt/with-current-user (mt/user->id :crowberto)
                       ;; Bypass the MCP scope check by calling invoke-agent-api directly
                       ;; with scopes that don't match the endpoint's required scope (agent:question:update)
                       (#'mcp.tools/invoke-agent-api :put (str "/v1/question/" card-id) #{"agent:search"}
                                                     {:name "Probe"}))]
          (is (=? {:isError true} result)
              "Agent API should reject when token scopes don't include the required scope")))
      (testing "matching scopes are accepted by Agent API"
        (let [result (mt/with-current-user (mt/user->id :crowberto)
                       (#'mcp.tools/invoke-agent-api :put (str "/v1/question/" card-id) #{"agent:question:update"}
                                                     {:name "Probe"}))]
          (is (not (:isError result))
              "Agent API should accept when token scopes include the required scope")))
      (testing "unrestricted scopes are accepted by Agent API"
        (let [result (mt/with-current-user (mt/user->id :crowberto)
                       (#'mcp.tools/invoke-agent-api :put (str "/v1/question/" card-id) #{::scope/unrestricted}
                                                     {:name "Probe"}))]
          (is (not (:isError result))
              "Agent API should accept unrestricted scopes"))))))

(deftest mcp-does-not-depend-on-external-agent-api-setting-test
  (testing "MCP tool calls still work when the external Agent API is disabled"
    (mt/with-temporary-setting-values [agent-api.settings/agent-api-enabled? false]
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (mcp.tools/call-tool #{::scope/unrestricted} nil "read_resource"
                                          {:uris ["metabase://databases"]}))]
        (is (not (:isError result)))))))

;;; ------------------------------------------------- Throttling ---------------------------------------------------

(deftest mcp-throttle-returns-429-test
  (testing "MCP endpoint returns 429 with JSON-RPC error when rate-limited"
    (let [[session-id _] (initialize!)]
      ;; Replace throttler after initialization so the handshake doesn't consume attempts
      (with-redefs [mcp.api/mcp-throttler (throttle/make-throttler :user-id :attempts-threshold 1)]
        ;; First request succeeds (consumes the single attempt)
        (is (= 200 (:status (mcp-request (jsonrpc-request "ping")
                                         {"mcp-session-id" session-id}))))
        ;; Second request should be throttled
        (is (=? {:status  429
                 :headers {"Retry-After" string?}
                 :body    {:jsonrpc "2.0"
                           :error   {:code    -32000
                                     :message #(str/starts-with? % "Too many attempts!")}}}
                (mcp-request (jsonrpc-request "ping")
                             {"mcp-session-id" session-id})))))))

;;; -------------------------------------------- Session Lifecycle -------------------------------------------------

(deftest session-embedding-reuse-test
  (testing "multiple resources/read calls within one session reuse the same embedding session"
    (let [[session-id _] (initialize!)
          read1 (mcp-request (jsonrpc-request "resources/read"
                                              {:uri "ui://metabase/visualize-query.html"} 1)
                             {"mcp-session-id" session-id})
          read2 (mcp-request (jsonrpc-request "resources/read"
                                              {:uri "ui://metabase/visualize-query.html"} 2)
                             {"mcp-session-id" session-id})]
      (is (= 200 (:status read1)))
      (is (= 200 (:status read2)))
      ;; Both responses should contain the same session token in the rendered HTML
      (let [html1 (-> (get-in read1 [:body :result :contents]) first :text)
            html2 (-> (get-in read2 [:body :result :contents]) first :text)]
        (is (some? html1))
        (is (= html1 html2)
            "Same embedding session should produce identical HTML output")))))

(deftest batch-initialized-then-resources-read-test
  (testing "batch containing notifications/initialized + resources/read succeeds"
    (let [response      (mcp-request (jsonrpc-request "initialize"))
          session-id    (get-in response [:headers "Mcp-Session-Id"])
          batch-response (mcp-request [(jsonrpc-notification "notifications/initialized")
                                       (jsonrpc-request "resources/read"
                                                        {:uri "ui://metabase/visualize-query.html"} 1)]
                                      {"mcp-session-id" session-id})]
      (is (=? {:status 200
               :body   [{:id     1
                         :result {:contents some?}}]}
              batch-response)))))
