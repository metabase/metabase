(ns metabase-enterprise.mcp.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.mcp.api :as mcp.api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;;; --------------------------------------------------- Helpers ----------------------------------------------------

(defn- mcp-request
  "Make a POST request to /api/mcp with the given JSON-RPC body and optional extra headers."
  ([body]
   (mcp-request body {}))
  ([body extra-headers]
   (mt/with-additional-premium-features #{:agent-api}
     (client/client-full-response :post "mcp"
                                  {:request-options {:headers extra-headers}}
                                  body))))

(defn- mcp-delete
  "Make a DELETE request to /api/mcp with optional headers."
  [extra-headers]
  (mt/with-additional-premium-features #{:agent-api}
    (client/client-full-response :delete "mcp"
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

(defmacro ^:private with-resolved-user
  [user-id & body]
  `(mt/with-dynamic-fn-redefs [mcp.api/resolve-user-id (constantly ~user-id)]
     ~@body))

;;; ---------------------------------------------------- Tests -----------------------------------------------------

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
  (testing "requests without a valid session ID are rejected"
    (let [response (mcp-request (jsonrpc-request "tools/list"))]
      (is (= 400 (:status response)))
      (is (= -32600 (get-in response [:body :error :code])))))

  (testing "requests with an invalid session ID are rejected"
    (let [response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" "bogus-session-id"})]
      (is (= 400 (:status response)))
      (is (= -32600 (get-in response [:body :error :code]))))))

(deftest session-user-binding-test
  (testing "sessions cannot be reused by a different resolved user"
    (let [user-a-id  (mt/user->id :crowberto)
          user-b-id  (mt/user->id :rasta)
          session-id (with-resolved-user user-a-id
                       (let [[session-id _] (initialize!)]
                         session-id))
          response   (with-resolved-user user-b-id
                       (mcp-request (jsonrpc-request "tools/list")
                                    {"mcp-session-id" session-id}))]
      (is (= 400 (:status response)))
      (is (= -32600 (get-in response [:body :error :code]))))))

(deftest session-delete-test
  (testing "DELETE removes the session"
    (let [[session-id _] (initialize!)
          delete-response (mcp-delete {"mcp-session-id" session-id})
          ;; Now try to use the deleted session
          post-response (mcp-request (jsonrpc-request "tools/list")
                                     {"mcp-session-id" session-id})]
      (is (= 200 (:status delete-response)))
      (is (= 400 (:status post-response))))))

(deftest session-ttl-test
  (testing "expired sessions are rejected"
    (let [[session-id _] (initialize!)]
      ;; Manually expire the session by backdating the timer (nanos) to 2 hours ago
      (swap! @#'mcp.api/sessions update session-id assoc
             :timer (- (System/nanoTime) (long (* 2 60 60 1000 1e6))))
      (let [response (mcp-request (jsonrpc-request "tools/list")
                                  {"mcp-session-id" session-id})]
        (is (= 400 (:status response)))
        (is (= -32600 (get-in response [:body :error :code])))))))

(deftest tools-list-test
  (testing "tools/list returns the 7 agent tools"
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/list")
                                {"mcp-session-id" session-id})
          tools (get-in response [:body :result :tools])]
      (is (= 200 (:status response)))
      (is (= 7 (count tools)))
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
    (let [[session-id _] (initialize!)
          response (mcp-request (jsonrpc-request "tools/call"
                                                 {:name "search"
                                                  :arguments {:term_queries ["orders"]}})
                                {"mcp-session-id" session-id})
          result (get-in response [:body :result])]
      (is (= 200 (:status response)))
      (is (nil? (:isError result)))
      (is (= "text" (:type (first (:content result)))))
      (let [search-data (json/decode+kw (:text (first (:content result))))]
        (is (contains? search-data :data))
        (is (contains? search-data :total_count))))))

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
                     (client/client-full-response :get "mcp"))]
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
      (is (= 7 (count (get-in list-response [:body :result :tools])))))))

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
