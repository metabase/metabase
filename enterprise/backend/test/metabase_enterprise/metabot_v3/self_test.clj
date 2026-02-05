(ns metabase-enterprise.metabot-v3.self-test
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [ring.adapter.jetty :as jetty]))

(set! *warn-on-reflection* true)

(defn json-resource [fname]
  (-> (io/resource fname)
      slurp
      json/decode+kw))

(defn make-sse ^String [v]
  (->> (map json/encode v)
       (map #(str "data: " % "\n\n"))
       (str/join)))

(defn parts->aisdk [parts]
  (mapcat
   (fn [{:keys [id] :as part}]
     (case (:type part)
       :start [{:type :start :messageId id}]
       :usage [part]
       :text  (concat
               [{:type :text-start :id id}]
               (for [bit (partition-all 5 (:text part))]
                 {:type :text-delta :id id :delta (str/join bit)})
               [{:type :text-end :id id}])
       :tool-input (concat
                    [{:type :tool-input-start :toolName (:function part) :toolCallId id}]
                    (for [bit (partition-all 5 (json/encode (:arguments part)))]
                      {:type :tool-input-delta :toolCallId id :inputTextDelta (str/join bit)})
                    [{:type :tool-input-available :toolName (:function part) :toolCallId id}])))
   parts))

;;; utils tests

(deftest sse-reducible-test
  (testing "sse-reducible produces items via standard reduce"
    (let [data    ["just a test" "to make you jealous"]
          istream (io/input-stream (.getBytes (make-sse data)))
          result  (into [] (self/sse-reducible istream))]
      (is (= data result)))))

(deftest sse-reducible-early-termination-test
  (testing "sse-reducible stops on reduced"
    (let [data    (mapv #(str "msg-" %) (range 100))
          istream (io/input-stream (.getBytes (make-sse data)))
          ;; Take only first 3 items using reduced
          result  (reduce (fn [acc item]
                            (if (< (count acc) 3)
                              (conj acc item)
                              (reduced acc)))
                          []
                          (self/sse-reducible istream))]
      (is (= ["msg-0" "msg-1" "msg-2"] result)))))

(deftest sse-reducible-stops-response-test
  (let [cnt     (atom 30)
        handler (fn [_req]
                  (let [out (java.io.PipedOutputStream.)
                        in  (java.io.PipedInputStream. out 65536)]
                    (future
                      (try
                        (dotimes [i @cnt]
                          (.write out (.getBytes (make-sse [(str "msg-" i)])))
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
            reducible (self/sse-reducible (:body res))
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

;;; conversion tests

(deftest openai-conv-test
  (testing "tools calls are mapped well"
    (is (= {:start                1
            :tool-input-start     2
            :tool-input-delta     34
            :tool-input-available 2
            :usage                1}
           (->> (json-resource "llm/openai-tool-calls.json")
                (into [] self/openai->aisdk-xf)
                (map :type)
                frequencies)))
    (is (=? [{:type :start}
             {:type :tool-input :function "analyze-data-trend" :arguments {}}
             {:type :tool-input :function "analyze-data-trend" :arguments {}}
             {:type :usage :usage {:total_tokens 225}}]
            (->> (json-resource "llm/openai-tool-calls.json")
                 (into [] (comp self/openai->aisdk-xf (self/aisdk-xf)))))))
  (testing "structured output is parsed too"
    (is (= {:start      1
            ;; TODO: we're representing it as just text but this needs to be improved maybe?
            :text-start 1
            :text-delta 32
            :text-end   1
            :usage      1}
           (->> (json-resource "llm/openai-structured-output.json")
                (into [] self/openai->aisdk-xf)
                (map :type)
                frequencies)))
    (is (=? [{:type :start}
             {:type :text :text string?}
             {:type :usage :usage {:total_tokens 109}}]
            (->> (json-resource "llm/openai-structured-output.json")
                 (into [] (comp self/openai->aisdk-xf (self/aisdk-xf))))))))

(deftest claude-conv-test
  (testing "text is mapped well"
    (is (= {:start      1
            :text-start 1
            :text-delta 6
            :text-end   1
            :usage      1}
           (->> (json-resource "llm/claude-text.json")
                (into [] self/claude->aisdk-xf)
                (map :type)
                frequencies)))
    (is (=? [{:type :start :id string?}
             {:type :text :id string? :text string?}
             {:type :usage :id string? :usage {:promptTokens 13}}]
            (->> (json-resource "llm/claude-text.json")
                 (into [] (comp self/claude->aisdk-xf (self/aisdk-xf)))))))
  (testing "tool input (also structured output) is mapped well"
    (is (= {:start                1
            :tool-input-start     1
            :tool-input-delta     15
            :tool-input-available 1
            :usage                1}
           (->> (json-resource "llm/claude-tool-input.json")
                (into [] self/claude->aisdk-xf)
                (map :type)
                frequencies)))
    (is (=? [{:type :start}
             {:type :tool-input :arguments {:currencies [{:country "CAN" :currency "CAD"}
                                                         {:country "USA" :currency "USD"}
                                                         {:country "MEX" :currency "MXN"}]}}
             ;; TODO: convert usage to common format
             {:type :usage :usage {:promptTokens 737}}]
            (->> (json-resource "llm/claude-tool-input.json")
                 (into [] (comp self/claude->aisdk-xf (self/aisdk-xf))))))))

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
             (into [] (self/lite-aisdk-xf) chunks)))))

  (testing "still collects tool inputs for JSON parsing"
    (let [chunks [{:type :start :messageId "msg-1"}
                  {:type :tool-input-start :toolCallId "call-1" :toolName "search"}
                  {:type :tool-input-delta :toolCallId "call-1" :inputTextDelta "{\"query\":"}
                  {:type :tool-input-delta :toolCallId "call-1" :inputTextDelta "\"test\"}"}
                  {:type :tool-input-available :toolCallId "call-1" :toolName "search"}]]
      (is (= [{:type :start :id "msg-1"}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "test"}}]
             (into [] (self/lite-aisdk-xf) chunks)))))

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
             (into [] (self/lite-aisdk-xf) chunks)))))

  (testing "works with claude->aisdk-xf for streaming text"
    ;; Verify it works end-to-end with real Claude format
    (let [result (->> (json-resource "llm/claude-text.json")
                      (into [] (comp self/claude->aisdk-xf (self/lite-aisdk-xf))))]
      (is (< 1 (count (filter #(= :text (:type %)) result)))
          "lite-aisdk-xf should emit multiple text parts from deltas")))

  (testing "works with claude->aisdk-xf for tool inputs"
    (let [result (->> (json-resource "llm/claude-tool-input.json")
                      (into [] (comp self/claude->aisdk-xf (self/lite-aisdk-xf))))]
      (is (=? [{:type :start}
               {:type      :tool-input
                :arguments {:currencies [{:country "CAN" :currency "CAD"}
                                         {:country "USA" :currency "USD"}
                                         {:country "MEX" :currency "MXN"}]}}
               {:type :usage}]
              result)))))

;;; tool executor

(mu/defn get-time
  "Return current time for a given IANA timezone."
  [{:keys [tz]} :- [:map {:closed true}
                    [:tz [:string {:description "IANA timezone, e.g. Europe/Bucharest"}]]]]
  (str (java.time.ZonedDateTime/now (java.time.ZoneId/of tz))))

(mu/defn convert-currency
  "Convert an amount between two ISO currencies using a dummy rate."
  [{:keys [amount from to]} :- [:map {:closed true}
                                [:amount :float]
                                [:from :string]
                                [:to :string]]]
  (let [rate (if (= [from to] ["EUR" "USD"]) 1.16 1.0)]
    {:amount    amount
     :from      from
     :to        to
     :rate      rate
     :converted (* amount rate)}))

(mu/defn mock-llm
  "Return aisdk-formatted results as a reducible (IReduceInit)"
  [{:keys [id input]} :- [:map {:closed true}
                          [:id :string]
                          [:input :string]]]
  ;; Return a reducible that yields the parts
  (let [parts (parts->aisdk
               [{:type :start :id "mock-1"}
                {:type :text :id id :text input}])]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (reduce rf init parts)))))

(def TOOLS
  "All the defined tools"
  (u/index-by
   #(-> % meta :name name)
   [#'get-time
    #'convert-currency
    #'mock-llm]))

(deftest ^:parallel tool-executor-xf-test
  (testing "tool-executor-xf passes through all chunks unchanged"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-123"}
                   {:type :text :id "text-1" :text "Hello world"}])
          result (into [] (self/tool-executor-xf TOOLS) chunks)]
      (is (= chunks result)
          "Non-tool chunks should pass through unchanged")))

  (testing "tool-executor-xf executes tool calls and appends results"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-123"}
                   {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
                   {:type :usage :usage {:total_tokens 100}}])
          result (into [] (self/tool-executor-xf TOOLS) chunks)]
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
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-456"}
                   {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
                   {:type :tool-input :id "call-2" :function "convert-currency" :arguments {:amount 100, :from "EUR", :to "USD"}}])
          result (into [] (self/tool-executor-xf TOOLS) chunks)]
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
          chunks (parts->aisdk
                  [{:type :start :id "msg-666"}
                   {:type :tool-input :id "call-1" :function "mock-llm" :arguments {:input input
                                                                                    :id    llm-id}}])
          result (into [] (self/tool-executor-xf TOOLS) chunks)]
      (is (= 1 (count (filter #(= :start (:type %)) result)))
          "Just the first start is left in the stream")
      (is (< 3 (count (filter #(= llm-id (:id %)) result)))
          "We get output from our 'llm' in little pieces")
      (is (= {:type :text
              :id   llm-id
              :text input}
             (last (into [] (self/aisdk-xf) result))))))

  (testing "tool-executor-xf handles tool execution errors gracefully"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-789"}
                   {:type :tool-input :id "call-err" :function "get-time" :arguments {:tz "Invalid/Timezone"}}])
          result (into [] (self/tool-executor-xf TOOLS) chunks)]
      (is (= (count chunks) (dec (count result))))
      (let [tool-result (last result)]
        (is (=? {:type       :tool-output-available
                 :toolCallId "call-err"
                 :toolName   "get-time"
                 :error      {:message string?
                              :type    string?}}
                tool-result)))))

  (testing "tool-executor-xf ignores unknown tool names"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-789"}
                   {:type :tool-input :id "call-1" :function "unknown-tool" :arguments {:foo :bar}}])
          result (into [] (self/tool-executor-xf TOOLS) chunks)]
      (is (= chunks result)
          "Unknown tools should be ignored, chunks pass through unchanged"))))

;;; AI SDK v4 Line Protocol tests

(deftest format-text-line-test
  (testing "formats text as JSON-encoded string with 0: prefix"
    (is (= "0:\"Hello world\"" (self/format-text-line {:text "Hello world"})))
    (is (= "0:\"Line with \\\"quotes\\\"\"" (self/format-text-line {:text "Line with \"quotes\""})))))

(deftest format-data-line-test
  (testing "formats data with type, version, and value"
    (is (= "2:{\"type\":\"state\",\"version\":1,\"value\":{\"queries\":{}}}"
           (self/format-data-line {:data-type "state" :data {:queries {}}})))
    (is (= "2:{\"type\":\"navigate_to\",\"version\":1,\"value\":{\"url\":\"/question/123\"}}"
           (self/format-data-line {:data-type "navigate_to" :data {:url "/question/123"}})))))

(deftest format-error-line-test
  (testing "formats error message as JSON string with 3: prefix"
    (is (= "3:\"Something went wrong\"" (self/format-error-line {:error {:message "Something went wrong"}})))
    (is (= "3:\"Unknown error\"" (self/format-error-line {:error "Unknown error"})))))

(deftest format-tool-call-line-test
  (testing "formats tool call with toolCallId, toolName, and args"
    (let [line (self/format-tool-call-line {:id "call-123"
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
    (let [line (self/format-tool-result-line {:id "call-123"
                                              :result {:data [{:id 1}]}})]
      (is (str/starts-with? line "a:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "call-123" (:toolCallId parsed)))
        ;; result should be JSON string
        (is (string? (:result parsed))))))

  (testing "formats tool error"
    (let [line (self/format-tool-result-line {:id "call-456"
                                              :error {:message "Tool failed"}})]
      (is (str/starts-with? line "a:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "call-456" (:toolCallId parsed)))
        (is (string? (:error parsed)))))))

(deftest format-finish-line-test
  (testing "formats finish message with usage"
    (let [line (self/format-finish-line {"claude-sonnet-4-5-20250929" {:prompt 100 :completion 50}})]
      (is (str/starts-with? line "d:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "stop" (:finishReason parsed)))
        ;; Keys are keywordized when parsing JSON
        (is (= 100 (get-in parsed [:usage :claude-sonnet-4-5-20250929 :prompt])))))))

(deftest format-start-line-test
  (testing "formats start message with messageId"
    (let [line (self/format-start-line {:id "msg-123"})]
      (is (str/starts-with? line "f:"))
      (let [parsed (json/decode+kw (subs line 2))]
        (is (= "msg-123" (:messageId parsed)))))))

(deftest aisdk-line-xf-test
  (testing "converts internal parts to AI SDK v4 line protocol"
    (let [parts [{:type :start :id "msg-1"}
                 {:type :text :text "Hello"}
                 {:type :tool-input :id "call-1" :function "search" :arguments {:q "test"}}
                 {:type :tool-output :id "call-1" :result {:data []}}
                 {:type :usage :id "claude-sonnet-4-5-20250929" :usage {:promptTokens 10 :completionTokens 5}}
                 {:type :finish}]
          lines (into [] (self/aisdk-line-xf) parts)]
      ;; Should have: start, text, tool-call, tool-result, finish (usage is folded into finish)
      (is (= 5 (count lines)))
      (is (str/starts-with? (nth lines 0) "f:"))  ;; start
      (is (str/starts-with? (nth lines 1) "0:"))  ;; text
      (is (str/starts-with? (nth lines 2) "9:"))  ;; tool-call
      (is (str/starts-with? (nth lines 3) "a:"))  ;; tool-result
      (is (str/starts-with? (nth lines 4) "d:"))  ;; finish with usage
      ;; Verify usage is in finish message
      (let [finish-data (json/decode+kw (subs (nth lines 4) 2))]
        ;; Keys are keywordized when parsing JSON
        (is (= 10 (get-in finish-data [:usage :claude-sonnet-4-5-20250929 :prompt])))
        (is (= 5 (get-in finish-data [:usage :claude-sonnet-4-5-20250929 :completion])))))))
