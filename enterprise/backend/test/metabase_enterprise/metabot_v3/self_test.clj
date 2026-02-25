(ns metabase-enterprise.metabot-v3.self-test
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase-enterprise.metabot-v3.self.core :as self.core]
   [metabase-enterprise.metabot-v3.self.openrouter :as openrouter]
   [metabase-enterprise.metabot-v3.test-util :as test-util]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [ring.adapter.jetty :as jetty]))

(set! *warn-on-reflection* true)

;;; provider resolution tests

(deftest ^:parallel parse-provider-model-test
  (testing "parses provider/model format correctly"
    (is (=? {:provider "anthropic" :model "claude-haiku-4-5"}
            (#'self/parse-provider-model "anthropic/claude-haiku-4-5")))
    (is (=? {:provider "openai" :model "gpt-4.1-mini"}
            (#'self/parse-provider-model "openai/gpt-4.1-mini")))
    (is (=? {:provider "openrouter" :model "anthropic/claude-haiku-4-5"}
            (#'self/parse-provider-model "openrouter/anthropic/claude-haiku-4-5")))
    (is (=? {:provider "openrouter" :model "google/gemini-2.5-flash"}
            (#'self/parse-provider-model "openrouter/google/gemini-2.5-flash"))))
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
    (let [chunks [{:type       :tool-output-available
                   :toolCallId "call-1"
                   :toolName   "search"
                   :result     {:data []}}]]
      (is (= [{:type     :tool-output
               :id       "call-1"
               :function "search"
               :result   {:data []}
               :error    nil}]
             (into [] (self.core/lite-aisdk-xf) chunks))))))

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
      (let [tool-result (last result)]
        (is (=? {:type       :tool-output-available
                 :toolCallId "call-err"
                 :toolName   "get-time"
                 :error      {:message string?
                              :type    string?}}
                tool-result)))))

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
  (testing "tool with :decode metadata on a fn has decode applied before invocation"
    (let [received (atom nil)
          decode-fn (fn [args]
                      (update args :x inc))
          ;; with-meta on a fn attaches metadata; tool-decode-fn reads it via (meta tool)
          tool-fn (with-meta
                   (fn [args]
                     (reset! received args)
                     {:output "ok"})
                   {:name   'decode-inc
                    :decode decode-fn
                    :schema [:=> [:cat [:map [:x :int]]] :any]
                    :doc    "increment x"})
          tools {"decode-inc" tool-fn}
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

;;; AI SDK v4 Line Protocol tests

(deftest format-text-line-test
  (testing "formats text as JSON-encoded string with 0: prefix"
    (is (= "0:\"Hello world\"" (self.core/format-text-line {:text "Hello world"})))
    (is (= "0:\"Line with \\\"quotes\\\"\"" (self.core/format-text-line {:text "Line with \"quotes\""})))))

(deftest format-data-line-test
  (testing "formats data with type, version, and value"
    (is (= "2:{\"type\":\"state\",\"version\":1,\"value\":{\"queries\":{}}}"
           (self.core/format-data-line {:data-type "state" :data {:queries {}}})))
    (is (= "2:{\"type\":\"navigate_to\",\"version\":1,\"value\":{\"url\":\"/question/123\"}}"
           (self.core/format-data-line {:data-type "navigate_to" :data {:url "/question/123"}})))))

(deftest format-error-line-test
  (testing "formats error message as JSON string with 3: prefix"
    (is (= "3:\"Something went wrong\"" (self.core/format-error-line {:error {:message "Something went wrong"}})))
    (is (= "3:\"Unknown error\"" (self.core/format-error-line {:error "Unknown error"})))))

(deftest format-tool-call-line-test
  (testing "formats tool call with toolCallId, toolName, and args"
    (let [line (self.core/format-tool-call-line {:id "call-123"
                                                 :function "search"
                                                 :arguments {:query "revenue"}})]
      (is (str/starts-with? line "9:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "call-123" (:toolCallId parsed)))
        (is (= "search" (:toolName parsed)))
        ;; args should be JSON string, not object
        (is (string? (:args parsed)))))))

(deftest format-tool-result-line-test
  (testing "formats tool result with toolCallId and result"
    (let [line (self.core/format-tool-result-line {:id "call-123"
                                                   :result {:data [{:id 1}]}})]
      (is (str/starts-with? line "a:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "call-123" (:toolCallId parsed)))
        ;; result should be JSON string
        (is (string? (:result parsed))))))

  (testing "formats tool error"
    (let [line (self.core/format-tool-result-line {:id "call-456"
                                                   :error {:message "Tool failed"}})]
      (is (str/starts-with? line "a:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "call-456" (:toolCallId parsed)))
        (is (string? (:error parsed)))))))

(deftest format-finish-line-test
  (testing "formats finish message with usage"
    (let [line (self.core/format-finish-line false {"claude-sonnet-4-5-20250929" {:prompt 100 :completion 50}})]
      (is (str/starts-with? line "d:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "stop" (:finishReason parsed)))
        ;; Keys are keywordized when parsing JSON
        (is (= 100 (get-in parsed [:usage :claude-sonnet-4-5-20250929 :prompt])))))))

(deftest format-start-line-test
  (testing "formats start message with messageId"
    (let [line (self.core/format-start-line {:id "msg-123"})]
      (is (str/starts-with? line "f:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "msg-123" (:messageId parsed)))))))

(deftest aisdk-line-xf-test
  (testing "converts internal parts to AI SDK v4 line protocol, skipping usage by default"
    (let [parts [{:type :start :id "msg-1"}
                 {:type :text :text "Hello"}
                 {:type :tool-input :id "call-1" :function "search" :arguments {:q "test"}}
                 {:type :tool-output :id "call-1" :result {:data []}}
                 {:type :usage :id "msg-1" :model "claude-sonnet-4-5-20250929" :usage {:promptTokens 10 :completionTokens 5}}
                 {:type :finish}]
          lines (into [] (self.core/aisdk-line-xf) parts)]
      ;; Should have: start, text, tool-call, tool-result, finish (usage skipped)
      (is (= 5 (count lines)))
      (is (str/starts-with? (nth lines 0) "f:"))  ;; start
      (is (str/starts-with? (nth lines 1) "0:"))  ;; text
      (is (str/starts-with? (nth lines 2) "9:"))  ;; tool-call
      (is (str/starts-with? (nth lines 3) "a:"))  ;; tool-result
      (is (str/starts-with? (nth lines 4) "d:")))) ;; finish

  (testing "emits usage as data line when :emit-usage? is true"
    (let [parts [{:type :start :id "msg-1"}
                 {:type :text :text "Hello"}
                 {:type  :usage :id "msg-1" :model "claude-sonnet-4-5-20250929"
                  :usage {:promptTokens 10 :completionTokens 5}}]
          lines (into [] (self.core/aisdk-line-xf {:emit-usage? true}) parts)]
      (is (=? [#"f:.*"
               #"0:.*"
               #"d:.*"]
              lines))
      (is (=? {:usage {:promptTokens 10 :completionTokens 5}}
              (-> (last lines) (subs 2) (json/decode+kw)))))))

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
                    "test-model"
                    "agent"
                    (fn [] (swap! calls inc) :ok))))
        (is (= 1 @calls))))
    (testing "retries on retryable error and succeeds"
      (let [calls (atom 0)]
        (is (= :ok (mt/with-log-level [metabase-enterprise.metabot-v3.self :fatal]
                     (#'self/with-retries
                      "test-model"
                      "agent"
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
              "test-model"
              "agent"
              (fn []
                (swap! calls inc)
                (throw (ex-info "unauthorized" {:status 401}))))))
        (is (= 1 @calls))))
    (testing "gives up after max retries and throws last error"
      (let [calls (atom 0)]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"overloaded"
             (mt/with-log-level [metabase-enterprise.metabot-v3.self :fatal]
               (#'self/with-retries
                "test-model"
                "agent"
                (fn []
                  (swap! calls inc)
                  (throw (ex-info "overloaded" {:status 529})))))))
        (is (= 3 @calls))))
    (testing "retries on connection errors"
      (let [calls (atom 0)]
        (is (= :ok (mt/with-log-level [metabase-enterprise.metabot-v3.self :fatal]
                     (#'self/with-retries
                      "test-model"
                      "agent"
                      (fn []
                        (when (< (swap! calls inc) 2)
                          (throw (java.net.ConnectException. "refused")))
                        :ok)))))
        (is (= 2 @calls))))))

;;; ===================== Prometheus Metrics Tests =====================

(deftest call-llm-prometheus-test
  (mt/with-prometheus-system! [_ system]
    (with-redefs [self/retry-delay-ms (constantly 0)]
      (let [labels {:model "test-model" :source "agent"}]
        (testing "increments llm-requests and observes duration on success"
          (with-redefs [openrouter/openrouter (constantly (test-util/mock-llm-response [{:type :start :id "m1"}]))]
            (run! identity (self/call-llm "openrouter/test-model" "agent" nil [] {})))
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
            (mt/with-log-level [metabase-enterprise.metabot-v3.self :fatal]
              (with-redefs [openrouter/openrouter
                            (fn [_opts]
                              (reify clojure.lang.IReduceInit
                                (reduce [_ rf init]
                                  (if (< (swap! calls inc) 3)
                                    (throw (ex-info "rate limited" {:status 429}))
                                    (reduce rf init (test-util/mock-llm-response [{:type :start :id "m1"}]))))))]
                (run! identity (self/call-llm "openrouter/test-model" "agent" nil [] {}))))
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
            (is (thrown? Exception (run! identity (self/call-llm "openrouter/test-model" "agent" nil [] {})))))
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
            (run! identity (self/call-llm "openrouter/test-model" "agent" nil [] {})))
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
            (run! identity (self/call-llm "openrouter/test-model" "agent" nil [] {})))
          (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
          (is (==  25 (mt/metric-value system :metabase-metabot/llm-output-tokens labels)))
          (is (== 125 (:sum (mt/metric-value system :metabase-metabot/llm-tokens-per-call labels)))))))))
