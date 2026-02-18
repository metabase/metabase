(ns metabase-enterprise.metabot-v3.agent.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.core :as agent]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.api :as api]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase-enterprise.metabot-v3.self.openrouter :as openrouter]
   [metabase-enterprise.metabot-v3.test-util :as mut]
   [metabase-enterprise.metabot-v3.tools.search :as metabot-search]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

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

    (testing "stops at max iterations (1-based: iteration >= max means done)"
      (is (not (#'agent/should-continue? 3 max-iter [{:type :tool-input}])))
      (is (not (#'agent/should-continue? 4 max-iter [{:type :tool-input}]))))

    (testing "stops when no tool calls (text-only is final answer)"
      (is (not (#'agent/should-continue? 0 max-iter [{:type :text}])))
      (is (not (#'agent/should-continue? 0 max-iter [{:type :usage}])))
      (is (not (#'agent/should-continue? 0 max-iter []))))))

(deftest run-agent-loop-with-mock-test
  (testing "runs agent loop with mocked LLM returning text"
    (with-redefs [openrouter/openrouter (fn [_]
                                          (mut/mock-llm-response
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
      (with-redefs [openrouter/openrouter (fn [_]
                                            ;; First call returns tool-input, second returns text
                                            (let [n (swap! call-count inc)]
                                              (if (= 1 n)
                                                (mut/mock-llm-response
                                                 [{:type      :tool-input
                                                   :id        "t1"
                                                   :function  "search"
                                                   :arguments {:query "test"}}])
                                                (mut/mock-llm-response
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
    (with-redefs [openrouter/openrouter (fn [_]
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
    (with-redefs [openrouter/openrouter (fn [_]
                                          (mut/mock-llm-response
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
    (with-redefs [openrouter/openrouter (scripted-claude
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
          (mut/mock-llm-response response)
          ;; Fallback: return empty text to terminate loop
          (mut/mock-llm-response [{:type :text :text ""}]))))))

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
             [{:type :start :id "msg-1"}
              {:type      :tool-input
               :id        "call-search-1"
               :function  "search"
               :arguments {:semantic_queries ["orders table"]
                           :keyword_queries  ["orders"]
                           :entity_types     ["table"]}}
              {:type :usage :usage {:promptTokens 100 :completionTokens 20} :model "test" :id "msg-1"}]
             ;; Iteration 2: Construct a simple raw query (no fields/aggregations = select all)
             [{:type :start :id "msg-2"}
              {:type      :tool-input
               :id        "call-construct-1"
               :function  "construct_notebook_query"
               :arguments {:reasoning     "User wants to see orders"
                           :query         {:query_type "raw"
                                           :source     {:table_id orders-table-id}
                                           :filters    []
                                           :fields     []
                                           :order_by   []
                                           :limit      10}
                           :visualization {:chart_type "table"}}}
              {:type :usage :usage {:promptTokens 200 :completionTokens 30} :model "test" :id "msg-2"}]
             ;; Iteration 3: Final text response
             [{:type :start :id "msg-3"}
              {:type :text
               :text "Here are the first 10 orders from the orders table."}
              {:type :usage :usage {:promptTokens 300 :completionTokens 10} :model "test" :id "msg-3"}]]]
        ;; Mock only openrouter/openrouter (LLM) and metabot-search/search (search backend)
        ;; Everything else runs real code
        (with-redefs [openrouter/openrouter           (fn [_opts]
                                                        (let [n (swap! llm-call-count inc)]
                                                          (mut/mock-llm-response (get llm-responses (dec n) []))))
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
                     ;; Cumulative usage after iteration 1: 100 prompt, 20 completion
                     {:type :usage :usage {:promptTokens 100 :completionTokens 20}}
                     {:type     :tool-output
                      :function "search"
                      :result   {:structured-output {:total_count 1}}}
                     {:type :start}
                     {:type :tool-input :function "construct_notebook_query"}
                     ;; Cumulative usage after iteration 2: 100+200=300 prompt, 20+30=50 completion
                     {:type :usage :usage {:promptTokens 300 :completionTokens 50}}
                     ;; references real db id
                     {:type     :tool-output
                      :function "construct_notebook_query"
                      :result   {:structured-output {:query {:database (mt/id)}}}}
                     {:type :data :data-type "navigate_to"}
                     {:type :start}
                     ;; has final text part
                     {:type :text}
                     ;; Cumulative usage after iteration 3: 300+300=600 prompt, 50+10=60 completion
                     {:type :usage :usage {:promptTokens 600 :completionTokens 60}}
                     {:type      :data
                      :data-type "state"
                      :data      {:queries map?
                                  :charts  map?}}]
                    (mt/with-log-level [metabase-enterprise.metabot-v3.agent.core :warn]
                      (into [] (#'api/combine-text-parts-xf)
                            (agent/run-agent-loop
                             {:messages   [{:role    :user
                                            :content "Show me the first 10 orders"}]
                              :state      {}
                              :profile-id :internal
                              :context    {}}))))))
          (testing "should complete 3 LLM iterations"
            (is (= 3 @llm-call-count)
                "Should have exactly 3 LLM calls (search, construct, final text)")))))))

(deftest cumulative-usage-test
  (testing "usage parts are cumulative across agent loop iterations"
    (let [call-count (atom 0)]
      (with-redefs [openrouter/openrouter
                    (fn [_]
                      (let [n (swap! call-count inc)]
                        (case (int n)
                          ;; Iteration 1: tool call with usage
                          1 (mut/mock-llm-response
                             [{:type :start :id "msg-1"}
                              {:type      :tool-input
                               :id        "t1"
                               :function  "search"
                               :arguments {:query "test"}}
                              {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                               :model "gpt-4" :id "msg-1"}])
                          ;; Iteration 2: text response with usage
                          (mut/mock-llm-response
                           [{:type :start :id "msg-2"}
                            {:type :text :text "Done"}
                            {:type :usage :usage {:promptTokens 150 :completionTokens 30}
                             :model "gpt-4" :id "msg-2"}]))))]
        (let [result (mt/with-log-level [metabase-enterprise.metabot-v3.agent.core :warn]
                       (into [] (agent/run-agent-loop
                                 {:messages   [{:role :user :content "test"}]
                                  :state      {}
                                  :profile-id :embedding_next
                                  :context    {}})))
              usages (filterv #(= :usage (:type %)) result)]
          (testing "should have two usage parts (one per iteration)"
            (is (= 2 (count usages))))
          (testing "first usage is from iteration 1 only"
            (is (= {:promptTokens 100 :completionTokens 20}
                   (:usage (first usages)))))
          (testing "second usage is cumulative (iteration 1 + 2)"
            (is (= {:promptTokens 250 :completionTokens 50}
                   (:usage (second usages)))))))))

  (testing "cumulative usage works across multiple models"
    (let [call-count (atom 0)]
      (with-redefs [openrouter/openrouter
                    (fn [_]
                      (let [n (swap! call-count inc)]
                        (case (int n)
                          1 (mut/mock-llm-response
                             [{:type :start :id "msg-1"}
                              {:type      :tool-input
                               :id        "t1"
                               :function  "search"
                               :arguments {:query "test"}}
                              {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                               :model "model-a" :id "msg-1"}])
                          (mut/mock-llm-response
                           [{:type :start :id "msg-2"}
                            {:type :text :text "Done"}
                            {:type :usage :usage {:promptTokens 200 :completionTokens 40}
                             :model "model-b" :id "msg-2"}]))))]
        (let [result (mt/with-log-level [metabase-enterprise.metabot-v3.agent.core :warn]
                       (into [] (agent/run-agent-loop
                                 {:messages   [{:role :user :content "test"}]
                                  :state      {}
                                  :profile-id :embedding_next
                                  :context    {}})))
              usages (filterv #(= :usage (:type %)) result)]
          (testing "different models accumulate independently"
            (is (= "model-a" (:model (first usages))))
            (is (= {:promptTokens 100 :completionTokens 20}
                   (:usage (first usages))))
            (is (= "model-b" (:model (second usages))))
            (is (= {:promptTokens 200 :completionTokens 40}
                   (:usage (second usages))))))))))

(deftest run-agent-loop-retries-on-rate-limit-test
  (testing "agent loop retries when LLM returns 429 and then succeeds"
    (let [call-count (atom 0)]
      (with-redefs [self/retry-delay-ms   (constantly 0)
                    openrouter/openrouter (fn [_]
                                            (if (< (swap! call-count inc) 2)
                                              (throw (ex-info "Anthropic API has rate limited us"
                                                              {:status 429 :api-error true}))
                                              (mut/mock-llm-response
                                               [{:type :text :text "Hello after retry"}])))]
        (is (=? [{:type :text :text "Hello after retry"}
                 {:type :data :data-type "state"}]
                (mt/with-log-level [metabase-enterprise.metabot-v3.self :fatal]
                  (into [] (#'api/combine-text-parts-xf)
                        (agent/run-agent-loop
                         {:messages   [{:role :user :content "Hi"}]
                          :state      {}
                          :profile-id :embedding_next
                          :context    {}}))))
            "Should get the response from the successful retry")
        (is (= 2 @call-count)
            "Should have called LLM twice (1 failure + 1 success)")))))
