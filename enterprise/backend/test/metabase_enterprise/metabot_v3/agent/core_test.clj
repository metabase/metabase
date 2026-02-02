(ns metabase-enterprise.metabot-v3.agent.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.core :as agent]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase-enterprise.metabot-v3.tools.search :as metabot-search]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn parts->aisdk-chunks
  "Convert simple test parts to AI SDK v5 chunks (what self/claude returns).
  Accepts parts like {:type :text :text \"Hello\"} or {:type :tool-input :id \"t1\" :function \"search\" :arguments {...}}
  and returns AI SDK v5 chunks that tool-executor-xf and aisdk-xf can process."
  [parts]
  (let [msg-id (str "msg-" (random-uuid))]
    (concat
     ;; start message
     [{:type :start :messageId msg-id}]
     ;; content chunks for each part
     (mapcat
      (fn [{:keys [type text id function arguments]}]
        (let [chunk-id (or id (str "chunk-" (random-uuid)))]
          (case type
            :text
            [{:type :text-start :id chunk-id}
             {:type :text-delta :id chunk-id :delta text}
             {:type :text-end :id chunk-id}]

            :tool-input
            [{:type :tool-input-start :toolCallId chunk-id :toolName function}
             {:type :tool-input-delta :toolCallId chunk-id :inputTextDelta (json/encode arguments)}
             {:type :tool-input-available :toolCallId chunk-id :toolName function}]

            ;; Default: skip unknown types
            [])))
      parts)
     ;; usage
     [{:type :usage :usage {:promptTokens 10 :completionTokens 50} :id msg-id}])))

(defn mock-llm-response
  "Create a mock LLM response (reducible) with given parts in AI SDK v5 format."
  [parts]
  (let [aisdk-chunks (parts->aisdk-chunks parts)]
    ;; Return a reducible that yields the chunks
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (reduce rf init aisdk-chunks)))))

;; Mock tool for testing
(mu/defn test-search-tool
  "Mock search tool that returns test data."
  [{:keys [_query]} :- [:map {:closed true}
                        [:query :string]]]
  {:structured-output {:data [{:id 1 :name "Test Result"}]}})

(def test-tools
  {"search" #'test-search-tool})

(deftest has-tool-calls-test
  (testing "detects tool calls in parts"
    (is (#'agent/has-tool-calls? [{:type :tool-input :id "t1"}]))
    (is (not (#'agent/has-tool-calls? [{:type :text :text "hello"}])))
    (is (#'agent/has-tool-calls? [{:type :text :text "hi"}
                                  {:type :tool-input :id "t1"}]))))

(deftest should-continue-test
  (let [max-iter 3]
    (testing "continues when iteration < max and has tool calls"
      (is (#'agent/should-continue? 0 max-iter [{:type :tool-input}]))
      (is (#'agent/should-continue? 1 max-iter [{:type :tool-input}])))

    (testing "continues when text AND tool calls present (LLM thinking aloud)"
      (is (#'agent/should-continue? 0 max-iter [{:type :tool-input}
                                                {:type :text}]))
      (is (#'agent/should-continue? 0 max-iter [{:type :text}
                                                {:type :tool-input}])))

    (testing "stops at max iterations"
      (is (not (#'agent/should-continue? 2 max-iter [{:type :tool-input}])))
      (is (not (#'agent/should-continue? 3 max-iter [{:type :tool-input}]))))

    (testing "stops when no tool calls (text-only is final answer)"
      (is (not (#'agent/should-continue? 0 max-iter [{:type :text}])))
      (is (not (#'agent/should-continue? 0 max-iter [{:type :usage}])))
      (is (not (#'agent/should-continue? 0 max-iter []))))))

(deftest run-agent-loop-with-mock-test
  (testing "runs agent loop with mocked LLM returning text"
    (with-redefs [self/claude (fn [_]
                                (mock-llm-response
                                 [{:type :text :text "Hello"}]))]
      (let [result (into [] (agent/run-agent-loop
                             {:messages   [{:role :user :content "Hi"}]
                              :state      {}
                              :profile-id :embedding_next
                              :context    {}}))]
        ;; Should get parts + state data
        ;; Note: :finish is not emitted as a part; it's handled by aisdk-line-xf completion
        (is (pos? (count result)))
        ;; Should have state data (final part)
        (is (some #(= :data (:type %)) result)))))

  (testing "runs agent loop with tool execution"
    (let [call-count (atom 0)]
      (with-redefs [self/claude (fn [_]
                                  ;; First call returns tool-input, second returns text
                                  (let [n (swap! call-count inc)]
                                    (if (= 1 n)
                                      (mock-llm-response
                                       [{:type      :tool-input
                                         :id        "t1"
                                         :function  "search"
                                         :arguments {:query "test"}}])
                                      (mock-llm-response
                                       [{:type :text :text "Found results"}]))))]
        (let [result (into [] (agent/run-agent-loop
                               {:messages   [{:role :user :content "Search for test"}]
                                :state      {}
                                :profile-id :embedding_next
                                :context    {}}))]
          ;; Should complete successfully
          (is (pos? (count result)))
          ;; Should have state data (final part)
          (is (some #(= :data (:type %)) result))
          ;; Should have tool-related parts
          (is (some #(= :tool-input (:type %)) result))))))

  (testing "handles errors gracefully"
    (with-redefs [self/claude (fn [_]
                                (throw (ex-info "Mock error" {})))]
      (let [result (mt/with-log-level [metabase-enterprise.metabot-v3.agent.core :fatal]
                     (into [] (agent/run-agent-loop
                               {:messages   [{:role :user :content "Hi"}]
                                :state      {}
                                :profile-id :embedding_next
                                :context    {}})))]
        ;; Should get error message
        (is (some #(= :error (:type %)) result))))))

;; Note: build-messages-for-llm is now internal to call-llm
;; Message building is tested via messages_test.clj

(deftest seed-state-test
  (testing "seeds queries from user_is_viewing context"
    (let [context {:user_is_viewing [{:type "native"
                                      :id "query-123"
                                      :query {:database 1 :type :query :query {:source-table 1}}}]}
          seeded (#'agent/seed-state {} context)]
      (is (contains? (get seeded :queries) "query-123"))))

  (testing "does not seed native SQL string queries"
    (let [context {:user_is_viewing [{:type "native"
                                      :id "query-456"
                                      :query "SELECT * FROM users"}]}
          seeded (#'agent/seed-state {} context)]
      (is (empty? (get seeded :queries)))))

  (testing "ignores viewing items without ids or queries"
    (let [context {:user_is_viewing [{:type "native" :query {:database 1}}
                                     {:type "adhoc" :id "no-query"}]}
          seeded (#'agent/seed-state {} context)]
      (is (empty? (get seeded :queries))))))

;; Note: stream-parts! and finalize-stream! are now internal to run-agent-loop.
;; Link resolution is tested via streaming/post-process-xf in streaming_test.clj.
;; Here we test the full agent loop behavior.

(deftest integration-run-agent-loop-test
  (testing "runs full agent loop without external calls"
    (with-redefs [self/claude (fn [_]
                                (mock-llm-response
                                 [{:type :text :text "Test response"}]))]
      (let [result (into [] (agent/run-agent-loop
                             {:messages   [{:role :user :content "Hello"}]
                              :state      {}
                              :profile-id :embedding_next
                              :context    {}}))]
        ;; Verify basic structure
        (is (pos? (count result)))
        ;; Should have text part
        (is (some #(= :text (:type %)) result))
        ;; Should have state data part (finish is handled by aisdk-line-xf, not emitted as part)
        (is (some #(and (= :data (:type %))
                        (map? (:data %)))
                  result))))))

;;; Query and Chart extraction tests

(deftest extract-queries-test
  (testing "extracts queries from tool output parts"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :tool-output
                  :id "t1"
                  :function "query_model"
                  :result {:structured-output {:query-id "q-123"
                                               :query query
                                               :result-columns []}}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-queries memory parts)]
      (is (= query (get-in (memory/get-state updated) [:queries "q-123"])))))

  (testing "ignores parts without structured-output"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:output "no results"}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-queries memory parts)]
      (is (empty? (:queries (memory/get-state updated))))))

  (testing "ignores non-tool-output parts"
    (let [parts [{:type :text :text "hello"}
                 {:type :tool-input :id "t1" :function "search"}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-queries memory parts)]
      (is (empty? (:queries (memory/get-state updated)))))))

(deftest extract-charts-test
  (testing "extracts charts from tool output parts"
    (let [chart-data {:chart-id "c-456"
                      :query-id "q-123"
                      :chart-type :bar}
          parts [{:type :tool-output
                  :id "t1"
                  :function "create_chart"
                  :result {:structured-output chart-data}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-charts memory parts)]
      (is (= chart-data (get-in (memory/get-state updated) [:charts "c-456"])))))

  (testing "stores charts even when query details are included"
    (let [query-data {:chart-id "c-789"
                      :query-id "q-789"
                      :query {:database 1}
                      :result-columns []}
          parts [{:type :tool-output
                  :id "t1"
                  :function "query_model"
                  :result {:structured-output query-data}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-charts memory parts)]
      (is (= query-data (get-in (memory/get-state updated) [:charts "c-789"])))))

  (testing "ignores parts without chart-id"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:structured-output {:data []}}}]
          memory {:state {:queries {} :charts {}}}
          updated (#'agent/extract-charts memory parts)]
      (is (empty? (:charts (memory/get-state updated)))))))

;;; ===================== Integration Tests =====================
;;;
;;; These tests exercise the full agent loop across multiple iterations
;;; with tool calls, state management, and realistic scenarios.

(defn scripted-claude
  "Create a mock claude fn that returns responses in sequence.
  Each response is a vector of parts (e.g., [{:type :text :text \"Hi\"}]).

  Usage:
    (with-redefs [self/claude (scripted-claude
                                [[{:type :tool-input :function \"search\" ...}]
                                 [{:type :text :text \"Found it\"}]])]
      ...)"
  [responses]
  (let [idx (atom 0)]
    (fn [_opts]
      (let [i        @idx
            response (get responses i)]
        (swap! idx inc)
        (if response
          (mock-llm-response response)
          ;; Fallback: return empty text to terminate loop
          (mock-llm-response [{:type :text :text ""}]))))))

(deftest integration-search-query-chart-flow-test
  (testing "Scenario 1: Search → Query → Chart (multi-turn happy path)"
    ;; User asks: "Show me the first 10 orders"
    ;; - Iteration 1: LLM calls search tool to find orders table
    ;; - Iteration 2: LLM calls construct_notebook_query to create a raw query
    ;; - Iteration 3: LLM returns text with chart link
    ;;
    ;; We use real tools with only the search backend and LLM mocked.
    ;; The construct_notebook_query tool runs real query construction against test DB.
    ;; We use a simple "raw" query type that doesn't require field IDs.
    (mt/with-current-user (mt/user->id :crowberto)
      (let [orders-table-id (mt/id :orders)
            ;; Track LLM calls
            llm-call-count  (atom 0)
            ;; Scripted LLM responses - uses real table ID from test DB
            llm-responses
            [ ;; Iteration 1: Search for orders table
             [{:type      :tool-input
               :id        "call-search-1"
               :function  "search"
               :arguments {:semantic_queries ["orders table"]
                           :keyword_queries  ["orders"]
                           :entity_types     ["table"]}}]
             ;; Iteration 2: Construct a simple raw query (no fields/aggregations = select all)
             [{:type      :tool-input
               :id        "call-construct-1"
               :function  "construct_notebook_query"
               :arguments {:reasoning     "User wants to see orders"
                           :query         {:query_type "raw"
                                           :source     {:table_id orders-table-id}
                                           :filters    []
                                           :fields     []
                                           :order_by   []
                                           :limit      10}
                           :visualization {:chart_type "table"}}}]
             ;; Iteration 3: Final text response
             [{:type :text
               :text "Here are the first 10 orders from the orders table."}]]]
        ;; Mock only self/claude (LLM) and metabot-search/search (search backend)
        ;; Everything else runs real code
        (with-redefs [self/claude           (fn [_opts]
                                              (let [n (swap! llm-call-count inc)]
                                                (mock-llm-response (get llm-responses (dec n) []))))
                      metabot-search/search (fn [_args]
                                              [{:id           orders-table-id
                                                :type         "table"
                                                :name         "orders"
                                                :display_name "Orders"
                                                :description  "This is a confirmed order for a product from a user."
                                                :database_id  (mt/id)}])]
          (testing "Should successfully go through 3 iterations"
            (is (=? [{:type :start}
                     {:type :tool-input :function "search"}
                     {:type :usage}
                     {:type     :tool-output
                      :function "search"
                      :result   {:structured-output {:total_count 1}}}
                     {:type :start}
                     {:type :tool-input :function "construct_notebook_query"}
                     {:type :usage}
                     ;; references real db id
                     {:type     :tool-output
                      :function "construct_notebook_query"
                      :result   {:structured-output {:query {:database (mt/id)}}}}
                     {:type :data :data-type "navigate_to"}
                     {:type :start}
                     ;; has final text part
                     {:type :text}
                     {:type :usage}
                     {:type      :data
                      :data-type "state"
                      :data      {:queries map?
                                  :charts  map?}}]
                    (mt/with-log-level [metabase-enterprise.metabot-v3.agent.core :warn]
                      (into [] (agent/run-agent-loop
                                {:messages   [{:role    :user
                                               :content "Show me the first 10 orders"}]
                                 :state      {}
                                 :profile-id :internal
                                 :context    {}}))))))
          (testing "should complete 3 LLM iterations"
            (is (= 3 @llm-call-count)
                "Should have exactly 3 LLM calls (search, construct, final text)")))))))
