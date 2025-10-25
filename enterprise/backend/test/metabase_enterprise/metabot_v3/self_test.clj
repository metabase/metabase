(ns metabase-enterprise.metabot-v3.self-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
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

(defn- chan-seq!
  "Convert core.async channel to a lazy seq, blocking; just for tests"
  [chan]
  (lazy-seq
   (when-some [chunk (a/<!! chan)]
     (cons chunk (chan-seq! chan)))))

(deftest sse-chan-test
  (testing "sse-chan actually produces chan with lines"
    (let [data    ["just a test" "to make you jealous"]
          istream (io/input-stream (.getBytes (make-sse data)))
          chan    (self/sse-chan istream)]
      (is (= data
             (chan-seq! chan))))))

(deftest sse-chan-stops-response-test
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
      (let [res  (http/request {:method :post :url url :as :stream})
            chan (self/sse-chan (:body res))]
        (is (= "msg-0" (a/<!! chan)))
        (is (= "msg-1" (a/<!! chan)))
        (a/close! chan)
        ;; we're waiting for 10 in the handler, so 30 should be enough for propagation
        (Thread/sleep 30)
        ;; it's been 25-26 when I tested this, if it every becomes flaky maybe decrease the number?
        (is (> @cnt 20) "SHOULD have stopped writing when channel closed"))
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
                 (into [] (comp self/openai->aisdk-xf self/aisdk-xf))))))
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
                 (into [] (comp self/openai->aisdk-xf self/aisdk-xf)))))))

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
                 (into [] (comp self/claude->aisdk-xf self/aisdk-xf))))))
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
                 (into [] (comp self/claude->aisdk-xf self/aisdk-xf)))))))

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
  "Return aisdk-formatted results in a core.async channel"
  [{:keys [id input]} :- [:map {:closed true}
                          [:id :string]
                          [:input :string]]]
  (a/to-chan!! (parts->aisdk
                [{:type :start :id "mock-1"}
                 {:type :text :id id :text input}])))

(def TOOLS
  "All the defined tools"
  (u/index-by
   #(-> % meta :name name)
   [#'get-time
    #'convert-currency
    #'mock-llm]))

(deftest ^:parallel async-tool-executor-rff-test
  (testing "tool-executor-rff passes through all chunks unchanged"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-123"}
                   {:type :text :id "text-1" :text "Hello world"}])
          result (into [] (self/tool-executor-rff TOOLS) chunks)]
      (is (= chunks result)
          "Non-tool chunks should pass through unchanged")))

  (testing "tool-executor-rff executes tool calls and appends results"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-123"}
                   {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
                   {:type :usage :usage {:total_tokens 100}}])
          result (into [] (self/tool-executor-rff TOOLS) chunks)]
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

  (testing "tool-executor-rff handles multiple concurrent tool calls"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-456"}
                   {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
                   {:type :tool-input :id "call-2" :function "convert-currency" :arguments {:amount 100, :from "EUR", :to "USD"}}])
          result (into [] (self/tool-executor-rff TOOLS) chunks)]
      (is (= (+ (count chunks) 2) (count result))
          "Should have original chunks plus two tool results")
      (let [tool-results (take-last 2 result)]
        (is (every? #(= :tool-output-available (:type %)) tool-results)
            "Last two chunks should be tool outputs")
        (is (= #{"call-1" "call-2"}
               (set (map :toolCallId tool-results)))))))

  (testing "tool-executor-rff handles tools returning channels"
    (let [llm-id "wut-1"
          input  "Little bits and pieces"
          chunks (parts->aisdk
                  [{:type :start :id "msg-666"}
                   {:type :tool-input :id "call-1" :function "mock-llm" :arguments {:input input
                                                                                    :id    llm-id}}])
          result (into [] (self/tool-executor-rff TOOLS) chunks)]
      (is (= 1 (count (filter #(= :start (:type %)) result)))
          "Just the first start is left in the stream")
      (is (< 3 (count (filter #(= llm-id (:id %)) result)))
          "We get output from our 'llm' in little pieces")
      (is (= {:type :text
              :id   llm-id
              :text input}
             (last (into [] self/aisdk-xf result))))))

  (testing "tool-executor-rff handles tool execution errors gracefully"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-789"}
                   {:type :tool-input :id "call-err" :function "get-time" :arguments {:tz "Invalid/Timezone"}}])
          result (into [] (self/tool-executor-rff TOOLS) chunks)]
      (is (= (count chunks) (dec (count result))))
      (let [tool-result (last result)]
        (is (=? {:type       :tool-output-available
                 :toolCallId "call-err"
                 :toolName   "get-time"
                 :error      {:message string?
                              :type    string?}}
                tool-result)))))

  (testing "tool-executor-rff ignores unknown tool names"
    (let [chunks (parts->aisdk
                  [{:type :start :id "msg-789"}
                   {:type :tool-input :id "call-1" :function "unknown-tool" :arguments {:foo :bar}}])
          result (into [] (self/tool-executor-rff TOOLS) chunks)]
      (is (= chunks result)
          "Unknown tools should be ignored, chunks pass through unchanged"))))
