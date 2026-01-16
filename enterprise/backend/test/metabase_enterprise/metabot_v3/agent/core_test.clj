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
      (is (#'agent/should-continue? 2 profile [{:type :tool-input}])))

    (testing "continues when text AND tool calls present (LLM thinking aloud)"
      (is (#'agent/should-continue? 0 profile [{:type :tool-input}
                                               {:type :text}]))
      (is (#'agent/should-continue? 0 profile [{:type :text}
                                               {:type :tool-input}])))

    (testing "stops at max iterations"
      (is (not (#'agent/should-continue? 3 profile [{:type :tool-input}])))
      (is (not (#'agent/should-continue? 4 profile [{:type :tool-input}]))))

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
      (a/<!! (#'agent/finalize-stream! out-chan memory))
      (let [result (chan->seq out-chan)]
        (is (= 2 (count result)))
        (is (= :data (:type (first result))))
        (is (= :finish (:type (second result))))))))

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
