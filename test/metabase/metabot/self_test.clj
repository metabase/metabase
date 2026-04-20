(ns metabase.metabot.self-test
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [ring.adapter.jetty :as jetty]))

(set! *warn-on-reflection* true)

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
        (mt/with-dynamic-fn-redefs [http/request (fn [opts]
                                                   (when (:body opts)
                                                     (reset! captured (json/decode+kw (:body opts))))
                                                   (throw (ex-info "stop" {::skip true :status 401 :body "skip parsing"})))]
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

  (testing "eagerly forwards :tool-input-start, then collects tool inputs for JSON parsing"
    (let [chunks [{:type :start :messageId "msg-1"}
                  {:type :tool-input-start :toolCallId "call-1" :toolName "search"}
                  {:type :tool-input-delta :toolCallId "call-1" :inputTextDelta "{\"query\":"}
                  {:type :tool-input-delta :toolCallId "call-1" :inputTextDelta "\"test\"}"}
                  {:type :tool-input-available :toolCallId "call-1" :toolName "search"}]]
      (is (= [{:type :start :id "msg-1"}
              {:type :tool-input-start :id "call-1" :function "search"}
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
             (into [] (self.core/lite-aisdk-xf) chunks))))))

;;; parts->aisdk-sse-xf

(defn- sse-event-payloads
  "Drop the `data: ` prefix and the trailing `\\n`, then JSON-decode each SSE
  line into a map. Skips the `[DONE]` terminator. Used to make assertions
  against `parts->aisdk-sse-xf` output cleaner."
  [lines]
  (->> lines
       (remove #(= "data: [DONE]\n" %))
       (map (fn [^String s]
              ;; lines look like: "data: {...}\n"
              (json/decode+kw (subs s 6 (dec (count s))))))))

(deftest ^:parallel parts->aisdk-sse-xf-usage-single-model-test
  (testing "single :usage part is carried out on the terminal finish event only"
    (let [parts  [{:type :start :id "msg-1"}
                  {:type :text :id "t1" :text "hi"}
                  {:type :usage :model "model-a"
                   :usage {:promptTokens 10 :completionTokens 20}}]
          events (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          finish (->> events (filter #(= "finish" (:type %))) first)]
      (testing "no mid-stream message-metadata events are emitted"
        (is (empty? (filter #(= "message-metadata" (:type %)) events))))
      (testing "terminal finish carries the v6-shaped messageMetadata"
        (is (some? (:messageMetadata finish)))
        (is (= {:inputTokens 10 :outputTokens 20 :totalTokens 30}
               (-> finish :messageMetadata :usage)))
        (is (= {:model-a {:inputTokens 10 :outputTokens 20 :totalTokens 30}}
               (-> finish :messageMetadata :usageByModel)))
        (is (= (+ (-> finish :messageMetadata :usage :inputTokens)
                  (-> finish :messageMetadata :usage :outputTokens))
               (-> finish :messageMetadata :usage :totalTokens)))))))

(deftest ^:parallel parts->aisdk-sse-xf-usage-cumulative-same-model-test
  (testing "cumulative :usage parts for the same model — finish reflects the latest, not a sum"
    ;; The agent loop emits cumulative-per-model snapshots (see
    ;; metabase.metabot.agent.core/accumulate-usage-xf), so the transducer
    ;; should `assoc` the latest value, not add.
    (let [parts  [{:type :start :id "msg-1"}
                  {:type :usage :model "model-a"
                   :usage {:promptTokens 10 :completionTokens 20}}
                  {:type :usage :model "model-a"
                   :usage {:promptTokens 35 :completionTokens 60}}]
          events (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          finish (->> events (filter #(= "finish" (:type %))) first)]
      (is (= {:inputTokens 35 :outputTokens 60 :totalTokens 95}
             (-> finish :messageMetadata :usage))))))

(deftest ^:parallel parts->aisdk-sse-xf-usage-multi-model-test
  (testing "two :usage parts for different models — usageByModel has both, flat usage is the sum"
    (let [parts  [{:type :start :id "msg-1"}
                  {:type :usage :model "model-a"
                   :usage {:promptTokens 100 :completionTokens 50}}
                  {:type :usage :model "model-b"
                   :usage {:promptTokens 200 :completionTokens 75}}]
          events (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          finish (->> events (filter #(= "finish" (:type %))) first)
          meta   (:messageMetadata finish)]
      (is (= {:inputTokens 300 :outputTokens 125 :totalTokens 425}
             (:usage meta)))
      (is (= {:model-a {:inputTokens 100 :outputTokens 50 :totalTokens 150}
              :model-b {:inputTokens 200 :outputTokens 75 :totalTokens 275}}
             (:usageByModel meta))))))

(deftest ^:parallel parts->aisdk-sse-xf-no-usage-test
  (testing "zero :usage parts — no messageMetadata key on finish"
    (let [parts  [{:type :start :id "msg-1"}
                  {:type :text :id "t1" :text "hi"}]
          events (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          finish (->> events (filter #(= "finish" (:type %))) first)]
      (is (empty? (filter #(= "message-metadata" (:type %)) events)))
      (testing "messageMetadata key is absent from finish (not nil, not {})"
        (is (some? finish))
        (is (not (contains? finish :messageMetadata)))))))

(deftest ^:parallel parts->aisdk-sse-xf-text-coalesces-same-id-test
  (testing "consecutive :text parts sharing the same id collapse into one text block"
    ;; The upstream provider streams a single logical text block as multiple
    ;; :text parts that share the same :id. The Vercel AI SDK v6 stream
    ;; protocol expects one text-start, many text-deltas, one text-end per
    ;; logical block — NOT a fresh start/end triple per delta with the id
    ;; reopened. This test caught a bug where every :text part was wrapped
    ;; in its own start/end triple.
    (let [parts       [{:type :start :id "msg-1"}
                       {:type :text :id "t1" :text "Hi"}
                       {:type :text :id "t1" :text " Sloan!"}
                       {:type :text :id "t1" :text " 👋"}]
          events      (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          text-events (filter #(#{"text-start" "text-delta" "text-end"} (:type %)) events)]
      (is (= [{:type "text-start" :id "t1"}
              {:type "text-delta" :id "t1" :delta "Hi"}
              {:type "text-delta" :id "t1" :delta " Sloan!"}
              {:type "text-delta" :id "t1" :delta " 👋"}
              {:type "text-end" :id "t1"}]
             text-events)))))

(deftest ^:parallel parts->aisdk-sse-xf-text-different-ids-separate-blocks-test
  (testing "consecutive :text parts with different ids produce separate blocks"
    (let [parts       [{:type :start :id "msg-1"}
                       {:type :text :id "t1" :text "first"}
                       {:type :text :id "t2" :text "second"}]
          events      (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          text-events (filter #(#{"text-start" "text-delta" "text-end"} (:type %)) events)]
      (is (= [{:type "text-start" :id "t1"}
              {:type "text-delta" :id "t1" :delta "first"}
              {:type "text-end" :id "t1"}
              {:type "text-start" :id "t2"}
              {:type "text-delta" :id "t2" :delta "second"}
              {:type "text-end" :id "t2"}]
             text-events)))))

(deftest ^:parallel parts->aisdk-sse-xf-text-closed-by-non-text-event-test
  (testing "an intervening non-text part closes the current text block before its own events"
    (let [parts  [{:type :start :id "msg-1"}
                  {:type :text :id "t1" :text "before tool"}
                  {:type :tool-input-start :id "call-1" :function "search"}
                  {:type :tool-input :id "call-1" :function "search" :arguments {:q "x"}}
                  {:type :text :id "t1" :text "after tool"}]
          events (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          types  (mapv :type events)]
      (is (= ["start"
              "start-step"
              "text-start"
              "text-delta"
              "text-end"
              "tool-input-start"
              "tool-input-available"
              "text-start"
              "text-delta"
              "text-end"
              "finish-step"
              "finish"]
             types)))))

(deftest ^:parallel parts->aisdk-sse-xf-text-closed-by-completion-test
  (testing "completion arity closes any open text block before finish-step"
    (let [parts  [{:type :start :id "msg-1"}
                  {:type :text :id "t1" :text "trailing"}]
          events (sse-event-payloads (into [] (self.core/parts->aisdk-sse-xf) parts))
          types  (mapv :type events)]
      (is (= ["start"
              "start-step"
              "text-start"
              "text-delta"
              "text-end"
              "finish-step"
              "finish"]
             types)))))

(deftest ^:parallel parts->aisdk-sse-xf-tee-composition-test
  (testing "composing with tee-xf upstream still passes raw :usage parts to the tee"
    ;; This safeguards the api.clj store-agent-response! → extract-usage → DB path,
    ;; which depends on raw :usage parts landing in parts-atom unchanged.
    (let [parts-atom (atom [])
          parts      [{:type :start :id "msg-1"}
                      {:type :text :id "t1" :text "hi"}
                      {:type :usage :model "model-a"
                       :usage {:promptTokens 10 :completionTokens 20}}]
          xf         (comp (u/tee-xf parts-atom) (self.core/parts->aisdk-sse-xf))
          _          (into [] xf parts)]
      (is (= parts @parts-atom)
          ":usage parts must reach the tee'd atom unchanged"))))

;;; tool executor

(deftest ^:parallel tool-executor-xf-test
  (testing "tool-executor-xf passes through all chunks unchanged"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-123"}
                   {:type :text :id "text-1" :text "Hello world"}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (= chunks result)
          "Non-tool chunks should pass through unchanged")))

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
                tool-result)))))

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
               (set (map :toolCallId tool-results)))))))

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
             (last (into [] (self.core/aisdk-xf) result))))))

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
              (last result)))))

  (testing "tool-executor-xf handles nil arguments for no-arg tools"
    (let [chunks (test-util/parts->aisdk-chunks
                  [{:type :start :id "msg-nil"}
                   {:type :tool-input :id "call-nil" :function "no-arg" :arguments nil}])
          result (into [] (self.core/tool-executor-xf test-util/TOOLS) chunks)]
      (is (=? {:type       :tool-output-available
               :toolCallId "call-nil"
               :toolName   "no-arg"
               :result     {:output "ok"}}
              (last result)))))

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

;;; ===================== AI SDK SSE Protocol Tests =====================

(defn- parse-sse-event
  "Parse an SSE event string of the form `data: <json>\\n` back into a map.
  Returns `:done` for the terminal `data: [DONE]\\n` line."
  [s]
  (when (string? s)
    (let [trimmed (str/replace s #"\n$" "")]
      (cond
        (= trimmed "data: [DONE]") :done
        (str/starts-with? trimmed "data: ") (json/decode+kw (subs trimmed 6))))))

(deftest format-sse-event-test
  (testing "wraps payload as `data: <json>\\n`"
    (let [line (self.core/format-sse-event {:type "text-delta" :id "t1" :delta "Hi"})]
      (is (str/starts-with? line "data: "))
      (is (str/ends-with? line "\n"))
      (is (= {:type "text-delta" :id "t1" :delta "Hi"}
             (json/decode+kw (subs (str/replace line #"\n$" "") 6)))))))

(defn- run-sse-xf
  "Run `parts->aisdk-sse-xf` over `parts` and return the parsed SSE events."
  [parts]
  (mapv parse-sse-event (into [] (self.core/parts->aisdk-sse-xf) parts)))

(deftest parts->aisdk-sse-xf-start-test
  (testing "first :start emits start + start-step, completion adds finish-step + finish + [DONE]"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}])]
      (is (= 5 (count events)))
      (is (=? [{:type "start" :messageId "msg-1"}
               {:type "start-step"}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events)))))

(deftest parts->aisdk-sse-xf-subsequent-start-test
  (testing "subsequent :start parts emit finish-step + start-step boundaries"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :start :id "msg-2"}])]
      ;; first start: start + start-step
      ;; second start: finish-step + start-step
      ;; completion: finish-step + finish + [DONE]
      (is (=? [{:type "start" :messageId "msg-1"}
               {:type "start-step"}
               {:type "finish-step"}
               {:type "start-step"}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events)))))

(deftest parts->aisdk-sse-xf-text-test
  (testing "single :text emits text-start + text-delta and the open block is closed by completion (text-end)"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :text :id "t1" :text "Hello"}])]
      (is (=? [{:type "start" :messageId "msg-1"}
               {:type "start-step"}
               {:type "text-start" :id "t1"}
               {:type "text-delta" :id "t1" :delta "Hello"}
               {:type "text-end" :id "t1"}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events))))

  (testing "consecutive :text parts with the same id are coalesced into one block"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :text :id "t1" :text "Hello "}
                              {:type :text :id "t1" :text "world"}
                              {:type :text :id "t1" :text "!"}])]
      ;; one text-start, three text-deltas, one text-end (emitted at completion)
      (is (=? [{:type "start"}
               {:type "start-step"}
               {:type "text-start" :id "t1"}
               {:type "text-delta" :id "t1" :delta "Hello "}
               {:type "text-delta" :id "t1" :delta "world"}
               {:type "text-delta" :id "t1" :delta "!"}
               {:type "text-end" :id "t1"}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events))))

  (testing "switching :text id closes the prior block and opens a new one"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :text :id "t1" :text "first"}
                              {:type :text :id "t2" :text "second"}])]
      (is (=? [{:type "start"}
               {:type "start-step"}
               {:type "text-start" :id "t1"}
               {:type "text-delta" :id "t1" :delta "first"}
               {:type "text-end" :id "t1"}
               {:type "text-start" :id "t2"}
               {:type "text-delta" :id "t2" :delta "second"}
               {:type "text-end" :id "t2"}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events))))

  (testing ":text with no :id auto-generates an id used for all events in the block"
    (let [events    (run-sse-xf [{:type :start :id "msg-1"}
                                 {:type :text :text "x"}])
          text-evts (filter #(and (map? %) (str/starts-with? (:type %) "text-")) events)]
      (is (= 3 (count text-evts)))
      (is (= #{"text-start" "text-delta" "text-end"} (set (map :type text-evts))))
      (is (some? (:id (first text-evts))))
      (is (apply = (map :id text-evts))))))

(deftest parts->aisdk-sse-xf-tool-input-test
  (testing ":tool-input-start emits an eager tool-input-start SSE event"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :tool-input-start :id "call-1" :function "search"}])]
      (is (=? [{:type "start"}
               {:type "start-step"}
               {:type "tool-input-start" :toolCallId "call-1" :toolName "search"}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events))))

  (testing ":tool-input (finalized) emits tool-input-available with the parsed arguments"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type      :tool-input
                               :id        "call-1"
                               :function  "search"
                               :arguments {:q "revenue"}}])]
      (is (=? [{:type "start"}
               {:type "start-step"}
               {:type "tool-input-available" :toolCallId "call-1" :toolName "search" :input {:q "revenue"}}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events))))

  (testing "the full pair: :tool-input-start then :tool-input produce start + available in order"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :tool-input-start :id "call-1" :function "search"}
                              {:type      :tool-input
                               :id        "call-1"
                               :function  "search"
                               :arguments {:q "revenue"}}])]
      (is (=? [{:type "start"}
               {:type "start-step"}
               {:type "tool-input-start" :toolCallId "call-1" :toolName "search"}
               {:type "tool-input-available" :toolCallId "call-1" :toolName "search" :input {:q "revenue"}}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events)))))

(deftest parts->aisdk-sse-xf-tool-output-test
  (testing ":tool-output success emits tool-output-available with the result"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type     :tool-output
                               :id       "call-1"
                               :function "search"
                               :result   {:data [{:id 1}]}}])]
      (is (=? {:type       "tool-output-available"
               :toolCallId "call-1"
               :output     {:data [{:id 1}]}}
              (nth events 2)))))

  (testing ":tool-output with :result nil emits output: null"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type     :tool-output
                               :id       "call-nil"
                               :function "side-effect"
                               :result   nil}])
          event  (nth events 2)]
      (is (= "tool-output-available" (:type event)))
      (is (= "call-nil" (:toolCallId event)))
      (is (contains? event :output))
      (is (nil? (:output event)))))

  (testing ":tool-output with :error emits tool-output-error carrying the message as errorText"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type     :tool-output
                               :id       "call-2"
                               :function "search"
                               :error    {:message "boom" :type "class java.lang.Exception"}}])
          event  (nth events 2)]
      (is (=? {:type       "tool-output-error"
               :toolCallId "call-2"
               :errorText  "boom"}
              event))
      (testing "omits :toolName, :output, and :error"
        (is (not (contains? event :toolName)))
        (is (not (contains? event :output)))
        (is (not (contains? event :error))))))

  (testing ":tool-output with a non-map :error stringifies it into errorText"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type     :tool-output
                               :id       "call-3"
                               :function "search"
                               :error    "raw error"}])]
      (is (=? {:type       "tool-output-error"
               :toolCallId "call-3"
               :errorText  "raw error"}
              (nth events 2))))))

(deftest parts->aisdk-sse-xf-data-test
  (testing ":data with custom :data-type emits data-<type>"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :data :data-type "state" :id "d1" :data {:queries {}}}])]
      (is (=? {:type "data-state" :id "d1" :data {:queries {}}}
              (nth events 2)))))

  (testing ":data without :data-type defaults to data-data"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :data :id "d2" :data {:foo 1}}])]
      (is (= "data-data" (:type (nth events 2)))))))

(deftest parts->aisdk-sse-xf-error-test
  (testing ":error with map :error extracts :message into errorText"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :error :error {:message "Something went wrong"}}])]
      (is (=? {:type "error" :errorText "Something went wrong"}
              (nth events 2)))))

  (testing ":error with string :error stringifies it into errorText"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :error :error "boom"}])]
      (is (=? {:type "error" :errorText "boom"}
              (nth events 2))))))

(deftest ^:parallel parts->aisdk-sse-xf-finish-reason-test
  (let [finish-of (fn [parts]
                    (->> (run-sse-xf parts)
                         (filter #(and (map? %) (= "finish" (:type %))))
                         first))]
    (testing "default finishReason is \"stop\""
      (is (= "stop" (:finishReason (finish-of [{:type :start :id "m"} {:type :text :id "t" :text "hi"}])))))
    (testing "finishReason is \"error\" when an :error part was emitted"
      (is (= "error" (:finishReason (finish-of [{:type :start :id "m"} {:type :error :error {:message "boom"}}])))))))

(deftest parts->aisdk-sse-xf-usage-metadata-test
  (testing ":usage parts are accumulated per model and surfaced as messageMetadata on the terminal finish"
    (let [events       (run-sse-xf [{:type :start :id "msg-1"}
                                    {:type  :usage
                                     :model "claude-sonnet"
                                     :usage {:promptTokens 10 :completionTokens 5}}
                                    ;; The latest snapshot per model wins
                                    ;; (cumulative-per-model semantics — see
                                    ;; accumulate-usage-xf in metabot.agent.core).
                                    {:type  :usage
                                     :model "claude-sonnet"
                                     :usage {:promptTokens 20 :completionTokens 7}}])
          finish-event (first (filter #(and (map? %) (= "finish" (:type %))) events))]
      (is (=? {:type "finish"
               :messageMetadata
               {:usage        {:inputTokens  20
                               :outputTokens 7
                               :totalTokens  27}
                :usageByModel {:claude-sonnet
                               {:inputTokens 20 :outputTokens 7 :totalTokens 27}}}}
              finish-event)))))

(deftest parts->aisdk-sse-xf-completion-without-start-test
  (testing "completion without any :start still emits finish + [DONE] but no finish-step"
    (let [events (run-sse-xf [])]
      (is (=? [{:type "finish"} :done] events)))))

(deftest parts->aisdk-sse-xf-full-conversation-test
  (testing "realistic sequence: start, text, tool-input-start, tool-input, tool-output, text"
    (let [events (run-sse-xf [{:type :start :id "msg-1"}
                              {:type :text :id "t1" :text "Looking that up..."}
                              {:type :tool-input-start :id "call-1" :function "search"}
                              {:type      :tool-input
                               :id        "call-1"
                               :function  "search"
                               :arguments {:q "Q1"}}
                              {:type     :tool-output
                               :id       "call-1"
                               :function "search"
                               :result   {:hits 3}}
                              {:type :text :id "t2" :text "Found 3 results."}])]
      ;; The t1 text block is implicitly closed by the next non-text part
      ;; (the :tool-input-start). The t2 text block is closed by the completion arity.
      (is (=? [{:type "start" :messageId "msg-1"}
               {:type "start-step"}
               {:type "text-start" :id "t1"}
               {:type "text-delta" :id "t1" :delta "Looking that up..."}
               {:type "text-end" :id "t1"}
               {:type "tool-input-start" :toolCallId "call-1" :toolName "search"}
               {:type "tool-input-available" :toolCallId "call-1" :toolName "search" :input {:q "Q1"}}
               {:type "tool-output-available" :toolCallId "call-1" :output {:hits 3}}
               {:type "text-start" :id "t2"}
               {:type "text-delta" :id "t2" :delta "Found 3 results."}
               {:type "text-end" :id "t2"}
               {:type "finish-step"}
               {:type "finish"}
               :done]
              events)))))

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

(deftest with-retries-test
  (with-redefs [self/retry-delay-ms (constantly 0)]
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

;;; ===================== Prometheus Metrics Tests =====================

(deftest call-llm-prometheus-test
  (mt/with-prometheus-system! [_ system]
    (with-redefs [self/retry-delay-ms (constantly 0)]
      (let [labels {:model "openrouter/test-model" :source "agent"}]
        (testing "increments llm-requests and observes duration on success"
          (with-redefs [openrouter/openrouter (constantly (test-util/mock-llm-response [{:type :start :id "m1"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "agent"})))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))

        ;; mt/with-prometheus-system! is slow, so clear! metrics between tests rather than creating a fresh system
        (prometheus/clear! :metabase-metabot/llm-requests)
        (prometheus/clear! :metabase-metabot/llm-duration-ms)

        (testing "increments llm-retries on transient failures, no errors on eventual success"
          (let [calls (atom 0)]
            (mt/with-log-level [metabase.metabot.self :fatal]
              (with-redefs [openrouter/openrouter
                            (fn [_opts]
                              (reify clojure.lang.IReduceInit
                                (reduce [_ rf init]
                                  (if (< (swap! calls inc) 3)
                                    (throw (ex-info "rate limited" {:status 429}))
                                    (reduce rf init (test-util/mock-llm-response [{:type :start :id "m1"}]))))))]
                (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "agent"}))))
            (is (== 3 (mt/metric-value system :metabase-metabot/llm-requests labels)))
            (is (== 2 (mt/metric-value system :metabase-metabot/llm-retries labels)))
            (is (== 0 (mt/metric-value system :metabase-metabot/llm-errors
                                       (assoc labels :error-type "ExceptionInfo"))))
            (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels))))))

        (prometheus/clear! :metabase-metabot/llm-requests)
        (prometheus/clear! :metabase-metabot/llm-retries)
        (prometheus/clear! :metabase-metabot/llm-duration-ms)

        (testing "increments llm-errors on non-retryable failure, no retries"
          (with-redefs [openrouter/openrouter
                        (fn [_opts]
                          (reify clojure.lang.IReduceInit
                            (reduce [_ _rf _init]
                              (throw (ex-info "unauthorized" {:status 401})))))]
            (is (thrown? Exception (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "agent"})))))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))

        (prometheus/clear! :metabase-metabot/llm-requests)
        (prometheus/clear! :metabase-metabot/llm-errors)
        (prometheus/clear! :metabase-metabot/llm-duration-ms)

        (testing "increments llm-errors with :error-type llm-sse-error on inline SSE errors"
          (with-redefs [openrouter/openrouter
                        (constantly (test-util/mock-llm-response [{:type :error :errorText "content policy violation"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "agent"})))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "llm-sse-error")))))

        (testing "reports token usage metrics on :usage parts"
          (with-redefs [openrouter/openrouter
                        (constantly (test-util/mock-llm-response
                                     [{:type  :start
                                       :id    "m1"}
                                      {:type  :usage
                                       :usage {:promptTokens 100 :completionTokens 25}
                                       :model "test-model"}]))]
            (run! identity (self/call-llm "openrouter/test-model" nil [] {} {:tag "agent"})))
          (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
          (is (==  25 (mt/metric-value system :metabase-metabot/llm-output-tokens labels)))
          (is (== 125 (:sum (mt/metric-value system :metabase-metabot/llm-tokens-per-call labels)))))))))

(deftest call-llm-structured-prometheus-test
  (mt/with-prometheus-system! [_ system]
    (with-redefs [self/retry-delay-ms (constantly 0)]
      (let [labels        {:model "openrouter/test-model" :source "agent"}
            success-mock  (test-util/mock-llm-response
                           [{:type :start :id "m1"}
                            {:type :tool-input :id "call-1" :function "json"
                             :arguments {:answer "42"}}])
            call-structured! #(self/call-llm-structured
                               "openrouter/test-model"
                               [{:role "user" :content "test"}]
                               {:type "object" :properties {:answer {:type "string"}}}
                               0.3 1024 {:tag "agent"})]
        (testing "increments llm-requests and observes duration on success"
          (with-redefs [openrouter/openrouter (constantly success-mock)]
            (call-structured!))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))

        (prometheus/clear! :metabase-metabot/llm-requests)
        (prometheus/clear! :metabase-metabot/llm-duration-ms)

        (testing "increments llm-retries on transient failures, no errors on eventual success"
          (let [calls (atom 0)]
            (mt/with-log-level [metabase.metabot.self :fatal]
              (with-redefs [openrouter/openrouter
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

        (prometheus/clear! :metabase-metabot/llm-requests)
        (prometheus/clear! :metabase-metabot/llm-retries)
        (prometheus/clear! :metabase-metabot/llm-duration-ms)

        (testing "increments llm-errors on non-retryable failure, no retries"
          (with-redefs [openrouter/openrouter
                        (fn [_opts] (throw (ex-info "unauthorized" {:status 401})))]
            (is (thrown? Exception (call-structured!))))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 0 (mt/metric-value system :metabase-metabot/llm-retries labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "ExceptionInfo"))))
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/llm-duration-ms labels)))))

        (prometheus/clear! :metabase-metabot/llm-requests)
        (prometheus/clear! :metabase-metabot/llm-errors)
        (prometheus/clear! :metabase-metabot/llm-duration-ms)

        (testing "increments llm-errors with :error-type llm-sse-error on inline SSE errors"
          (with-redefs [openrouter/openrouter
                        (constantly (test-util/mock-llm-response
                                     [{:type :error :errorText "content policy violation"}]))]
            (is (thrown? Exception (call-structured!))))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-requests labels)))
          (is (== 1 (mt/metric-value system :metabase-metabot/llm-errors
                                     (assoc labels :error-type "llm-sse-error")))))

        (testing "reports token usage metrics on :usage parts"
          (with-redefs [openrouter/openrouter
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
   :source     "test-source"
   :tag        "test-tag"})

(deftest call-llm-snowplow-test
  (testing "fires :snowplow/token_usage and :snowplow/ai_service_event for call-llm with a tool call"
    (let [rasta-id (mt/user->id :rasta)]
      (with-redefs [openrouter/openrouter
                    (constantly (test-util/mock-llm-response
                                 [{:type :start :id "msg-1"}
                                  {:type :tool-input :id "call-1" :function "get-time"
                                   :arguments {:tz "UTC"}}
                                  {:type :usage :usage {:promptTokens 100 :completionTokens 20}
                                   :model "test-model" :id "msg-1"}]))]
        (mt/with-current-user rasta-id
          (snowplow-test/with-fake-snowplow-collector
            (run! identity (self/call-llm "openrouter/test-model" nil [] test-util/TOOLS snowplow-tracking-opts))
            (let [events       (snowplow-test/pop-event-data-and-user-id!)
                  token-events (filter #(contains? (:data %) "total_tokens") events)
                  tool-events  (filter #(= "agent_used_tool" (get-in % [:data "event"])) events)]
              (is (=? [{:user-id (str rasta-id)
                        :data    {"model_id"            "openrouter/test-model"
                                  "total_tokens"         120
                                  "prompt_tokens"        100
                                  "completion_tokens"    20
                                  "estimated_costs_usd"  0.0
                                  "duration_ms"          nat-int?
                                  "source"               "test-source"
                                  "tag"                  "test-tag"
                                  "session_id"           "00000000-0000-0000-0000-000000000002"}}]
                      token-events))
              (is (=? [{:user-id (str rasta-id)
                        :data    {"event"         "agent_used_tool"
                                  "source"        "test-source"
                                  "result"        "success"
                                  "duration_ms"   nat-int?
                                  "session_id"    "00000000-0000-0000-0000-000000000002"
                                  "event_details" {"tool_name" "get-time"}}}]
                      tool-events)))))))))

(deftest call-llm-structured-snowplow-test
  (testing "fires :snowplow/token_usage event for call-llm-structured"
    (let [rasta-id (mt/user->id :rasta)]
      (with-redefs [openrouter/openrouter
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
                                  "source"               "test-source"
                                  "tag"                  "test-tag"
                                  "session_id"           "00000000-0000-0000-0000-000000000002"}}]
                      token-events)))))))))
