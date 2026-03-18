(ns metabase.mcp.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.api :as mcp.api]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;;; --------------------------------------------------- Helpers ----------------------------------------------------

(defn- mcp-request
  "Make a POST request to /api/mcp with the given JSON-RPC body and optional extra headers.
   Authenticates as :crowberto (superuser) by default."
  ([body]
   (mcp-request body {}))
  ([body extra-headers]
   (mt/with-additional-premium-features #{:agent-api}
     (client/client-full-response (test.users/username->token :crowberto)
                                  :post "mcp"
                                  {:request-options {:headers extra-headers}}
                                  body))))

(defn- mcp-delete
  "Make a DELETE request to /api/mcp with optional headers.
   Authenticates as :crowberto (superuser) by default."
  [extra-headers]
  (mt/with-additional-premium-features #{:agent-api}
    (client/client-full-response (test.users/username->token :crowberto)
                                 :delete "mcp"
                                 {:request-options {:headers extra-headers}})))

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

(defn- mcp-request-as
  "Make a POST request to /api/mcp authenticated as the given test user."
  [username body extra-headers]
  (mt/with-additional-premium-features #{:agent-api}
    (client/client-full-response (test.users/username->token username)
                                 :post "mcp"
                                 {:request-options {:headers extra-headers}}
                                 body)))

;;; ---------------------------------------------------- Tests -----------------------------------------------------

(deftest authentication-required-test
  (testing "unauthenticated requests return 401"
    (let [response (mt/with-additional-premium-features #{:agent-api}
                     (client/client-full-response :post 401 "mcp"
                                                  (jsonrpc-request "initialize")))]
      (is (= 401 (:status response)))
      (is (= -32603 (get-in response [:body :error :code]))))))

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
      (is (= -32600 (get-in response [:body :error :code])))))

  (testing "requests with an invalid session ID return 404"
    (let [response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" "bogus-session-id"})]
      (is (= 404 (:status response)))
      (is (= -32600 (get-in response [:body :error :code]))))))

(deftest session-user-binding-test
  (testing "sessions cannot be reused by a different authenticated user"
    (let [;; Initialize a session as crowberto
          [session-id _] (initialize!)
          ;; Try to use that session as rasta — returns 404 because the session
          ;; doesn't match the requesting user
          response (mcp-request-as :rasta
                                   (jsonrpc-request "tools/list")
                                   {"mcp-session-id" session-id})]
      (is (= 404 (:status response)))
      (is (= -32600 (get-in response [:body :error :code]))))))

(deftest session-delete-test
  (testing "DELETE removes the session"
    (let [[session-id _] (initialize!)
          delete-response (mcp-delete {"mcp-session-id" session-id})
          ;; Now try to use the deleted session — returns 404
          post-response (mcp-request (jsonrpc-request "tools/list")
                                     {"mcp-session-id" session-id})]
      (is (= 200 (:status delete-response)))
      (is (= 404 (:status post-response))))))

(deftest session-ttl-test
  (testing "expired sessions return 404"
    (let [[session-id _] (initialize!)]
      ;; Manually expire the session by backdating the timer (nanos) to 2 hours ago
      (swap! @#'mcp.api/sessions update session-id assoc
             :timer (- (System/nanoTime) (long (* 2 60 60 1000 1e6))))
      (let [response (mcp-request (jsonrpc-request "tools/list")
                                  {"mcp-session-id" session-id})]
        (is (= 404 (:status response)))
        (is (= -32600 (get-in response [:body :error :code])))))))

(deftest tools-list-test
  (testing "tools/list returns the 7 agent tools"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" session-id})
          tools (get-in response [:body :result :tools])]
      (is (= 200 (:status response)))
      (is (pos? (count tools)))
      (is (= #{"search" "get_table" "get_metric" "get_table_field_values"
               "get_metric_field_values" "construct_query" "execute_query"}
             (set (map :name tools))))
      (testing "each tool has a description and inputSchema"
        (doseq [tool tools]
          (is (string? (:description tool)))
          (is (map? (:inputSchema tool))))))))

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
  (testing "GET without session returns 400"
    (let [response (mt/with-additional-premium-features #{:agent-api}
                     (client/client-full-response (test.users/username->token :crowberto)
                                                  :get "mcp"))]
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

(deftest initialized-enforcement-test
  (testing "requests before notifications/initialized are rejected"
    (let [;; Only do initialize, not the full handshake
          response   (mcp-request (jsonrpc-request "initialize"))
          session-id (get-in response [:headers "Mcp-Session-Id"])
          ;; Try tools/list without sending notifications/initialized
          list-response (mcp-request (jsonrpc-request "tools/list")
                                     {"mcp-session-id" session-id})]
      (is (= 200 (:status list-response)))
      (is (= -32600 (get-in list-response [:body :error :code])))
      (is (str/includes? (get-in list-response [:body :error :message]) "not initialized"))))

  (testing "requests after notifications/initialized succeed"
    (let [response   (mcp-request (jsonrpc-request "initialize"))
          session-id (get-in response [:headers "Mcp-Session-Id"])]
      ;; Send notifications/initialized
      (mcp-request (jsonrpc-notification "notifications/initialized")
                   {"mcp-session-id" session-id})
      ;; Now tools/list should work
      (let [list-response (mcp-request (jsonrpc-request "tools/list")
                                       {"mcp-session-id" session-id})]
        (is (= 200 (:status list-response)))
        (is (some? (get-in list-response [:body :result :tools])))))))

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

(deftest tools-list-defs-inlined-test
  (testing "tools with $ref in inputSchema have $defs inlined"
    (let [tools (mcp.tools/list-tools)]
      (doseq [tool tools]
        (let [schema (:inputSchema tool)
              refs   (into #{} (map second) (re-seq #"#/\$defs/([A-Za-z0-9._-]+)" (pr-str schema)))]
          (when (seq refs)
            (testing (str (:name tool) " has $defs for all $ref targets")
              (is (map? (:$defs schema))
                  (str (:name tool) " is missing $defs"))
              (doseq [def-name refs]
                (is (contains? (:$defs schema) def-name)
                    (str (:name tool) " missing def: " def-name))))))))))

(deftest tools-call-execute-query-test
  (testing "execute_query returns a streaming response captured as MCP text content"
    (let [streamed? (atom false)
          original-fn       (mt/original-fn #'mcp.tools/capture-streaming-response)]
      (mt/with-dynamic-fn-redefs [mcp.tools/capture-streaming-response
                                  (fn [response]
                                    (reset! streamed? true)
                                    (original-fn response))]
        (let [[session-id _] (initialize!)
              construct-data (call-tool session-id "construct_query" {:table_id (mt/id :orders) :limit 5})
              execute-data   (call-tool session-id "execute_query"   {:query (:query construct-data)})]
          (is (true? @streamed?) "execute_query should use the streaming response path")
          (is (=? {:status    "completed"
                   :row_count 5
                   :data      {:cols sequential?
                               :rows (fn [rows] (= 5 (count rows)))}}
                  execute-data)))))))
