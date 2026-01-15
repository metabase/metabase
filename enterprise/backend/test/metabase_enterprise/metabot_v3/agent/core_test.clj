(ns metabase-enterprise.metabot-v3.agent.core-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.core :as agent]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- chan->seq
  "Convert channel to seq by reading all values until closed."
  [ch]
  (loop [acc []]
    (if-let [val (a/<!! ch)]
      (recur (conj acc val))
      acc)))

(defn- mock-llm-response
  "Create a mock LLM response channel with given parts."
  [parts]
  (let [ch (a/chan 10)]
    (a/go
      (doseq [part parts]
        (a/>! ch part))
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
    (is (true? (#'agent/has-tool-calls? [{:type :tool-input :id "t1"}])))
    (is (false? (#'agent/has-tool-calls? [{:type :text :text "hello"}])))
    (is (true? (#'agent/has-tool-calls? [{:type :text :text "hi"}
                                          {:type :tool-input :id "t1"}])))))

(deftest has-text-response-test
  (testing "detects text responses in parts"
    (is (true? (#'agent/has-text-response? [{:type :text :text "hello"}])))
    (is (false? (#'agent/has-text-response? [{:type :tool-input :id "t1"}])))
    (is (true? (#'agent/has-text-response? [{:type :tool-input :id "t1"}
                                             {:type :text :text "done"}])))))

(deftest should-continue-test
  (let [profile {:max-iterations 3}]
    (testing "continues when iteration < max and has tool calls"
      (is (true? (#'agent/should-continue? 0 profile [{:type :tool-input}])))
      (is (true? (#'agent/should-continue? 2 profile [{:type :tool-input}]))))

    (testing "stops at max iterations"
      (is (false? (#'agent/should-continue? 3 profile [{:type :tool-input}])))
      (is (false? (#'agent/should-continue? 4 profile [{:type :tool-input}]))))

    (testing "stops when text response present"
      (is (false? (#'agent/should-continue? 0 profile [{:type :text}])))
      (is (false? (#'agent/should-continue? 0 profile [{:type :tool-input}
                                                        {:type :text}]))))

    (testing "stops when no tool calls"
      (is (false? (#'agent/should-continue? 0 profile [{:type :usage}])))
      (is (false? (#'agent/should-continue? 0 profile []))))))

(deftest run-agent-loop-with-mock-test
  (testing "runs agent loop with mocked LLM returning text"
    (with-redefs [self/claude-raw (fn [_]
                                    (mock-llm-response
                                     [{:type :text :text "Hello"}]))]
      (let [messages [{:role :user :content "Hi"}]
            state {}
            profile-id :metabot-embedding
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
    (with-redefs [self/claude-raw (fn [{:keys [input]}]
                                    ;; First call returns tool-input, second returns text
                                    (if (= 1 (count input))
                                      (mock-llm-response
                                       [{:type :tool-input
                                         :id "t1"
                                         :function "search"
                                         :arguments {:query "test"}}])
                                      (mock-llm-response
                                       [{:type :text :text "Found results"}])))]
      (let [messages [{:role :user :content "Search for test"}]
            state {}
            profile-id :metabot-embedding
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
        (is (some #(= :tool-input (:type %)) result)))))

  (testing "handles errors gracefully"
    (with-redefs [self/claude-raw (fn [_]
                                    (throw (ex-info "Mock error" {})))]
      (let [messages [{:role :user :content "Hi"}]
            state {}
            profile-id :metabot-embedding
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
  (testing "builds messages from memory"
    (let [memory {:input-messages [{:role :user :content "Hello"}]
                  :steps-taken [{:parts [{:type :text :text "Hi"}]}]
                  :state {}}]
      ;; Just verify it doesn't throw
      (is (sequential? (#'agent/build-messages-for-llm memory))))))

(deftest stream-parts-to-output-test
  (testing "streams parts to output channel"
    (let [out-chan (a/chan 10)
          parts [{:type :text :text "hello"}
                 {:type :usage :tokens 100}]]
      (#'agent/stream-parts-to-output out-chan parts)
      (is (= parts (chan->seq out-chan))))))

(deftest finalize-stream-test
  (testing "finalizes stream with state and finish"
    (let [out-chan (a/chan 10)
          memory {:state {:queries {} :charts {}}}]
      (#'agent/finalize-stream out-chan memory)
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
                            :profile-id :metabot-embedding
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
