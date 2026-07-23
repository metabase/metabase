(ns metabase.metabot.self-test
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.malli.registry :as mr]
   [ring.adapter.jetty :as jetty]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; provider resolution tests

(deftest ^:parallel parse-provider-model-test
  (testing "parses provider/model format correctly"
    (is (=? {:provider "anthropic" :model "claude-haiku-4-5" :ai-proxy? false}
            (#'self/parse-provider-model "anthropic/claude-haiku-4-5")))
    (is (=? {:provider "openai" :model "gpt-4.1-mini" :ai-proxy? false}
            (#'self/parse-provider-model "openai/gpt-4.1-mini")))
    (is (=? {:provider "openrouter" :model "anthropic/claude-haiku-4-5" :ai-proxy? false}
            (#'self/parse-provider-model "openrouter/anthropic/claude-haiku-4-5")))
    (is (=? {:provider "openrouter" :model "google/gemini-2.5-flash" :ai-proxy? false}
            (#'self/parse-provider-model "openrouter/google/gemini-2.5-flash"))))
  (testing "parses metabase/ prefix (AI proxy)"
    (is (=? {:provider "anthropic" :model "claude-haiku-4-5" :ai-proxy? true}
            (#'self/parse-provider-model "metabase/anthropic/claude-haiku-4-5")))
    (is (=? {:provider "openai" :model "gpt-4.1-mini" :ai-proxy? true}
            (#'self/parse-provider-model "metabase/openai/gpt-4.1-mini")))
    (is (=? {:provider "openrouter" :model "anthropic/claude-haiku-4-5" :ai-proxy? true}
            (#'self/parse-provider-model "metabase/openrouter/anthropic/claude-haiku-4-5"))))
  (testing "throws for invalid formats/models"
    (is (thrown-with-msg? Exception #"Unknown LLM provider: no-slash" (#'self/parse-provider-model "no-slash")))
    (is (thrown-with-msg? Exception #"Unknown LLM provider: " (#'self/parse-provider-model "")))
    (is (thrown-with-msg? Exception #"Unknown LLM provider: " (#'self/parse-provider-model "/leading-slash")))))

(deftest ^:parallel resolve-adapter-test
  (testing "resolves known providers to adapter functions"
    (is (fn? (#'self/resolve-adapter "anthropic")))
    (is (fn? (#'self/resolve-adapter "openai")))
    (is (fn? (#'self/resolve-adapter "openrouter"))))
  (testing "throws for unknown provider"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unknown LLM provider"
                          (#'self/resolve-adapter "unknown")))))

(deftest call-llm-tool-choice-test
  (testing "passes required tool choice to LLM providers"
    (let [captured (atom nil)]
      (mt/with-premium-features #{:metabase-ai-managed}
        ;; `:api-error true` makes `rethrow-api-error!` rethrow as-is, so `::skip` survives on the outer ex-data.
        (mt/with-dynamic-fn-redefs [http/request (fn [opts]
                                                   (when (:body opts)
                                                     (reset! captured (json/decode+kw (:body opts))))
                                                   (throw (ex-info "stop" {::skip true :api-error true})))]
          (mt/with-temporary-setting-values [llm-anthropic-api-key  "sk-ant-test-key"
                                             llm-proxy-base-url     "http://proxy.example"
                                             llm-openrouter-api-key "sk-or-v1-test-key"
                                             llm-openai-api-key     "sk-test-key"]
            (doseq [[model expected] [["anthropic/test-model"   {:type "any"}]
                                      ["metabase/anthropic/claude-sonnet-4-6" {:type "any"}]
                                      ["openrouter/test-model" "required"]
                                      ["openai/test-model"     "required"]]]
              (try
                (run! identity (self/call-llm model
                                              nil
                                              []
                                              {"search" (get test-util/TOOLS "get-time")}
                                              {:tag "agent"}
                                              {:tool-choice "required"}))
                (catch Exception e
                  (when-not (::skip (ex-data e))
                    (throw e))))
              (is (= expected (:tool_choice @captured))))))))))

;;; utils tests

(deftest sse-reducible-test
  (testing "sse-reducible produces items via standard reduce"
    (let [data    ["just a test" "to make you jealous"]
          istream (io/input-stream (.getBytes (test-util/make-sse data)))
          result  (into [] (self.core/sse-reducible istream))]
      (is (= data result)))))

(deftest sse-reducible-early-termination-test
  (testing "sse-reducible stops on reduced"
    (let [data    (mapv #(str "msg-" %) (range 100))
          istream (io/input-stream (.getBytes (test-util/make-sse data)))
          ;; Take only first 3 items using reduced
          result  (reduce (fn [acc item]
                            (if (< (count acc) 3)
                              (conj acc item)
                              (reduced acc)))
                          []
                          (self.core/sse-reducible istream))]
      (is (= ["msg-0" "msg-1" "msg-2"] result)))))

(deftest sse-reducible-stops-response-test
  (let [cnt     (atom 30)
        handler (fn [_req]
                  (let [out (java.io.PipedOutputStream.)
                        in  (java.io.PipedInputStream. out 65536)]
                    (future
                      (try
                        (dotimes [i @cnt]
                          (.write out (.getBytes (test-util/make-sse [(str "msg-" i)])))
                          (.flush out)
                          (swap! cnt dec)
                          (Thread/sleep 10))
                        (catch Exception _)
                        (finally
                          (try (.close out)
                               (catch Exception _)))))
                    {:status  200
                     :headers {"Content-Type"      "text/event-stream"
                               "Cache-Control"     "no-cache"}
                     :body    in}))
        server  (jetty/run-jetty handler {:port 0
                                          :join? false
                                          :output-buffer-size 1})
        url     (str "http://localhost:" (.. server getURI getPort))]
    (try
      (let [res       (http/request {:method :post :url url :as :stream})
            reducible (self.core/sse-reducible (:body res))
            ;; Take only 2 items, which should trigger early termination
            result    (reduce (fn [acc item]
                                (if (< (count acc) 2)
                                  (conj acc item)
                                  (reduced acc)))
                              []
                              reducible)]
        (is (= ["msg-0" "msg-1"] result))
        ;; Give time for cancellation to propagate
        (Thread/sleep 30)
        ;; Should have stopped writing when reduction stopped
        (is (> @cnt 20) "SHOULD have stopped writing when reduction terminated early"))
      (finally
        (.stop server)))))

(deftest lite-aisdk-xf-test
  (testing "streams text deltas immediately instead of batching"
    (let [chunks [{:type :start :messageId "msg-1"}
                  {:type :text-start :id "text-1"}
                  {:type :text-delta :id "text-1" :delta "Hello "}
                  {:type :text-delta :id "text-1" :delta "world"}
                  {:type :text-delta :id "text-1" :delta "!"}
                  {:type :text-end :id "text-1"}
                  {:type :usage :usage {:promptTokens 10 :completionTokens 5}}]]
      (is (= [{:type :start :id "msg-1"}
              {:type :text :id "text-1" :text "Hello "}
              {:type :text :id "text-1" :text "world"}
              {:type :text :id "text-1" :text "!"}
              {:type :usage :usage {:promptTokens 10 :completionTokens 5}}]
             (into [] (self.core/lite-aisdk-xf) chunks)))))
  (testing "still collects tool inputs for JSON parsing"
    (let [chunks [{:type :start :messageId "msg-1"}
                  {:type :tool-input-start :toolCallId "call-1" :toolName "search"}
                  {:type :tool-input-delta :toolCallId "call-1" :inputTextDelta "{\"query\":"}
                  {:type :tool-input-delta :toolCallId "call-1" :inputTextDelta "\"test\"}"}
                  {:type :tool-input-available :toolCallId "call-1" :toolName "search"}]]
      (is (= [{:type :start :id "msg-1"}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "test"}}]
             (into [] (self.core/lite-aisdk-xf) chunks)))))
  (testing "converts tool-output-available to tool-output"
    (let [chunks [{:type                   :tool-output-available
                   :toolCallId             "call-1"
                   :toolName               "search"
                   :result                 {:data []}
                   ::self.core/duration-ms 1234}]]
      (is (= [{:type        :tool-output
               :id          "call-1"
               :function    "search"
               :result      {:data []}
               :error       nil
               :duration-ms 1234}]
             (into [] (self.core/lite-aisdk-xf) chunks)))))
  (testing "streams reasoning deltas and carries provider metadata on the end"
    (let [chunks [{:type :reasoning-start :id "r1"}
                  {:type :reasoning-delta :id "r1" :delta "Think"}
                  {:type :reasoning-delta :id "r1" :delta "ing"}
                  {:type :reasoning-end :id "r1" :providerMetadata {:anthropic {:signature "sig"}}}]]
      (is (= [{:type :reasoning :id "r1" :text "Think"}
              {:type :reasoning :id "r1" :text "ing"}
              {:type :reasoning :id "r1" :text "" :provider-metadata {:anthropic {:signature "sig"}}}]
             (into [] (self.core/lite-aisdk-xf) chunks)))))
  (testing "a reasoning-end without provider metadata emits no carrier"
    (is (= [{:type :reasoning :id "r1" :text "hm"}]
           (into [] (self.core/lite-aisdk-xf)
                 [{:type :reasoning-start :id "r1"}
                  {:type :reasoning-delta :id "r1" :delta "hm"}
                  {:type :reasoning-end :id "r1"}])))))

(deftest ^:parallel aisdk-xf-reasoning-grouping-test
  (testing "non-streaming mode joins reasoning deltas into one part with metadata"
    (is (= [{:type :reasoning :id "r1" :text "abc" :provider-metadata {:anthropic {:signature "sig"}}}]
           (into [] (self.core/aisdk-xf)
                 [{:type :reasoning-start :id "r1"}
                  {:type :reasoning-delta :id "r1" :delta "ab"}
                  {:type :reasoning-delta :id "r1" :delta "c"}
                  {:type :reasoning-end :id "r1" :providerMetadata {:anthropic {:signature "sig"}}}])))))

;;; tool executor

(deftest ^:parallel tool-executor-xf-test
  (testing "tool-executor-xf passes through all chunks unchanged"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-123"}
                   {:type :text :id "text-1" :text "Hello world"}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (= chunks result)
          "Non-tool chunks should pass through unchanged"))))

(deftest ^:parallel tool-executor-xf-test-2
  (testing "tool-executor-xf executes tool calls and appends results"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-123"}
                   {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
                   {:type :usage :usage {:total_tokens 100}}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (= (count chunks) (dec (count result)))
          "Should have original chunks plus one tool result")
      (is (= chunks (take (count chunks) result))
          "Original chunks should be unchanged")
      (let [tool-result (last result)]
        (is (=? {:type       :tool-output-available
                 :toolCallId "call-1"
                 :toolName   "get-time"
                 :result     string?}
                tool-result))))))

(deftest ^:parallel tool-executor-xf-test-3
  (testing "tool-executor-xf handles multiple concurrent tool calls"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-456"}
                   {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
                   {:type :tool-input :id "call-2" :function "convert-currency" :arguments {:amount 100, :from "EUR", :to "USD"}}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (= (+ (count chunks) 2) (count result))
          "Should have original chunks plus two tool results")
      (let [tool-results (take-last 2 result)]
        (is (every? #(= :tool-output-available (:type %)) tool-results)
            "Last two chunks should be tool outputs")
        (is (= #{"call-1" "call-2"}
               (set (map :toolCallId tool-results))))))))

(deftest ^:parallel tool-executor-xf-test-4
  (testing "tool-executor-xf handles tools returning reducibles"
    (let [llm-id "wut-1"
          input  "Little bits and pieces"
          chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-666"}
                   {:type :tool-input :id "call-1" :function "mock-llm" :arguments {:input input
                                                                                    :id    llm-id}}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (= 1 (count (filter #(= :start (:type %)) result)))
          "Just the first start is left in the stream")
      (is (< 3 (count (filter #(= llm-id (:id %)) result)))
          "We get output from our 'llm' in little pieces")
      (is (= {:type :text
              :id   llm-id
              :text input}
             (last (into [] (self.core/aisdk-xf) result)))))))

(deftest ^:parallel tool-executor-xf-test-5
  (testing "tool-executor-xf handles tool execution errors gracefully"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-789"}
                   {:type :tool-input :id "call-err" :function "get-time" :arguments {:tz "Invalid/Timezone"}}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (= (count chunks) (dec (count result))))
      (is (=? {:type       :tool-output-available
               :toolCallId "call-err"
               :toolName   "get-time"
               :error      {:message string?
                            :type    string?}}
              (last result))))))

(deftest ^:parallel tool-executor-xf-test-6
  (testing "tool-executor-xf handles nil arguments for no-arg tools"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-nil"}
                   {:type :tool-input :id "call-nil" :function "no-arg" :arguments nil}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (=? {:type       :tool-output-available
               :toolCallId "call-nil"
               :toolName   "no-arg"
               :result     {:output "ok"}}
              (last result))))))

(deftest ^:parallel tool-executor-xf-test-7
  (testing "tool-executor-xf ignores unknown tool names"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-789"}
                   {:type :tool-input :id "call-1" :function "unknown-tool" :arguments {:foo :bar}}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (= chunks result)
          "Unknown tools should be ignored, chunks pass through unchanged"))))

;;; tool :decode tests

(defn- make-decode-tool
  "Create a wrapped tool map that records its received arguments and has an optional `:decode` fn.
  Returns a map with `:fn`, `:doc`, `:schema` and optionally `:decode` — the same shape
  that [[wrap-tools-with-state]] produces."
  [tool-name received-atom decode-fn]
  (let [f (fn [args]
            (reset! received-atom args)
            {:output "ok"})]
    (cond-> {:fn f
             :doc (str tool-name " test tool")
             :schema [:=> [:cat [:map [:x :any]]] :any]}
      decode-fn (assoc :decode decode-fn))))

(deftest ^:parallel tool-decode-var-test
  (testing "tool definition map with :decode has decode applied before invocation"
    (let [received (atom nil)
          decode-fn (fn [args]
                      (update args :x inc))
          tool-def {:fn     (fn [args]
                              (reset! received args)
                              {:output "ok"})
                    :decode decode-fn
                    :schema [:=> [:cat [:map [:x :int]]] :any]
                    :doc    "increment x"}
          tools {"decode-inc" tool-def}
          chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-dec-1"}
                   {:type :tool-input :id "call-d1" :function "decode-inc" :arguments {:x 41}}])
          result (into [] (self.core/tool-executor-xf tools) chunks)
          tool-result (last result)]
      (is (= 42 (:x @received))
          "decode should have incremented x before the tool saw it")
      (is (=? {:type :tool-output-available :toolCallId "call-d1"}
              tool-result)))))

(deftest ^:parallel tool-decode-map-test
  (testing "wrapped tool map with :decode has decode applied"
    (let [received (atom nil)
          tool (make-decode-tool "coerce-test" received
                                 (fn [args]
                                   (update args :x str)))
          tools {"coerce-test" tool}
          chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-dec-2"}
                   {:type :tool-input :id "call-d2" :function "coerce-test" :arguments {:x 123}}])
          result (into [] (self.core/tool-executor-xf tools) chunks)
          tool-result (last result)]
      (is (= "123" (:x @received))
          "decode should have converted x to string before the tool saw it")
      (is (=? {:type :tool-output-available :toolCallId "call-d2"}
              tool-result)))))

(deftest ^:parallel tool-decode-error-test
  (testing "decode that throws agent-error is returned to LLM"
    (let [received (atom nil)
          tool (make-decode-tool "bad-decode" received
                                 (fn [_args]
                                   (throw (ex-info "Value must be positive"
                                                   {:agent-error? true :status-code 400}))))
          tools {"bad-decode" tool}
          chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-dec-3"}
                   {:type :tool-input :id "call-d3" :function "bad-decode" :arguments {:x -1}}])
          result (into [] (self.core/tool-executor-xf tools) chunks)
          tool-result (last result)]
      (is (nil? @received)
          "tool function should not have been called")
      (is (=? {:type       :tool-output-available
               :toolCallId "call-d3"
               :toolName   "bad-decode"
               :error      {:message #"Value must be positive"}}
              tool-result)))))

(deftest ^:parallel tool-without-decode-test
  (testing "tool without :decode still works normally"
    (let [received (atom nil)
          tool (make-decode-tool "no-decode" received nil)
          tools {"no-decode" tool}
          chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-dec-4"}
                   {:type :tool-input :id "call-d4" :function "no-decode" :arguments {:x 99}}])
          result (into [] (self.core/tool-executor-xf tools) chunks)
          tool-result (last result)]
      (is (= 99 (:x @received))
          "without decode, arguments pass through unchanged")
      (is (=? {:type :tool-output-available :toolCallId "call-d4"}
              tool-result)))))

(deftest ^:parallel tool-decode-coercion-test
  (testing "decode can deeply transform nested arguments (simulating temporal filter coercion)"
    (let [received (atom nil)
          ;; Simulate the temporal filter decode: walk into query.filters and coerce values
          decode-fn (fn [args]
                      (update-in args [:query :filters]
                                 (fn [filters]
                                   (mapv (fn [f]
                                           (if (and (= "year-of-era" (:bucket f))
                                                    (string? (:value f)))
                                             (assoc f :value (Integer/parseInt (subs (:value f) 0 4)))
                                             f))
                                         filters))))
          tool (make-decode-tool "construct-test" received decode-fn)
          tools {"construct-test" tool}
          chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-dec-5"}
                   {:type :tool-input :id "call-d5" :function "construct-test"
                    :arguments {:query {:filters [{:bucket "year-of-era" :value "2024-01-01"}
                                                  {:bucket nil :value "2024-06-15"}]}}}])
          result (into [] (self.core/tool-executor-xf tools) chunks)]
      (is (= 2024 (get-in @received [:query :filters 0 :value]))
          "year-of-era filter value should be coerced to integer")
      (is (= "2024-06-15" (get-in @received [:query :filters 1 :value]))
          "filter without bucket should pass through unchanged")
      (is (=? {:type :tool-output-available :toolCallId "call-d5"}
              (last result))))))

;;; AI SDK SSE output tests

(defn- sse-events
  "Run `parts` through [[self.core/parts->aisdk-sse-xf]] and decode each
  `data: {json}` line back to a map, asserting every event validates against
  the wire schema. The `[DONE]` terminator is checked then excluded."
  ([parts] (sse-events nil parts))
  ([opts parts]
   (let [lines (into [] (self.core/parts->aisdk-sse-xf opts) parts)]
     (is (every? #(str/starts-with? % "data: ") lines))
     (is (= "data: [DONE]\n" (last lines)))
     (let [events (mapv #(json/decode+kw (subs (str/trimr %) 6)) (butlast lines))]
       (doseq [event events]
         (is (nil? (mr/explain ::schema.v2/ui-message-chunk event))
             (str "event does not match the wire schema: " (pr-str event))))
       events))))

(deftest parts->aisdk-sse-xf-lifecycle-test
  (testing "first :start opens the message and a step; later :start is a step boundary; completion closes"
    (is (= [["start" "msg-1"] ["start-step" nil]
            ["finish-step" nil] ["start-step" nil]
            ["finish-step" nil] ["finish" nil]]
           (mapv (juxt :type :messageId)
                 (sse-events [{:type :start :id "msg-1"}
                              {:type :start :id "msg-1"}])))))
  (testing "a stream that never started still emits finish"
    (is (= ["finish"] (mapv :type (sse-events [])))))
  (testing ":message-id overrides the start event's message_id"
    (is (= "override-id"
           (-> (sse-events {:message-id "override-id"} [{:type :start :id "provider-id"}])
               first
               :messageId)))))

(deftest parts->aisdk-sse-xf-text-coalescing-test
  (testing "consecutive same-id :text parts share one block; an id change closes it"
    (is (= [["text-start" "t1" nil]
            ["text-delta" "t1" "Hel"]
            ["text-delta" "t1" "lo"]
            ["text-end" "t1" nil]
            ["text-start" "t2" nil]
            ["text-delta" "t2" "next"]
            ["text-end" "t2" nil]
            ["finish" nil nil]]
           (mapv (juxt :type :id :delta)
                 (sse-events [{:type :text :id "t1" :text "Hel"}
                              {:type :text :id "t1" :text "lo"}
                              {:type :text :id "t2" :text "next"}])))))
  (testing "a non-text part closes the open text block before its own events"
    (is (= ["text-start" "text-delta" "text-end" "data-state" "finish"]
           (mapv :type
                 (sse-events [{:type :text :id "t1" :text "hi"}
                              {:type :data :data-type "state" :data {:queries {}}}]))))))

(deftest parts->aisdk-sse-xf-reasoning-test
  (testing "consecutive same-id :reasoning parts share one block with a short wire id"
    (is (= [["reasoning-start" "1" nil]
            ["reasoning-delta" "1" "Think"]
            ["reasoning-delta" "1" "ing"]
            ["reasoning-end" "1" nil]
            ["finish" nil nil]]
           (mapv (juxt :type :id :delta)
                 (sse-events [{:type :reasoning :id "r1" :text "Think"}
                              {:type :reasoning :id "r1" :text "ing"}])))))
  (testing "reasoning and text close each other in both directions"
    (is (= ["reasoning-start" "reasoning-delta" "reasoning-end"
            "text-start" "text-delta" "text-end"
            "reasoning-start" "reasoning-delta" "reasoning-end"
            "finish"]
           (mapv :type
                 (sse-events [{:type :reasoning :id "r1" :text "hmm"}
                              {:type :text :id "t1" :text "answer"}
                              {:type :reasoning :id "r2" :text "more"}])))))
  (testing "empty-text parts (metadata carriers) emit nothing"
    (is (= ["finish"]
           (mapv :type
                 (sse-events [{:type :reasoning :id "r1" :text ""
                               :provider-metadata {:anthropic {:signature "sig"}}}]))))
    (is (= ["reasoning-start" "reasoning-delta" "reasoning-end" "finish"]
           (mapv :type
                 (sse-events [{:type :reasoning :id "r1" :text "hi"}
                              {:type :reasoning :id "r1" :text ""
                               :provider-metadata {:anthropic {:signature "sig"}}}])))))
  (testing "a tool part closes an open reasoning block first"
    (is (= ["reasoning-start" "reasoning-delta" "reasoning-end" "tool-input-available" "finish"]
           (mapv :type
                 (sse-events [{:type :reasoning :id "r1" :text "planning"}
                              {:type :tool-input :id "call-1" :function "search" :arguments {}}]))))))

(deftest parts->aisdk-sse-xf-tool-test
  (testing "tool input and successful output"
    (let [[input-event output-event] (sse-events [{:type :tool-input :id "call-1" :function "search"
                                                   :arguments {:q "test"}}
                                                  {:type :tool-output :id "call-1" :function "search"
                                                   :result {:output "rows" :resources [1 2]}
                                                   :duration-ms 12}])]
      (is (= {:type "tool-input-available" :toolCallId "call-1" :toolName "search" :input {:q "test"}}
             input-event))
      (is (= {:type "tool-output-available" :toolCallId "call-1" :output "rows"}
             output-event)
          "only the LLM-facing output string goes on the wire")))
  (testing "a result map without :output keeps internal keys off the wire"
    (let [[output-event] (sse-events [{:type :tool-output :id "call-i" :function "clarify"
                                       :result {:instructions "internal LLM steering — never show the client"
                                                :data-parts   [{:type "data-foo"}]}}])]
      (is (= {:type "tool-output-available" :toolCallId "call-i" :output ""}
             output-event)
          "no :output key -> empty wire output; internal :instructions/:data-parts never leak")))
  (testing "tool error becomes tool-output-error"
    (is (= {:type "tool-output-error" :toolCallId "call-2" :errorText "Tool failed"}
           (first (sse-events [{:type :tool-output :id "call-2" :error {:message "Tool failed"}}])))))
  (testing ":tool-input-start maps to tool-input-start"
    (is (= {:type "tool-input-start" :toolCallId "call-3" :toolName "search"}
           (first (sse-events [{:type :tool-input-start :id "call-3" :function "search"}]))))))

(deftest parts->aisdk-sse-xf-data-test
  (testing "data parts become typed data events with a generated id"
    (let [[event] (sse-events [{:type :data :data-type "navigate_to" :data {:url "/question/123"}}])]
      (is (= "data-navigate_to" (:type event)))
      (is (string? (:id event)))
      (is (= {:url "/question/123"} (:data event)))))
  (testing "unknown part types pass through as data events"
    (is (= "data-mystery"
           (-> (sse-events [{:type :mystery :id "x"}]) first :type)))))

(deftest parts->aisdk-sse-xf-error-test
  (testing "an error before any :start synthesizes start + start-step, and flips finish_reason"
    (let [events (sse-events [{:type :error :error {:message "Something went wrong"}}])]
      (is (=? [{:type "start" :messageId string?}
               {:type "start-step"}
               {:type "error" :errorText "Something went wrong"}
               {:type "finish-step"}
               {:type "finish" :finishReason "error"}]
              events))))
  (testing "a typed error's code rides finish.messageMetadata"
    (let [events (sse-events [{:type :error :error {:message    "You have reached your AI usage limit."
                                                    :error-code :ai_usage_limit_reached}}])]
      (is (=? [{:type "start" :messageId string?}
               {:type "start-step"}
               {:type "error" :errorText "You have reached your AI usage limit."}
               {:type "finish-step"}
               {:type "finish" :finishReason "error"
                :messageMetadata {:errorCode "ai_usage_limit_reached"}}]
              events))))
  (testing "accumulated usage and a typed error code share one finish.messageMetadata"
    (let [parts  [{:type :start :id "m"}
                  {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 10 :completionTokens 5}}
                  {:type :error :error {:message    "You have reached your AI usage limit."
                                        :error-code :ai_usage_limit_reached}}]
          finish (last (sse-events parts))]
      (is (=? {:type            "finish"
               :finishReason    "error"
               :messageMetadata {:usage        {:inputTokens 10 :outputTokens 5 :totalTokens 15}
                                 :usageByModel {:claude-sonnet-4-6 {:inputTokens 10 :outputTokens 5 :totalTokens 15}}
                                 :errorCode    "ai_usage_limit_reached"}}
              finish)))))

(deftest parts->aisdk-sse-xf-usage-test
  (testing "accumulated usage lands on finish.messageMetadata, last snapshot per model"
    (let [parts  [{:type :start :id "m"}
                  {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 5 :completionTokens 1}}
                  {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 10 :completionTokens 5}}
                  {:type :usage :model "gpt-5" :usage {:promptTokens 2 :completionTokens 3}}
                  {:type :finish}]
          finish (last (sse-events parts))]
      (is (= {:type "finish"
              :finishReason "stop"
              :messageMetadata {:usage        {:inputTokens 12 :outputTokens 8 :totalTokens 20
                                               :cacheCreationTokens 0 :cacheReadTokens 0 :cachedInputTokens 0}
                                :usageByModel {:claude-sonnet-4-6 {:inputTokens 10 :outputTokens 5 :totalTokens 15
                                                                   :cacheCreationTokens 0 :cacheReadTokens 0 :cachedInputTokens 0}
                                               :gpt-5             {:inputTokens 2 :outputTokens 3 :totalTokens 5
                                                                   :cacheCreationTokens 0 :cacheReadTokens 0 :cachedInputTokens 0}}}}
             finish))))
  (testing "finish omits messageMetadata when no usage was observed"
    (is (not (contains? (last (sse-events [{:type :text :id "t" :text "x"}]))
                        :messageMetadata)))))

(deftest parts->aisdk-sse-xf-usage-cache-test
  (testing "Anthropic cache breakdown flows onto finish.messageMetadata; non-cache models contribute 0"
    (let [parts  [{:type :start :id "m"}
                  {:type :usage :model "claude-sonnet-4-6"
                   :usage {:promptTokens 1540 :completionTokens 10
                           :cacheCreationTokens 300 :cacheReadTokens 1200}}
                  {:type :usage :model "gpt-5" :usage {:promptTokens 2 :completionTokens 3}}
                  {:type :finish}]
          finish (last (sse-events parts))]
      (is (= {:type "finish"
              :finishReason "stop"
              :messageMetadata
              {:usage        {:inputTokens 1542 :outputTokens 13 :totalTokens 1555
                              ;; cachedInputTokens mirrors cacheReadTokens; gpt-5 adds 0 to each
                              :cacheCreationTokens 300 :cacheReadTokens 1200 :cachedInputTokens 1200}
               :usageByModel {:claude-sonnet-4-6 {:inputTokens 1540 :outputTokens 10 :totalTokens 1550
                                                  :cacheCreationTokens 300 :cacheReadTokens 1200 :cachedInputTokens 1200}
                              :gpt-5             {:inputTokens 2 :outputTokens 3 :totalTokens 5
                                                  :cacheCreationTokens 0 :cacheReadTokens 0 :cachedInputTokens 0}}}}
             finish)))))

;;; ===================== Retry Logic Tests =====================

(deftest retryable-error-test
  (testing "check exception retryability"
    (are [x y] (= x (#'self/retryable-error? y))
      true  (ex-info "rate limited" {:status 429})
      true  (ex-info "overloaded" {:status 529})
      true  (ex-info "server error" {:status 500})
      false (ex-info "unauthorized" {:status 401})
      false (ex-info "bad request" {:status 400})
      ;; connection errors are also retriable
      true  (java.net.ConnectException. "refused")
      true  (java.net.SocketTimeoutException. "timed out")
      ;; but other stuff is not
      false (RuntimeException. "oops"))))

(deftest retry-delay-ms-test
  (testing "backoff"
    (are [timeout attempt ex] (<= timeout
                                  (#'self/retry-delay-ms attempt ex)
                                  ;; account for jitter
                                  (+ timeout 750))
      ;; attempt 1: ~500ms
      500  1 (ex-info "err" {:status 429})
      ;; attempt 2: ~1000ms
      1000 2 (ex-info "err" {:status 429})
      ;; respects Retry-After header
      3000 1 (ex-info "err" {:status 429 :headers {"retry-after" "3"}})
      ;; ignores Retry-After > 60s
      500  1 (ex-info "err" {:status 429 :headers {"retry-after" "120"}}))))

(deftest parse-retry-after-header-test
  (let [parse #'self/parse-retry-after-header]
    (testing "parses a plain string Retry-After into milliseconds"
      (is (= 3000 (parse (ex-info "e" {:headers {"retry-after" "3"}}))))
      (is (= 3000 (parse (ex-info "e" {:headers {"Retry-After" "3"}})))))
    (testing "ignores values over 60s and non-numeric values"
      (is (nil? (parse (ex-info "e" {:headers {"retry-after" "120"}}))))
      (is (nil? (parse (ex-info "e" {:headers {"retry-after" "soon"}})))))
    (testing "returns nil when the header is absent"
      (is (nil? (parse (ex-info "e" {})))))
    (testing "does not throw on a vector-valued header (duplicate Retry-After); uses the first value"
      (is (= 3000 (parse (ex-info "e" {:headers {"retry-after" ["3" "5"]}})))))))

(deftest with-retries-test
  (mt/with-dynamic-fn-redefs [self/retry-delay-ms (constantly 0)]
    (testing "succeeds on first attempt without retrying"
      (let [calls (atom 0)]
        (is (= :ok (#'self/with-retries
                    {:model "test-model" :tag "agent"}
                    (fn [] (swap! calls inc) :ok))))
        (is (= 1 @calls))))
    (testing "retries on retryable error and succeeds"
      (let [calls (atom 0)]
        (is (= :ok (mt/with-log-level [metabase.metabot.self :fatal]
                     (#'self/with-retries
                      {:model "test-model" :tag "agent"}
                      (fn []
                        (when (< (swap! calls inc) 3)
                          (throw (ex-info "rate limited" {:status 429})))
                        :ok)))))
        (is (= 3 @calls))))
    (testing "propagates non-retryable errors immediately"
      (let [calls (atom 0)]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"unauthorized"
             (#'self/with-retries
              {:model "test-model" :tag "agent"}
              (fn []
                (swap! calls inc)
                (throw (ex-info "unauthorized" {:status 401}))))))
        (is (= 1 @calls))))
    (testing "gives up after max retries and throws last error"
      (let [calls (atom 0)]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"overloaded"
             (mt/with-log-level [metabase.metabot.self :fatal]
               (#'self/with-retries
                {:model "test-model" :tag "agent"}
                (fn []
                  (swap! calls inc)
                  (throw (ex-info "overloaded" {:status 529})))))))
        (is (= 3 @calls))))
    (testing "retries on connection errors"
      (let [calls (atom 0)]
        (is (= :ok (mt/with-log-level [metabase.metabot.self :fatal]
                     (#'self/with-retries
                      {:model "test-model" :tag "agent"}
                      (fn []
                        (when (< (swap! calls inc) 2)
                          (throw (java.net.ConnectException. "refused")))
                        :ok)))))
        (is (= 2 @calls))))))

(defn- malformed-tool-input-response
  "A reducible LLM stream whose forced tool call streams invalid JSON, so
  `parse-tool-arguments` yields the `{:_raw_arguments ...}` sentinel."
  []
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (reduce rf init [{:type :start :messageId "m1"}
                       {:type :tool-input-start :toolCallId "c1" :toolName "json"}
                       {:type :tool-input-delta :toolCallId "c1" :inputTextDelta "{not valid json"}
                       {:type :tool-input-available :toolCallId "c1" :toolName "json"}]))))

(deftest call-llm-structured-rejects-malformed-json-test
  (testing "malformed tool-call JSON is rejected as an error, not returned as a bogus result"
    (mt/with-dynamic-fn-redefs [self/retry-delay-ms   (constantly 0)
                                openrouter/openrouter (constantly (malformed-tool-input-response))]
      (mt/with-log-level [metabase.metabot.self.core :fatal]
        (let [e (try
                  (self/call-llm-structured "openrouter/test-model"
                                            [{:role "user" :content "test"}]
                                            {:type "object" :properties {:answer {:type "string"}}}
                                            0.3 1024 {:tag "metabot_agent"})
                  (catch clojure.lang.ExceptionInfo e e))]
          (is (instance? clojure.lang.ExceptionInfo e)
              "malformed JSON must throw, not return the {:_raw_arguments ...} sentinel as a result")
          (is (= "structured-output-invalid" (:error-code (ex-data e)))))))))

(deftest call-llm-structured-surfaces-provider-error-test
  (testing "a provider mid-stream :error part surfaces its message, not a generic 'no tool call' error"
    (mt/with-dynamic-fn-redefs [self/retry-delay-ms      (constantly 0)
                                openrouter/openrouter    (constantly
                                                          (test-util/mock-llm-response
                                                           [{:type :error :errorText "content policy violation"}]))]
      (mt/with-log-level [metabase.metabot.self :fatal]
        (let [e (try
                  (self/call-llm-structured "openrouter/test-model"
                                            [{:role "user" :content "test"}]
                                            {:type "object" :properties {:answer {:type "string"}}}
                                            0.3 1024 {:tag "metabot_agent"})
                  (catch clojure.lang.ExceptionInfo e e))]
          (is (instance? clojure.lang.ExceptionInfo e))
          (is (re-find #"content policy violation" (ex-message e))
              "the provider error message is surfaced, not hidden behind 'no tool call'")
          (is (= "llm-stream-error" (:error-code (ex-data e)))))))))

(deftest call-llm-does-not-replay-after-partial-emission-test
  (testing "a retryable failure AFTER parts were emitted does not replay the stream (no duplicate output / re-run tools)"
    (mt/with-dynamic-fn-redefs
      [self/retry-delay-ms   (constantly 0)
       openrouter/openrouter (constantly
                              (reify clojure.lang.IReduceInit
                                (reduce [_ rf init]
                                  ;; emit one chunk, then fail mid-stream with an otherwise-retryable error
                                  (let [_acc (rf init {:type :start :messageId "m1"})]
                                    (throw (ex-info "mid-stream boom" {:status 500}))))))]
      (mt/with-log-level [metabase.metabot.self :fatal]
        (let [seen       (atom [])
              collect-rf (fn ([acc] acc) ([acc x] (swap! seen conj x) acc))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"mid-stream boom"
               (reduce collect-rf nil (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"}))))
          (is (= 1 (count (filter #(= :start (:type %)) @seen)))
              "the :start part reaches the consumer exactly once, not once per retry attempt"))))))

(deftest call-llm-still-retries-before-any-emission-test
  (testing "a retryable failure BEFORE any part is emitted is still retried (clean replay)"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs
        [self/retry-delay-ms   (constantly 0)
         openrouter/openrouter (fn [_opts]
                                 (reify clojure.lang.IReduceInit
                                   (reduce [_ rf init]
                                     (if (< (swap! calls inc) 3)
                                       (throw (ex-info "rate limited" {:status 429}))
                                       (reduce rf init (test-util/mock-llm-response [{:type :start :id "m1"}]))))))]
        (mt/with-log-level [metabase.metabot.self :fatal]
          (let [seen (atom [])]
            (reduce (fn [acc x] (swap! seen conj x) acc) nil
                    (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"}))
            (is (= 3 @calls) "retries until the pre-emission failures clear")
            (is (= 1 (count (filter #(= :start (:type %)) @seen))))))))))

;;; ===================== Prometheus Metrics Tests =====================

(deftest call-llm-prometheus-test
  (mt/with-prometheus-system! [_ system]
    (mt/with-dynamic-fn-redefs [self/retry-delay-ms (constantly 0)]
      (let [labels {:model "openrouter/test-model" :source "metabot_agent"}]
        (testing "increments llm-requests and observes duration on success"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (constantly (test-util/mock-llm-response [{:type :start :id "m1"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"})))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))
        ;; mt/with-prometheus-system! is slow, so clear! metrics between tests rather than creating a fresh system
        (analytics/clear! :metabase-metabot/llm-requests)
        (analytics/clear! :metabase-metabot/llm-duration-ms)
        (testing "increments llm-retries on transient failures, no errors on eventual success"
          (let [calls (atom 0)]
            (mt/with-log-level [metabase.metabot.self :fatal]
              (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                          (fn [_opts]
                                            (reify clojure.lang.IReduceInit
                                              (reduce [_ rf init]
                                                (if (< (swap! calls inc) 3)
                                                  (throw (ex-info "rate limited" {:status 429}))
                                                  (reduce rf init (test-util/mock-llm-response [{:type :start :id "m1"}]))))))]
                (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"}))))
            (is (== 3 (mt/metric-value system :metabase-metabot/llm-requests labels)))
            (is (== 2 (mt/metric-value system :metabase-metabot/llm-retries labels)))
            (is (== 0 (mt/metric-value system :metabase-metabot/llm-errors
                                       (assoc labels :error-type "ExceptionInfo"))))
            (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels))))))
        (analytics/clear! :metabase-metabot/llm-requests)
        (analytics/clear! :metabase-metabot/llm-retries)
        (analytics/clear! :metabase-metabot/llm-duration-ms)
        (testing "increments llm-errors on non-retryable failure, no retries"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (fn [_opts]
                                        (reify clojure.lang.IReduceInit
                                          (reduce [_ _rf _init]
                                            (throw (ex-info "unauthorized" {:status 401})))))]
            (is (thrown? Exception (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"})))))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))
        (analytics/clear! :metabase-metabot/llm-requests)
        (analytics/clear! :metabase-metabot/llm-errors)
        (analytics/clear! :metabase-metabot/llm-duration-ms)
        (testing "increments llm-errors with :error-type llm-sse-error on inline SSE errors"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (constantly (test-util/mock-llm-response [{:type :error :errorText "content policy violation"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"})))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "llm-sse-error")))))
        (testing "reports token usage metrics on :usage parts"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (constantly (test-util/mock-llm-response
                                                   [{:type  :start
                                                     :id    "m1"}
                                                    {:type  :usage
                                                     :usage {:promptTokens 100 :completionTokens 25}
                                                     :model "test-model"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"})))
          (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
          (is (==  25 (mt/metric-value system :metabase-metabot/llm-output-tokens labels)))
          (is (== 125 (:sum (mt/metric-value system :metabase-metabot/llm-tokens-per-call labels)))))
        (analytics/clear! :metabase-metabot/llm-input-tokens)
        (analytics/clear! :metabase-metabot/llm-output-tokens)
        (analytics/clear! :metabase-metabot/llm-cache-creation-tokens)
        (analytics/clear! :metabase-metabot/llm-cache-read-tokens)
        (testing "increments cache token counters when the :usage part carries cache fields"
          ;; :promptTokens is the pre-summed total input (40 fresh + 300 cache_creation + 1200 cache_read = 1540).
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (constantly (test-util/mock-llm-response
                                                   [{:type  :start :id "m1"}
                                                    {:type  :usage
                                                     :usage {:promptTokens        1540
                                                             :completionTokens    10
                                                             :cacheCreationTokens 300
                                                             :cacheReadTokens     1200}
                                                     :model "test-model"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"})))
          (is (==  300 (mt/metric-value system :metabase-metabot/llm-cache-creation-tokens labels)))
          (is (== 1200 (mt/metric-value system :metabase-metabot/llm-cache-read-tokens labels))))
        (analytics/clear! :metabase-metabot/llm-input-tokens)
        (analytics/clear! :metabase-metabot/llm-output-tokens)
        (analytics/clear! :metabase-metabot/llm-cache-creation-tokens)
        (analytics/clear! :metabase-metabot/llm-cache-read-tokens)
        (testing "does not increment cache counters when cache fields are absent or zero"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (constantly (test-util/mock-llm-response
                                                   [{:type  :start :id "m1"}
                                                    {:type  :usage
                                                     :usage {:promptTokens 10 :completionTokens 5}
                                                     :model "test-model"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "metabot_agent"})))
          (is (zero? (mt/metric-value system :metabase-metabot/llm-cache-creation-tokens labels)))
          (is (zero? (mt/metric-value system :metabase-metabot/llm-cache-read-tokens labels))))))))

(deftest call-llm-structured-prometheus-test
  (mt/with-prometheus-system! [_ system]
    (mt/with-dynamic-fn-redefs [self/retry-delay-ms (constantly 0)]
      (let [labels        {:model "openrouter/test-model" :source "metabot_agent"}
            success-mock  (test-util/mock-llm-response
                           [{:type :start :id "m1"}
                            {:type :tool-input :id "call-1" :function "json"
                             :arguments {:answer "42"}}])
            call-structured! #(self/call-llm-structured
                               "openrouter/test-model"
                               [{:role "user" :content "test"}]
                               {:type "object" :properties {:answer {:type "string"}}}
                               0.3 1024 {:tag "metabot_agent"})]
        (testing "increments llm-requests and observes duration on success"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (constantly success-mock)]
            (call-structured!))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))
        (analytics/clear! :metabase-metabot/llm-requests)
        (analytics/clear! :metabase-metabot/llm-duration-ms)
        (testing "increments llm-retries on transient failures, no errors on eventual success"
          (let [calls (atom 0)]
            (mt/with-log-level [metabase.metabot.self :fatal]
              (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                          (fn [_opts]
                                            (if (< (swap! calls inc) 3)
                                              (throw (ex-info "rate limited" {:status 429}))
                                              success-mock))]
                (call-structured!))))
          (is (== 3 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 2 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))
        (analytics/clear! :metabase-metabot/llm-requests)
        (analytics/clear! :metabase-metabot/llm-retries)
        (analytics/clear! :metabase-metabot/llm-duration-ms)
        (testing "increments llm-errors on non-retryable failure, no retries"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (fn [_opts] (throw (ex-info "unauthorized" {:status 401})))]
            (is (thrown? Exception (call-structured!))))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))
        (analytics/clear! :metabase-metabot/llm-requests)
        (analytics/clear! :metabase-metabot/llm-errors)
        (analytics/clear! :metabase-metabot/llm-duration-ms)
        (testing "increments llm-errors with :error-type llm-sse-error on inline SSE errors"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (constantly (test-util/mock-llm-response
                                                   [{:type :error :errorText "content policy violation"}]))]
            (is (thrown? Exception (call-structured!))))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "llm-sse-error")))))
        (testing "reports token usage metrics on :usage parts"
          (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                      (constantly (test-util/mock-llm-response
                                                   [{:type :start :id "m1"}
                                                    {:type :tool-input :id "call-1" :function "json"
                                                     :arguments {:answer "42"}}
                                                    {:type :usage :usage {:promptTokens 100 :completionTokens 25}
                                                     :model "test-model"}]))]
            (call-structured!))
          (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
          (is (==  25 (mt/metric-value system :metabase-metabot/llm-output-tokens labels)))
          (is (== 125 (:sum (mt/metric-value system :metabase-metabot/llm-tokens-per-call labels)))))))))

;;; ===================== Snowplow Analytics Tests =====================

(def ^:private snowplow-tracking-opts
  {:request-id "00000000-0000-0000-0000-000000000001"
   :session-id "00000000-0000-0000-0000-000000000002"
   :source     "metabot_agent"
   :tag        "test-tag"})

(deftest call-llm-snowplow-test
  (testing "fires :snowplow/token_usage and :snowplow/ai_service_event for call-llm with a tool call"
    (let [rasta-id (mt/user->id :rasta)]
      ;; The adapter pre-sums input + cache_creation + cache_read into :promptTokens,
      ;; so the mock supplies the already-summed value (950 = 100 fresh + 50 cache_creation + 800 cache_read).
      ;; total_tokens reverts to prompt + completion = 950 + 20 = 970.
      (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                  (constantly (test-util/mock-llm-response
                                               [{:type :start :id "msg-1"}
                                                {:type :tool-input :id "call-1" :function "get-time"
                                                 :arguments {:tz "UTC"}}
                                                {:type :usage :usage {:promptTokens        950
                                                                      :completionTokens    20
                                                                      :cacheCreationTokens 50
                                                                      :cacheReadTokens     800}
                                                 :model "test-model" :id "msg-1"}]))]
        (mt/with-current-user rasta-id
          (snowplow-test/with-fake-snowplow-collector
            (run! identity (self/call-llm "openrouter/test-model" nil [] test-util/TOOLS snowplow-tracking-opts))
            (let [events       (snowplow-test/pop-event-data-and-user-id!)
                  token-events (filter #(contains? (:data %) "total_tokens") events)
                  tool-events  (filter #(= "agent_used_tool" (get-in % [:data "event"])) events)]
              (is (=? [{:user-id (str rasta-id)
                        :data    {"model_id"              "openrouter/test-model"
                                  "total_tokens"           970
                                  "prompt_tokens"          950
                                  "completion_tokens"      20
                                  "cache_creation_tokens"  50
                                  "cache_read_tokens"      800
                                  "estimated_costs_usd"    0.0
                                  "duration_ms"            nat-int?
                                  "source"                 "metabot_agent"
                                  "tag"                    "test-tag"
                                  "session_id"             "00000000-0000-0000-0000-000000000002"}}]
                      token-events))
              (is (=? [{:user-id (str rasta-id)
                        :data    {"event"         "agent_used_tool"
                                  "source"        "metabot_agent"
                                  "result"        "success"
                                  "duration_ms"   nat-int?
                                  "session_id"    "00000000-0000-0000-0000-000000000002"
                                  "event_details" {"tool_name" "get-time"}}}]
                      tool-events)))))))))

(deftest call-llm-structured-snowplow-test
  (testing "fires :snowplow/token_usage event for call-llm-structured"
    (let [rasta-id (mt/user->id :rasta)]
      (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                  (constantly (test-util/mock-llm-response
                                               [{:type :start :id "msg-1"}
                                                {:type :tool-input :id "call-1" :function "json"
                                                 :arguments {:answer "42"}}
                                                {:type :usage :usage {:promptTokens 50 :completionTokens 10}
                                                 :model "test-model" :id "msg-1"}]))]
        (mt/with-current-user rasta-id
          (snowplow-test/with-fake-snowplow-collector
            (self/call-llm-structured "openrouter/test-model"
                                      [{:role "user" :content "test"}]
                                      {:type "object" :properties {:answer {:type "string"}}}
                                      0.3
                                      1024
                                      snowplow-tracking-opts)
            (let [events       (snowplow-test/pop-event-data-and-user-id!)
                  token-events (filter #(contains? (:data %) "total_tokens") events)]
              (is (=? [{:user-id (str rasta-id)
                        :data    {"model_id"            "openrouter/test-model"
                                  "total_tokens"         60
                                  "prompt_tokens"        50
                                  "completion_tokens"    10
                                  "estimated_costs_usd"  0.0
                                  "duration_ms"          nat-int?
                                  "source"               "metabot_agent"
                                  "tag"                  "test-tag"
                                  "session_id"           "00000000-0000-0000-0000-000000000002"}}]
                      token-events)))))))))

(deftest ^:parallel body-preview-test
  (let [body-preview #'self.core/body-preview]
    (testing "nil, blank, and non-string scalars → nil"
      (is (every? nil? (map body-preview [nil "" "   " 500 :error true]))))
    (testing "plain strings pass through trimmed"
      (is (= "Internal Server Error" (body-preview "  Internal Server Error  "))))
    (testing "JSON envelopes prefer [:error :message] over :error/:detail/:message"
      (is (= "model decommissioned" (body-preview {:error {:message "model decommissioned" :type "x"}})))
      (is (= "invalid metric"       (body-preview {:error  "invalid metric"})))
      (is (= "missing prompt"       (body-preview {:detail "missing prompt"})))
      (is (= "bad request"          (body-preview {:message "bad request"}))))
    (testing "extract-error-message returns nil for non-string values at the recognised keys"
      (let [extract #'self.core/extract-error-message]
        (is (every? nil? (map extract [{:error  {:code 42 :type "x"}}
                                       {:detail [{:loc ["body" "prompt"]}]}
                                       {:message {:code "missing"}}
                                       {:error  {:message {:code 500}}}
                                       {:error  42}])))))
    (testing "a non-string, blank, or whitespace-only at one key falls through to a later key"
      (is (= "real error" (body-preview {:error {:message {:code 500}} :detail "real error"})))
      (is (= "real error" (body-preview {:error ""    :detail "real error"})))
      (is (= "real error" (body-preview {:error "   " :detail "real error"}))))
    (testing "empty maps and arrays return nil (nothing to preview, no warn)"
      (let [msgs (log.capture/with-log-messages-for-level [msgs [metabase.metabot.self.core :warn]]
                   (is (every? nil? (map body-preview [{} []])))
                   (msgs))]
        (is (empty? msgs))))
    (testing "non-empty maps/arrays without a recognised error field pr-str into the preview, no warn"
      ;; rethrow-api-error! already emits a single warn at the failure boundary with the (bounded) body,
      ;; so body-preview must not emit a second warn for unrecognised shapes — that's a duplicate.
      (let [bodies [{:request-id "abc" :trace ["frame1"]}
                    [42 :kw]
                    [{:request-id "abc"}]
                    {:error {:code 42 :type "x"}}]
            msgs   (log.capture/with-log-messages-for-level [msgs [metabase.metabot.self.core :warn]]
                     (doseq [b bodies]
                       (is (= (pr-str b) (body-preview b))
                           (str "pr-str fallback for " (pr-str b))))
                     (msgs))]
        (is (empty? msgs)
            "body-preview must not warn — rethrow-api-error! logs the (bounded) body once already")))
    (testing "JSON arrays probe their first element"
      (is (= "rate limited"  (body-preview [{:error {:message "rate limited"}} {:type "x"}])))
      (is (= "first message" (body-preview ["first message" "ignored"]))))
    (testing "long bodies are truncated to 500 chars with an ellipsis"
      (let [preview (body-preview (apply str (repeat 2000 \x)))]
        (is (str/ends-with? preview "…"))
        (is (= 501 (count preview)))))))

(deftest ^:parallel body-for-log-bounding-test
  (let [body-for-log   #'self.core/body-for-log
        bounded-pr-str #'self.core/bounded-pr-str
        max-log        @#'self.core/max-body-log-chars]
    (testing "a huge string body is sliced before pr-str, never rendered in full"
      ;; Proof of pre-truncation: without it, bounded-pr-str would print all 1M chars before
      ;; the caller could truncate. The printed result stays near the limit instead.
      (is (< (count (bounded-pr-str (apply str (repeat 1000000 \x)) max-log))
             (+ max-log 10))))
    (testing "body-for-log caps a huge string at max-body-log-chars with an ellipsis"
      (let [out (body-for-log (apply str (repeat 1000000 \x)))]
        (is (str/ends-with? out "…"))
        (is (= (inc max-log) (count out)))))
    (testing "a many-element collection renders under *print-length* and stays bounded"
      (let [out (body-for-log (vec (range 100000)))]
        (is (<= (count out) max-log))
        (is (str/includes? out "...") "the *print-length* elision marker is present")))
    (testing "a small recognised body is left untouched by the bounds"
      (is (= (pr-str {:error {:message "nope"}})
             (body-for-log {:error {:message "nope"}}))))
    (testing "a huge string leaf inside a collection is sliced before pr-str renders the parent"
      ;; Regression: previously `bounded-pr-str` only pre-sliced *top-level* strings.
      ;; A map with a near-cap string leaf (e.g. parsed JSON `{:detail "<1MB>"}`)
      ;; would allocate the whole leaf inside pr-str and rely on the outer truncate-to
      ;; to cap the result — wasteful on the error path. Now nested string leaves
      ;; get sliced too.
      (let [body {:detail (apply str (repeat 1000000 \x))}
            out  (bounded-pr-str body max-log)]
        (is (<= (count out) (+ max-log 100))
            "bounded-pr-str should not render the full huge string leaf")
        (is (str/includes? out ":detail")
            "the map structure should still survive past the slicing")))))

(defn- caught
  "Run `thunk` and return the thrown exception, or nil if it didn't throw."
  [thunk]
  (try (thunk) nil (catch Exception e e)))

(deftest rethrow-api-error!-passthrough-test
  (testing ":api-error exceptions are rethrown unchanged"
    (let [original (ex-info "boom" {:api-error true :error-code :proxy-not-configured})]
      (is (identical? original
                      (caught #(self.core/rethrow-api-error! "anthropic" (constantly "X") original)))))))

(deftest rethrow-api-error!-string-body-test
  (testing "HTTP responses with a body get the upstream body appended and surfaced in ex-data"
    (let [upstream (ex-info "clj-http error"
                            {:status                500
                             :reason-phrase         "Internal Server Error"
                             :headers               {"content-type" "application/json"}
                             :body                  (json/encode {:error {:message "model decommissioned"}})
                             :http-client           (reify java.io.Closeable (close [_]))
                             :trace-redirects       ["http://elsewhere"]
                             :orig-content-encoding "gzip"})
          ex       (caught #(self.core/rethrow-api-error!
                             "anthropic"
                             (fn [res] (str "Anthropic API error (HTTP " (:status res) ")"))
                             upstream))]
      (is (= "Anthropic API error (HTTP 500) — model decommissioned" (ex-message ex)))
      ;; pin exact ex-data keys — clj-http internals (:http-client, :trace-redirects, …) must not leak.
      (is (= #{:status :reason-phrase :headers :body :api-error :provider :error-code}
             (set (keys (ex-data ex)))))
      (is (=? {:api-error true :provider "anthropic" :error-code :provider-api-error
               :status 500 :body {:error {:message "model decommissioned"}}}
              (ex-data ex)))))
  (testing "non-JSON bodies still get a preview appended"
    (let [upstream (ex-info "clj-http error"
                            {:status 502 :reason-phrase "Bad Gateway"
                             :headers {"content-type" "text/plain"}
                             :body "upstream gateway timeout"})
          ex       (caught #(self.core/rethrow-api-error!
                             "openrouter"
                             (constantly "OpenRouter upstream provider returned an error")
                             upstream))]
      (is (str/includes? (ex-message ex) "OpenRouter upstream provider returned an error"))
      (is (str/includes? (ex-message ex) "upstream gateway timeout"))
      (is (= #{:status :reason-phrase :headers :body :api-error :provider :error-code}
             (set (keys (ex-data ex)))))))
  (testing "structured maps without :error/:detail/:message pr-str into the user-facing message"
    (let [upstream (ex-info "clj-http error"
                            {:status 500 :reason-phrase "Internal Server Error"
                             :headers {"content-type" "application/json"}
                             :body (json/encode {:request-id "abc" :trace ["frame1"]})})
          ex       (caught #(self.core/rethrow-api-error!
                             "anthropic"
                             (constantly "Anthropic API is not working but not saying why")
                             upstream))]
      (is (str/includes? (ex-message ex) "Anthropic API is not working but not saying why"))
      (is (str/includes? (ex-message ex) ":request-id")
          "the unrecognised envelope's pr-str is appended so operators see what we got")
      (is (= {:request-id "abc" :trace ["frame1"]} (:body (ex-data ex)))
          "the full body is still preserved in ex-data for debugging")
      (is (= #{:status :reason-phrase :headers :body :api-error :provider :error-code}
             (set (keys (ex-data ex))))))))

(deftest rethrow-api-error!-no-body-test
  (testing "non-HTTP errors (no :body) fall through to the request-failed branch"
    (let [ex (caught #(self.core/rethrow-api-error!
                       "openai" (constantly "unused") (java.net.SocketTimeoutException. "Read timed out")))]
      (is (str/includes? (ex-message ex) "API request failed"))
      (is (str/includes? (ex-message ex) "Read timed out"))
      ;; pin exact ex-data keys for the no-body branch too.
      (is (= #{:api-error :provider :error-code :exception-class}
             (set (keys (ex-data ex)))))
      (is (=? {:api-error true :provider "openai" :error-code :provider-request-failed
               :exception-class "java.net.SocketTimeoutException"}
              (ex-data ex)))))
  (testing "no-body branch drops the trailing colon when ex-message is blank"
    (let [ex (caught #(self.core/rethrow-api-error! "openai" (constantly "unused") (RuntimeException.)))]
      (is (= "openai API request failed" (ex-message ex)))
      (is (= #{:api-error :provider :error-code :exception-class}
             (set (keys (ex-data ex))))))))

(deftest rethrow-api-error!-input-stream-test
  (testing "InputStream JSON bodies are decoded and structured-extracted"
    (let [json     (json/encode {:error {:message "model decommissioned"}})
          upstream (ex-info "clj-http error"
                            {:status  500 :reason-phrase "Internal Server Error"
                             :headers {"content-type" "application/json"}
                             :body    (java.io.ByteArrayInputStream. (.getBytes ^String json))})
          ex       (caught #(self.core/rethrow-api-error!
                             "anthropic"
                             (fn [res] (str "Anthropic API error (HTTP " (:status res) ")"))
                             upstream))]
      (is (= "Anthropic API error (HTTP 500) — model decommissioned" (ex-message ex)))
      (is (=? {:error {:message "model decommissioned"}} (:body (ex-data ex))))))
  (testing "Large InputStream bodies are bounded — not fully slurped into memory"
    ;; ByteArrayInputStream.available() returns the unread byte count, so we can
    ;; measure how much rethrow-api-error! pulled off the stream without proxying.
    (let [body-bytes (.getBytes ^String (apply str (repeat 2000000 \x)))
          stream     (java.io.ByteArrayInputStream. body-bytes)
          upstream   (ex-info "clj-http error"
                              {:status  502 :reason-phrase "Bad Gateway"
                               :headers {"content-type" "text/plain"}
                               :body    stream})
          ex         (caught #(self.core/rethrow-api-error!
                               "openrouter"
                               (constantly "OpenRouter upstream provider returned an error")
                               upstream))
          consumed   (- (alength body-bytes) (.available stream))]
      (is (str/includes? (ex-message ex) "OpenRouter upstream provider returned an error"))
      (is (str/ends-with? (ex-message ex) "…"))
      (is (< consumed (alength body-bytes))
          "should not consume the entire 2MB stream just to surface an error preview")))
  (testing "Truncated InputStream JSON bodies fall back to the raw bounded string"
    ;; A small slurp cap forces the JSON to be cut mid-envelope. We should fall back
    ;; to surfacing the raw bounded string rather than throwing on parse failure.
    (let [json     (json/encode {:error {:message (apply str (repeat 10000 \x))}})
          upstream (ex-info "clj-http error"
                            {:status  500 :reason-phrase "Internal Server Error"
                             :headers {"content-type" "application/json"}
                             :body    (java.io.ByteArrayInputStream. (.getBytes ^String json))})
          ex       (with-redefs [self.core/max-body-slurp-chars 100]
                     (caught #(self.core/rethrow-api-error!
                               "anthropic"
                               (constantly "Anthropic upstream provider returned an error")
                               upstream)))]
      (is (str/includes? (ex-message ex) "Anthropic upstream provider returned an error"))
      (is (str/includes? (ex-message ex) "{\"error\":{\"message\":\"xxx")
          "the truncated raw string is surfaced in the user-facing message when JSON parse fails")
      (is (string? (:body (ex-data ex)))
          "the bounded raw string is kept on ex-data when JSON parse fails")
      (is (<= (count (:body (ex-data ex))) 100)
          "the body in ex-data respects the slurp cap"))))

(deftest rethrow-api-error!-retry-after-test
  (testing "Retry-After header survives the ex-data allow-list and reaches retry-delay-ms"
    ;; Regression test: an earlier revision allow-listed only :status/:reason-phrase/:body,
    ;; which silently dropped :headers and made provider 429/529 retries fall back to
    ;; exponential backoff instead of honoring the upstream Retry-After.
    (let [upstream (ex-info "clj-http error"
                            {:status 429 :reason-phrase "Too Many Requests"
                             :headers {"retry-after" "3"}
                             :body "rate limited"})
          ex       (caught #(self.core/rethrow-api-error!
                             "openrouter"
                             (constantly "OpenRouter rate limit")
                             upstream))]
      (is (= {"retry-after" "3"} (:headers (ex-data ex))))
      (is (<= 3000 (#'self/retry-delay-ms 1 ex) (+ 3000 750))
          "retry-delay-ms picks up the 3-second Retry-After through the rethrown exception"))))

(deftest rethrow-api-error!-warn-log-test
  (testing "the full upstream body is emitted at warn level alongside provider and status"
    (let [upstream (ex-info "clj-http error"
                            {:status 502 :reason-phrase "Bad Gateway"
                             :headers {"content-type" "text/plain"}
                             :body "upstream gateway timeout"})
          [entry & more]
          (log.capture/with-log-messages-for-level [msgs [metabase.metabot.self.core :warn]]
            (caught #(self.core/rethrow-api-error!
                      "openrouter"
                      (constantly "OpenRouter upstream provider returned an error")
                      upstream))
            (msgs))]
      (is (nil? more) "exactly one warn line at the failure boundary")
      (is (=? {:level :warn :namespace 'metabase.metabot.self.core}
              entry))
      (is (re-find #"provider=openrouter status=502 body=\"upstream gateway timeout\""
                   (:message entry)))))
  (testing "an oversized body is capped in the warn log, but preserved in full on ex-data"
    (let [cap      @#'self.core/max-body-log-chars
          big-body (apply str (repeat (+ cap 1000) \x))
          upstream (ex-info "clj-http error"
                            {:status 502 :reason-phrase "Bad Gateway"
                             :headers {"content-type" "text/plain"}
                             :body big-body})
          [entry & more]
          (log.capture/with-log-messages-for-level [msgs [metabase.metabot.self.core :warn]]
            (let [ex (caught #(self.core/rethrow-api-error!
                               "openrouter"
                               (constantly "OpenRouter upstream provider returned an error")
                               upstream))]
              (is (= big-body (:body (ex-data ex)))
                  "the full, untruncated body still survives on ex-data"))
            (msgs))]
      (is (nil? more) "exactly one warn line at the failure boundary")
      (is (str/ends-with? (:message entry)
                          (str "body=" (subs (pr-str big-body) 0 cap) "…"))
          "the warn line's body segment is capped at max-body-log-chars with a trailing ellipsis")
      (is (not (str/includes? (:message entry) big-body))
          "the full oversized body is not spliced into the warn line"))))

(deftest rethrow-api-error!-auth-status-body-not-leaked-test
  (testing "401/403 bodies are not appended to the user-facing message (may carry sensitive auth/account detail)"
    (doseq [status [401 403]]
      (let [secret   "sk-leaked-key-abc123 for org=acme-corp tenant=42"
            upstream (ex-info "clj-http error"
                              {:status        status
                               :reason-phrase "Unauthorized"
                               :headers       {"content-type" "application/json"}
                               :body          (json/encode {:error {:message secret}})})
            [entry & more]
            (log.capture/with-log-messages-for-level [msgs [metabase.metabot.self.core :warn]]
              (let [ex (caught #(self.core/rethrow-api-error!
                                 "anthropic"
                                 (fn [res] (str "Anthropic API error (HTTP " (:status res) ")"))
                                 upstream))]
                (is (= (str "Anthropic API error (HTTP " status ")") (ex-message ex))
                    "no body preview spliced onto the user-facing message for auth statuses")
                (is (not (str/includes? (ex-message ex) secret))
                    "secret-bearing body must not leak into the rethrown message")
                (is (= {:error {:message secret}} (:body (ex-data ex)))
                    "the full decoded body is still preserved on ex-data for debugging"))
              (msgs))]
        (is (nil? more) "exactly one warn line at the failure boundary")
        (is (str/includes? (:message entry) secret)
            "the full body is still emitted at warn level for server-side debugging")))))
