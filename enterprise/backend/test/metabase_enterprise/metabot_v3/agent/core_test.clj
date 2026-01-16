(ns metabase-enterprise.metabot-v3.agent.core-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.core :as agent]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- chan->seq
  "Convert channel to seq by reading all values until closed."
  [ch]
  (loop [acc []]
    (if-let [val (a/<!! ch)]
      (recur (conj acc val))
      acc)))

(defn- parts->claude-raw
  "Convert simple test parts to Claude raw SSE format.
  Accepts parts like {:type :text :text \"Hello\"} or {:type :tool-input :id \"t1\" :function \"search\" :arguments {...}}
  and returns Claude raw chunks that claude->aisdk-xf can process."
  [parts]
  (let [msg-id (str "msg-" (random-uuid))]
    (concat
     ;; message_start
     [{:type "message_start"
       :message {:id msg-id
                 :model "claude-sonnet-4-5-20250929"
                 :role "assistant"
                 :content []
                 :usage {:input_tokens 10 :output_tokens 0}}}]
     ;; content blocks for each part
     (mapcat
      (fn [idx {:keys [type text id function arguments]}]
        (case type
          :text
          [{:type "content_block_start"
            :index idx
            :content_block {:type "text" :text ""}}
           {:type "content_block_delta"
            :index idx
            :delta {:type "text_delta" :text text}}
           {:type "content_block_stop"
            :index idx}]

          :tool-input
          [{:type "content_block_start"
            :index idx
            :content_block {:type "tool_use" :id id :name function}}
           {:type "content_block_delta"
            :index idx
            :delta {:type "input_json_delta" :partial_json (json/encode arguments)}}
           {:type "content_block_stop"
            :index idx}]

          ;; Default: skip unknown types
          []))
      (range)
      parts)
     ;; message_delta with usage
     [{:type "message_delta"
       :delta {:stop_reason "end_turn"}
       :usage {:input_tokens 10 :output_tokens 50}}
      {:type "message_stop"}])))

(defn- mock-llm-response
  "Create a mock LLM response channel with given parts in Claude raw format."
  [parts]
  (let [ch (a/chan 100)
        claude-chunks (parts->claude-raw parts)]
    (a/go
      (doseq [chunk claude-chunks]
        (a/>! ch chunk))
      (a/close! ch))
    ch))

;; Mock tool for testing
(mu/defn test-search-tool
  "Mock search tool that returns test data."
  [{:keys [query]} :- [:map {:closed true}
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
  (let [profile {:max-iterations 3}]
    (testing "continues when iteration < max and has tool calls"
      (is (#'agent/should-continue? 0 profile [{:type :tool-input}]))
      (is (#'agent/should-continue? 1 profile [{:type :tool-input}])))

    (testing "continues when text AND tool calls present (LLM thinking aloud)"
      (is (#'agent/should-continue? 0 profile [{:type :tool-input}
                                               {:type :text}]))
      (is (#'agent/should-continue? 0 profile [{:type :text}
                                               {:type :tool-input}])))

    (testing "stops at max iterations"
      (is (not (#'agent/should-continue? 2 profile [{:type :tool-input}])))
      (is (not (#'agent/should-continue? 3 profile [{:type :tool-input}]))))

    (testing "stops when no tool calls (text-only is final answer)"
      (is (not (#'agent/should-continue? 0 profile [{:type :text}])))
      (is (not (#'agent/should-continue? 0 profile [{:type :usage}])))
      (is (not (#'agent/should-continue? 0 profile []))))))

(deftest run-agent-loop-with-mock-test
  (testing "runs agent loop with mocked LLM returning text"
    (with-redefs [self/claude-raw (fn [_]
                                    (mock-llm-response
                                     [{:type :text :text "Hello"}]))]
      (let [messages [{:role :user :content "Hi"}]
            state {}
            profile-id :embedding
            context {}
            response-chan (agent/run-agent-loop
                           {:messages messages
                            :state state
                            :profile-id profile-id
                            :context context})
            result (chan->seq response-chan)]
        ;; Should get parts + state + finish
        (is (pos? (count result)))
        ;; Should have finish message
        (is (some #(= :finish (:type %)) result))
        ;; Should have state data
        (is (some #(= :data (:type %)) result)))))

  (testing "runs agent loop with tool execution"
    (let [call-count (atom 0)]
      (with-redefs [self/claude-raw (fn [_]
                                      ;; First call returns tool-input, second returns text
                                      (let [n (swap! call-count inc)]
                                        (if (= 1 n)
                                          (mock-llm-response
                                           [{:type :tool-input
                                             :id "t1"
                                             :function "search"
                                             :arguments {:query "test"}}])
                                          (mock-llm-response
                                           [{:type :text :text "Found results"}]))))]
        (let [messages [{:role :user :content "Search for test"}]
              state {}
              profile-id :embedding
              context {}
              response-chan (agent/run-agent-loop
                             {:messages messages
                              :state state
                              :profile-id profile-id
                              :context context})
              result (chan->seq response-chan)]
          ;; Should complete successfully
          (is (pos? (count result)))
          (is (some #(= :finish (:type %)) result))
          ;; Should have tool-related parts
          (is (some #(= :tool-input (:type %)) result))))))

  (testing "handles errors gracefully"
    (with-redefs [self/claude-raw (fn [_]
                                    (throw (ex-info "Mock error" {})))]
      (let [messages [{:role :user :content "Hi"}]
            state {}
            profile-id :embedding
            context {}
            response-chan (agent/run-agent-loop
                           {:messages messages
                            :state state
                            :profile-id profile-id
                            :context context})
            result (chan->seq response-chan)]
        ;; Should get error message
        (is (some #(= :error (:type %)) result))))))

(deftest build-messages-for-llm-test
  (testing "builds messages from memory with context"
    (let [memory {:input-messages [{:role :user :content "Hello"}]
                  :steps-taken [{:parts [{:type :text :text "Hi"}]}]
                  :state {}}
          context {}
          profile {:prompt-template "internal.selmer"}
          tools {}
          messages (#'agent/build-messages-for-llm memory context profile tools)]
      ;; Should have system message first
      (is (sequential? messages))
      (is (pos? (count messages)))
      (is (= "system" (:role (first messages)))))))

(deftest seed-state-from-context-test
  (testing "seeds queries from user_is_viewing context"
    (let [context {:user_is_viewing [{:type "native"
                                      :id "query-123"
                                      :query {:database 1 :type :query :query {:source-table 1}}}]}
          state {}
          seeded (#'agent/seed-state-from-context state context)]
      (is (contains? (get seeded :queries) "query-123"))))

  (testing "does not seed native SQL string queries"
    (let [context {:user_is_viewing [{:type "native"
                                      :id "query-456"
                                      :query "SELECT * FROM users"}]}
          state {}
          seeded (#'agent/seed-state-from-context state context)]
      (is (empty? (get seeded :queries)))))

  (testing "ignores viewing items without ids or queries"
    (let [context {:user_is_viewing [{:type "native" :query {:database 1}}
                                     {:type "adhoc" :id "no-query"}]}
          state {}
          seeded (#'agent/seed-state-from-context state context)]
      (is (empty? (get seeded :queries))))))

(deftest stream-parts-to-output-test
  (testing "streams parts to output channel"
    (let [out-chan (a/chan 10)
          parts [{:type :text :text "hello"}
                 {:type :usage :tokens 100}]
          memory {:state {:queries {} :charts {}}}]
      ;; Wait for the go block to complete
      (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
      (a/close! out-chan)
      (is (= parts (chan->seq out-chan)))))

  (testing "resolves metabase:// links in text parts"
    (let [out-chan (a/chan 10)
          query-id "test-query-123"
          query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :text :text "Check out [Results](metabase://query/test-query-123)"}]
          memory {:state {:queries {query-id query} :charts {}}}]
      (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
      (a/close! out-chan)
      (let [result (chan->seq out-chan)
            text (-> result first :text)]
        ;; Link should be resolved to /question#...
        (is (re-find #"\[Results\]\(/question#" text))))))

(deftest finalize-stream-test
  (testing "finalizes stream with state and finish"
    (let [out-chan (a/chan 10)
          memory {:state {:queries {} :charts {}}}]
      ;; Wait for the go block to complete
      (a/<!! (#'agent/finalize-stream! out-chan memory "stop"))
      (let [result (chan->seq out-chan)]
        (is (= 2 (count result)))
        (is (= :data (:type (first result))))
        (is (= :finish (:type (second result))))
        (is (= "stop" (:finish-reason (second result))))))))

(deftest integration-run-agent-loop-test
  (testing "runs full agent loop without external calls"
    (with-redefs [self/claude-raw (fn [_]
                                    (mock-llm-response
                                     [{:type :text :text "Test response"}
                                      {:type :usage :tokens {:prompt 10 :completion 5}}]))]
      (let [messages [{:role :user :content "Hello"}]
            response-chan (agent/run-agent-loop
                           {:messages messages
                            :state {}
                            :profile-id :embedding
                            :context {}})
            result (chan->seq response-chan)]
        ;; Verify basic structure
        (is (pos? (count result)))
        ;; Should have text part
        (is (some #(= :text (:type %)) result))
        ;; Should have finish
        (is (some #(= :finish (:type %)) result))
        ;; Should have state
        (is (some #(and (= :data (:type %))
                        (map? (:data %)))
                  result))))))

;;; Query and Chart extraction tests

(deftest extract-queries-from-parts-test
  (testing "extracts queries from tool output parts"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :tool-output
                  :id "t1"
                  :function "query_model"
                  :result {:structured-output {:query-id "q-123"
                                               :query query
                                               :result-columns []}}}]
          memory {:state {:queries {} :charts {}}}
          updated-memory (#'agent/extract-queries-from-parts memory parts)]
      (is (= query (get-in updated-memory [:state :queries "q-123"])))))

  (testing "ignores parts without structured-output"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:output "no results"}}]
          memory {:state {:queries {} :charts {}}}
          updated-memory (#'agent/extract-queries-from-parts memory parts)]
      (is (empty? (get-in updated-memory [:state :queries])))))

  (testing "ignores non-tool-output parts"
    (let [parts [{:type :text :text "hello"}
                 {:type :tool-input :id "t1" :function "search"}]
          memory {:state {:queries {} :charts {}}}
          updated-memory (#'agent/extract-queries-from-parts memory parts)]
      (is (empty? (get-in updated-memory [:state :queries]))))))

(deftest extract-charts-from-parts-test
  (testing "extracts charts from tool output parts"
    (let [chart-data {:chart-id "c-456"
                      :query-id "q-123"
                      :chart-type :bar}
          parts [{:type :tool-output
                  :id "t1"
                  :function "create_chart"
                  :result {:structured-output chart-data}}]
          memory {:state {:queries {} :charts {}}}
          updated-memory (#'agent/extract-charts-from-parts memory parts)]
      (is (= chart-data (get-in updated-memory [:state :charts "c-456"])))))

  (testing "distinguishes charts from queries (charts have chart-id, queries have query)"
    (let [query-data {:query-id "q-789"
                      :query {:database 1}
                      :result-columns []}
          parts [{:type :tool-output
                  :id "t1"
                  :function "query_model"
                  :result {:structured-output query-data}}]
          memory {:state {:queries {} :charts {}}}
          updated-memory (#'agent/extract-charts-from-parts memory parts)]
      ;; Should NOT be extracted as a chart since it has :query
      (is (empty? (get-in updated-memory [:state :charts])))))

  (testing "ignores parts without chart-id"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:structured-output {:data []}}}]
          memory {:state {:queries {} :charts {}}}
          updated-memory (#'agent/extract-charts-from-parts memory parts)]
      (is (empty? (get-in updated-memory [:state :charts]))))))

;;; Link resolution during streaming tests

(deftest stream-parts-link-resolution-test
  (testing "resolves query links in streamed text"
    (let [out-chan (a/chan 10)
          query-id "stream-test-query"
          query {:database 1 :type :query :query {:source-table 1}}
          text-with-link (str "Check [Results](metabase://query/" query-id ")")
          parts [{:type :text :text text-with-link}]
          memory {:state {:queries {query-id query} :charts {}}}]
      (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
      (a/close! out-chan)
      (let [result (chan->seq out-chan)
            output-text (-> result first :text)]
        ;; metabase:// should be replaced with /question#
        (is (not (re-find #"metabase://" output-text)))
        (is (re-find #"/question#" output-text)))))

  (testing "resolves links split across text parts"
    (let [out-chan (a/chan 10)
          query-id "split-query"
          query {:database 1 :type :query :query {:source-table 1}}
          parts [{:type :text :text "Check [Results](metabase://query/"}
                 {:type :text :text (str query-id ") now")}]
          memory {:state {:queries {query-id query} :charts {}}}]
      (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
      (a/close! out-chan)
      (let [result (chan->seq out-chan)
            output-text (->> result
                             (filter #(= :text (:type %)))
                             (map :text)
                             (apply str))]
        (is (not (re-find #"metabase://" output-text)))
        (is (re-find #"\[Results\]\(/question#" output-text))))))

(testing "resolves chart links using chart state"
  (let [out-chan (a/chan 10)
        query-id "q-for-chart"
        chart-id "c-test-chart"
        query {:database 1 :type :query :query {:source-table 1}}
        text-with-link (str "See [My Chart](metabase://chart/" chart-id ")")
        parts [{:type :text :text text-with-link}]
        memory {:state {:queries {query-id query}
                        :charts {chart-id {:query-id query-id :chart-type :bar}}}}]
    (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
    (a/close! out-chan)
    (let [result (chan->seq out-chan)
          output-text (-> result first :text)]
        ;; Chart link should be resolved to /question#
      (is (not (re-find #"metabase://chart" output-text)))
      (is (re-find #"/question#" output-text)))))

(testing "resolves model/metric/dashboard links without state"
  (let [out-chan (a/chan 10)
        text-with-links "[Model](metabase://model/123) and [Metric](metabase://metric/456)"
        parts [{:type :text :text text-with-links}]
        memory {:state {:queries {} :charts {}}}]
    (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
    (a/close! out-chan)
    (let [result (chan->seq out-chan)
          output-text (-> result first :text)]
      (is (re-find #"\[Model\]\(/model/123\)" output-text))
      (is (re-find #"\[Metric\]\(/metric/456\)" output-text)))))

(testing "falls back to link text when unresolvable"
  (let [out-chan (a/chan 10)
          ;; Reference a query that doesn't exist in state
        text-with-link "See [Missing](metabase://query/nonexistent)"
        parts [{:type :text :text text-with-link}]
        memory {:state {:queries {} :charts {}}}]
    (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
    (a/close! out-chan)
    (let [result (chan->seq out-chan)
          output-text (-> result first :text)]
        ;; Link should fall back to just the link text when resolution fails
      (is (= "See Missing" output-text)))))

(testing "handles text parts with nil text gracefully"
  (let [out-chan (a/chan 10)
        parts [{:type :text :text nil}]
        memory {:state {:queries {} :charts {}}}]
    (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
    (a/close! out-chan)
    (let [result (chan->seq out-chan)]
      (is (= 1 (count result)))
      (is (nil? (-> result first :text))))))

(testing "streams non-text parts unchanged"
  (let [out-chan (a/chan 10)
        tool-part {:type :tool-input :id "t1" :function "search" :arguments {:query "test"}}
        parts [tool-part]
        memory {:state {:queries {} :charts {}}}]
    (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
    (a/close! out-chan)
    (let [result (chan->seq out-chan)]
      (is (= [tool-part] result)))))

;;; Reaction extraction and streaming tests

(deftest extract-reactions-from-parts-test
  (testing "extracts reactions from tool-output parts"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "show_results_to_user"
                  :result {:output "Results shown"
                           :reactions [{:type :metabot.reaction/redirect :url "/question#abc"}]}}]
          reactions (#'agent/extract-reactions-from-parts parts)]
      (is (= 1 (count reactions)))
      (is (= :metabot.reaction/redirect (:type (first reactions))))
      (is (= "/question#abc" (:url (first reactions))))))

  (testing "extracts reactions from multiple tool outputs"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "query_model"
                  :result {:structured-output {:query-id "q1"}
                           :reactions [{:type :metabot.reaction/redirect :url "/question#q1"}]}}
                 {:type :tool-output
                  :id "t2"
                  :function "create_chart"
                  :result {:structured-output {:chart-id "c1"}
                           :reactions [{:type :metabot.reaction/redirect :url "/question#c1"}]}}]
          reactions (#'agent/extract-reactions-from-parts parts)]
      (is (= 2 (count reactions)))))

  (testing "ignores non-tool-output parts"
    (let [parts [{:type :text :text "hello"}
                 {:type :tool-input :id "t1" :function "search"}]
          reactions (#'agent/extract-reactions-from-parts parts)]
      (is (empty? reactions))))

  (testing "handles parts without reactions"
    (let [parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:output "No results"}}]
          reactions (#'agent/extract-reactions-from-parts parts)]
      (is (empty? reactions)))))

(deftest stream-reactions-as-data-parts-test
  (testing "streams redirect reactions as navigate_to data parts"
    (let [out-chan (a/chan 10)
          parts [{:type :tool-output
                  :id "t1"
                  :function "show_results_to_user"
                  :result {:output "Results shown"
                           :reactions [{:type :metabot.reaction/redirect :url "/question#abc123"}]}}]
          memory {:state {:queries {} :charts {}}}]
      (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
      (a/close! out-chan)
      (let [result (chan->seq out-chan)
            data-parts (filter #(= :data (:type %)) result)]
        ;; Should have the tool-output part AND a data part for navigation
        (is (some #(= :tool-output (:type %)) result))
        (is (= 1 (count data-parts)))
        (is (= "navigate_to" (:data-type (first data-parts))))
        (is (= "/question#abc123" (:data (first data-parts)))))))

  (testing "does not emit data parts when no reactions"
    (let [out-chan (a/chan 10)
          parts [{:type :tool-output
                  :id "t1"
                  :function "search"
                  :result {:output "results"}}]
          memory {:state {:queries {} :charts {}}}]
      (a/<!! (#'agent/stream-parts-to-output! out-chan parts memory))
      (a/close! out-chan)
      (let [result (chan->seq out-chan)
            data-parts (filter #(= :data (:type %)) result)]
        (is (empty? data-parts))))))
