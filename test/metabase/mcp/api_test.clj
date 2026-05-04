(ns metabase.mcp.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.api :as mcp.api]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

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

(defn- initialize!
  "Perform the full MCP initialize handshake (initialize + notifications/initialized).
   Returns [session-id init-response]."
  []
  (let [response   (mcp-request (jsonrpc-request "initialize"))
        session-id (get-in response [:headers "Mcp-Session-Id"])]
    ;; Complete the handshake so the session is marked initialized
    (mcp-request (jsonrpc-notification "notifications/initialized")
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
      (json/decode+kw (:text (first (:content result)))))))

;;; ---------------------------------------------------- Tests -----------------------------------------------------

(deftest authentication-required-test
  (testing "unauthenticated requests return 401"
    (let [response (client/client-full-response :post 401 "mcp"
                                                (jsonrpc-request "initialize"))]
      (is (= 401 (:status response)))
      (is (= -32603 (get-in response [:body :error :code]))))))

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
        (is (= {:tools {}} (:capabilities result)))
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
      (is (= -32600 (get-in response [:body :error :code]))))))

(deftest degenerate-session-id-test
  (testing "requests with any nonblank session ID are accepted"
    (let [response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" "bogus-session-id"})]
      (is (= 200 (:status response)))
      (is (some? (get-in response [:body :result :tools]))))))

(deftest session-delete-test
  (testing "DELETE succeeds but does not invalidate a degenerate session ID"
    (let [[session-id _] (initialize!)
          delete-response (mcp-delete {"mcp-session-id" session-id})
          post-response (mcp-request (jsonrpc-request "tools/list")
                                     {"mcp-session-id" session-id})]
      (is (= 200 (:status delete-response)))
      (is (= 200 (:status post-response))))))

(deftest tools-list-test
  (testing "tools/list returns the 10 agent tools"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" session-id})
          tools (get-in response [:body :result :tools])]
      (is (= 200 (:status response)))
      (is (pos? (count tools)))
      (is (= #{"search" "get_table" "get_metric" "get_table_field_values"
               "get_metric_field_values" "construct_query" "execute_query" "query"
               "create_question" "create_dashboard"}
             (set (map :name tools))))
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
          (is (= "string" (get-in (array-branch (property-schema "search" "semantic_queries")) [:items :type]))))))))

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

;;; --------------------------------------------- Type-Safe Responses -----------------------------------------------

(deftest type-safe-get-table-test
  (testing "get_table response has properly encoded keys from Agent API"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/call"
                                                 {:name      "get_table"
                                                  :arguments {:id (mt/id :orders)}})
                                {"mcp-session-id" session-id})
          result       (get-in response [:body :result])
          ;; Use first+:text since :content is a lazy seq (not indexable by get-in)
          content-text (:text (first (:content result)))]
      (is (= 200 (:status response)))
      (is (nil? (:isError result)))
      (is (string? content-text))
      ;; Parse the content text as JSON and verify snake_case keys from Malli encoding
      (let [table-data (json/decode+kw content-text)]
        (is (some? (:name table-data)))
        (is (some? (:display_name table-data)))
        (is (some? (:database_id table-data)))
        (is (= "table" (:type table-data)))
        (is (seq (:fields table-data)))))))

(deftest initialized-notification-compatibility-test
  (testing "requests succeed without notifications/initialized"
    (let [response      (mcp-request (jsonrpc-request "initialize"))
          session-id    (get-in response [:headers "Mcp-Session-Id"])
          list-response (mcp-request (jsonrpc-request "tools/list")
                                     {"mcp-session-id" session-id})]
      (is (= 200 (:status list-response)))
      (is (some? (get-in list-response [:body :result :tools])))))

  (testing "notifications/initialized remains accepted for compatibility"
    (let [response   (mcp-request (jsonrpc-request "initialize"))
          session-id (get-in response [:headers "Mcp-Session-Id"])]
      (is (= 202 (:status (mcp-request (jsonrpc-notification "notifications/initialized")
                                       {"mcp-session-id" session-id})))))))

(deftest full-handshake-test
  (testing "complete MCP handshake flow"
    (let [[session-id init-response] (initialize!)
          _ (is (= 200 (:status init-response)))
          _ (is (some? session-id))
          ;; tools/list should work after full handshake
          list-response (mcp-request (jsonrpc-request "tools/list")
                                     {"mcp-session-id" session-id})]
      (is (= 200 (:status list-response)))
      (is (pos? (count (get-in list-response [:body :result :tools])))))))

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
                                                 {:name "get_table" :arguments {}})
                                {"mcp-session-id" session-id})
          result (get-in response [:body :result])]
      (is (= 200 (:status response)))
      (is (true? (:isError result)))
      (is (str/includes? (:text (first (:content result))) "Missing required path parameter")))))

(deftest tools-list-no-refs-test
  (testing "tool inputSchemas have no $ref, no $defs, and root type is always object"
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
                  (str (:name tool) " root type should be object")))))))))

(deftest tools-call-get-table-query-params-test
  (testing "get_table passes query params correctly (with-fields default true)"
    (let [result (mt/with-current-user (mt/user->id :crowberto)
                   (mcp.tools/call-tool nil "get_table" {:id (mt/id :orders)}))]
      (is (not (:isError result)))
      (let [table-data (json/decode+kw (:text (first (:content result))))]
        (is (seq (:fields table-data))
            "with-fields defaults to true, so fields should be present"))))
  (testing "get_table with with-fields=false omits fields"
    (let [result (mt/with-current-user (mt/user->id :crowberto)
                   (mcp.tools/call-tool nil "get_table" {:id (mt/id :orders) :with-fields false}))]
      (is (not (:isError result)))
      (let [table-data (json/decode+kw (:text (first (:content result))))]
        (is (empty? (:fields table-data))
            "with-fields=false should return no fields")))))

(deftest tools-call-execute-query-test
  (testing "execute_query returns a streaming response captured as MCP text content"
    (let [streamed? (atom false)
          original-fn       (mt/original-fn #'mcp.tools/capture-streaming-response)]
      (mt/with-dynamic-fn-redefs [mcp.tools/capture-streaming-response
                                  (fn [response]
                                    (reset! streamed? true)
                                    (original-fn response))]
        (let [[session-id _] (initialize!)
              construct-data (call-tool session-id "construct_query"
                                        {:source     {:type "table" :id (mt/id :orders)}
                                         :operations [["limit" 5]]})
              execute-data   (call-tool session-id "execute_query"
                                        {:query (:query construct-data)})]
          (is (true? @streamed?) "execute_query should use the streaming response path")
          (is (=? {:status    "completed"
                   :row_count 5
                   :data      {:cols sequential?
                               :rows (fn [rows] (= 5 (count rows)))}}
                  execute-data)))))))

;;; --------------------------------------------- OAuth Bearer Auth -------------------------------------------------

(deftest unauthenticated-returns-401-test
  (testing "POST without any auth returns 401 with WWW-Authenticate discovery header"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (mcp-request-unauthenticated (jsonrpc-request "initialize"))]
        (is (=? {:status  401
                 :headers {"WWW-Authenticate" #(str/includes? % "oauth-protected-resource")}}
                response))))))

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

;;; --------------------------------------------- Scope Filtering ---------------------------------------------------

(deftest tools-list-scope-filtering-test
  (testing "tools/list with unrestricted scopes returns all tools"
    (let [tools (mcp.tools/list-tools #{::scope/unrestricted})]
      (is (= 10 (count tools)))))

  (testing "tools/list with specific scope only returns matching tools"
    (let [tools     (mcp.tools/list-tools #{"agent:search"})
          tool-names (set (map :name tools))]
      ;; Should include search (matches scope)
      (is (contains? tool-names "search"))
      ;; Should NOT include tools with other scopes
      (is (not (contains? tool-names "get_table")))
      (is (not (contains? tool-names "construct_query")))))

  (testing "tools/list with wildcard scope matches all agent tools"
    (let [tools (mcp.tools/list-tools #{"agent:*"})]
      (is (= 10 (count tools)))))

  (testing "tools/list with nil scopes returns all tools"
    (let [tools (mcp.tools/list-tools nil)]
      (is (= 10 (count tools)))))

  (testing "tools/list with empty scopes does not return all tools"
    (let [tools (mcp.tools/list-tools #{})]
      (is (zero? (count tools))
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
  (testing "tool call is rejected when token scopes don't include the required scope"
    (let [result (mt/with-current-user (mt/user->id :crowberto)
                   (mcp.tools/call-tool #{"agent:search"} "get_table" {:id (mt/id :orders)}))]
      (is (=? {:isError true} result))
      (is (str/includes? (-> result :content first :text) "Insufficient scope")
          "Scope enforcement error from defendpoint middleware")))
  (testing "tool call with matching scope is not rejected by scope enforcement"
    (let [result (mt/with-current-user (mt/user->id :crowberto)
                   (mcp.tools/call-tool #{"agent:table:read"} "get_table" {:id (mt/id :orders)}))]
      (is (not (:isError result)))))
  (testing "tool call with empty scopes is rejected for scoped tools"
    (let [result (mt/with-current-user (mt/user->id :crowberto)
                   (mcp.tools/call-tool #{} "get_table" {:id (mt/id :orders)}))]
      (is (=? {:isError true} result))
      (is (str/includes? (-> result :content first :text) "Insufficient scope")
          "Scope enforcement error from defendpoint middleware"))))

(deftest agent-api-preserves-token-scopes-test
  (testing "scoped token restrictions are enforced by the Agent API layer (defense-in-depth)"
    (testing "restricted scopes that don't match the endpoint are rejected by Agent API"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     ;; Bypass the MCP scope check by calling invoke-agent-api directly
                     ;; with scopes that don't match the endpoint's required scope (agent:table:read)
                     (#'mcp.tools/invoke-agent-api :get (str "/v1/table/" (mt/id :orders)) #{"agent:search"} nil))]
        (is (=? {:isError true} result)
            "Agent API should reject when token scopes don't include the required scope")))
    (testing "matching scopes are accepted by Agent API"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (#'mcp.tools/invoke-agent-api :get (str "/v1/table/" (mt/id :orders)) #{"agent:table:read"} nil))]
        (is (not (:isError result))
            "Agent API should accept when token scopes include the required scope")))
    (testing "unrestricted scopes are accepted by Agent API"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (#'mcp.tools/invoke-agent-api :get (str "/v1/table/" (mt/id :orders)) #{::scope/unrestricted} nil))]
        (is (not (:isError result))
            "Agent API should accept unrestricted scopes")))))

(deftest mcp-does-not-depend-on-external-agent-api-setting-test
  (testing "MCP tool calls still work when the external Agent API is disabled"
    (mt/with-temporary-setting-values [agent-api.settings/agent-api-enabled? false]
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (mcp.tools/call-tool #{::scope/unrestricted} "get_table" {:id (mt/id :orders)}))]
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
