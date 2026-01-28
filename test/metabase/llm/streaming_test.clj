(ns metabase.llm.streaming-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.llm.streaming :as streaming])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(deftest format-sse-line-test
  (testing "formats text delta correctly"
    (is (= "0:\"Hello\"\n"
           (streaming/format-sse-line :text "Hello"))))

  (testing "formats data part correctly"
    (is (= "2:{\"type\":\"code_edit\"}\n"
           (streaming/format-sse-line :data {:type "code_edit"}))))

  (testing "formats error correctly"
    (is (= "3:{\"message\":\"Error occurred\"}\n"
           (streaming/format-sse-line :error {:message "Error occurred"}))))

  (testing "formats finish message correctly"
    (is (= "d:{\"finishReason\":\"stop\"}\n"
           (streaming/format-sse-line :finish-message {:finishReason "stop"})))))

(deftest format-finish-message-test
  (testing "creates finish message with reason"
    (is (= {:finishReason "stop"}
           (streaming/format-finish-message "stop")))
    (is (= {:finishReason "error"}
           (streaming/format-finish-message "error")))))

(deftest openai-chat->aisdk-xf-test
  (testing "extracts content from OpenAI chat completion chunks"
    (let [chunks [{:id "chatcmpl-123"
                   :object "chat.completion.chunk"
                   :choices [{:delta {:content "Hello"}}]}
                  {:id "chatcmpl-123"
                   :object "chat.completion.chunk"
                   :choices [{:delta {:content " world"}}]}
                  {:id "chatcmpl-123"
                   :object "chat.completion.chunk"
                   :choices [{:delta {:content "!"}}]}]
          result (into [] streaming/openai-chat->aisdk-xf chunks)]
      (is (= [{:type :text-delta :delta "Hello"}
              {:type :text-delta :delta " world"}
              {:type :text-delta :delta "!"}]
             result))))

  (testing "skips chunks without content"
    (let [chunks [{:id "chatcmpl-123"
                   :object "chat.completion.chunk"
                   :choices [{:delta {:role "assistant"}}]}
                  {:id "chatcmpl-123"
                   :object "chat.completion.chunk"
                   :choices [{:delta {:content "Hello"}}]}
                  {:id "chatcmpl-123"
                   :object "chat.completion.chunk"
                   :choices [{:delta {}}]}]
          result (into [] streaming/openai-chat->aisdk-xf chunks)]
      (is (= [{:type :text-delta :delta "Hello"}]
             result))))

  (testing "handles empty choices"
    (let [chunks [{:id "chatcmpl-123"
                   :object "chat.completion.chunk"
                   :choices []}]
          result (into [] streaming/openai-chat->aisdk-xf chunks)]
      (is (= [] result)))))

(deftest anthropic-chat->aisdk-xf-test
  (testing "extracts partial_json from content_block_delta events"
    (let [chunks [{:type "content_block_delta"
                   :index 0
                   :delta {:type "input_json_delta"
                           :partial_json "{\"sql\":"}}
                  {:type "content_block_delta"
                   :index 0
                   :delta {:type "input_json_delta"
                           :partial_json "\"SELECT"}}
                  {:type "content_block_delta"
                   :index 0
                   :delta {:type "input_json_delta"
                           :partial_json " * FROM users\"}"}}]
          result (into [] streaming/anthropic-chat->aisdk-xf chunks)]
      (is (= [{:type :text-delta :delta "{\"sql\":"}
              {:type :text-delta :delta "\"SELECT"}
              {:type :text-delta :delta " * FROM users\"}"}]
             result))))

  (testing "extracts prompt tokens and model from message_start event"
    (let [chunks [{:type "message_start"
                   :message {:id "msg_123"
                             :model "claude-sonnet-4-20250514"
                             :usage {:input_tokens 1500}}}]
          result (into [] streaming/anthropic-chat->aisdk-xf chunks)]
      (is (= [{:type :usage :id "claude-sonnet-4-20250514" :usage {:promptTokens 1500}}]
             result))))

  (testing "extracts completion tokens with model from message_delta event"
    (let [chunks [{:type "message_start"
                   :message {:id "msg_123"
                             :model "claude-sonnet-4-20250514"
                             :usage {:input_tokens 1500}}}
                  {:type "message_delta"
                   :usage {:output_tokens 250}}]
          result (into [] streaming/anthropic-chat->aisdk-xf chunks)]
      (is (= [{:type :usage :id "claude-sonnet-4-20250514" :usage {:promptTokens 1500}}
              {:type :usage :id "claude-sonnet-4-20250514" :usage {:completionTokens 250}}]
             result))))

  (testing "emits both usage and text-delta parts from a full stream"
    (let [chunks [{:type "message_start"
                   :message {:id "msg_123"
                             :model "claude-sonnet-4-20250514"
                             :usage {:input_tokens 1500}}}
                  {:type "content_block_start"
                   :index 0
                   :content_block {:type "tool_use" :name "generate_sql"}}
                  {:type "content_block_delta"
                   :index 0
                   :delta {:type "input_json_delta"
                           :partial_json "{\"sql\":\"SELECT 1\"}"}}
                  {:type "content_block_stop"
                   :index 0}
                  {:type "message_delta"
                   :usage {:output_tokens 250}}]
          result (into [] streaming/anthropic-chat->aisdk-xf chunks)]
      (is (= [{:type :usage :id "claude-sonnet-4-20250514" :usage {:promptTokens 1500}}
              {:type :text-delta :delta "{\"sql\":\"SELECT 1\"}"}
              {:type :usage :id "claude-sonnet-4-20250514" :usage {:completionTokens 250}}]
             result))))

  (testing "skips message_start without usage"
    (let [chunks [{:type "message_start"
                   :message {:id "msg_123"
                             :model "claude-sonnet-4-20250514"}}]
          result (into [] streaming/anthropic-chat->aisdk-xf chunks)]
      (is (= [] result))))

  (testing "skips message_delta without usage"
    (let [chunks [{:type "message_delta"
                   :delta {:stop_reason "end_turn"}}]
          result (into [] streaming/anthropic-chat->aisdk-xf chunks)]
      (is (= [] result))))

  (testing "skips content_block_delta with non-input_json_delta type"
    (let [chunks [{:type "content_block_delta"
                   :index 0
                   :delta {:type "text_delta"
                           :text "Hello"}}]
          result (into [] streaming/anthropic-chat->aisdk-xf chunks)]
      (is (= [] result)))))

(deftest sse-chan-test
  (testing "parses SSE stream into channel of JSON objects"
    (let [sse-data "data: {\"id\":\"1\",\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\ndata: {\"id\":\"2\",\"choices\":[{\"delta\":{\"content\":\"!\"}}]}\n\ndata: [DONE]\n"
          input (ByteArrayInputStream. (.getBytes sse-data "UTF-8"))
          ch (streaming/sse-chan input)
          results (loop [acc []]
                    (if-let [v (a/<!! ch)]
                      (recur (conj acc v))
                      acc))]
      (is (= 2 (count results)))
      (is (= "1" (:id (first results))))
      (is (= "Hi" (-> results first :choices first :delta :content)))
      (is (= "2" (:id (second results))))
      (is (= "!" (-> results second :choices first :delta :content)))))

  (testing "handles empty lines between events"
    (let [sse-data "data: {\"msg\":\"first\"}\n\n\n\ndata: {\"msg\":\"second\"}\n\ndata: [DONE]\n"
          input (ByteArrayInputStream. (.getBytes sse-data "UTF-8"))
          ch (streaming/sse-chan input)
          results (loop [acc []]
                    (if-let [v (a/<!! ch)]
                      (recur (conj acc v))
                      acc))]
      (is (= 2 (count results)))
      (is (= "first" (:msg (first results))))
      (is (= "second" (:msg (second results))))))

  (testing "closes channel on [DONE]"
    (let [sse-data "data: {\"msg\":\"hello\"}\n\ndata: [DONE]\n"
          input (ByteArrayInputStream. (.getBytes sse-data "UTF-8"))
          ch (streaming/sse-chan input)]
      (is (some? (a/<!! ch)))
      (is (nil? (a/<!! ch))))))

(deftest anthropic-sse-chan-test
  (testing "parses Anthropic SSE stream with event: and data: lines"
    (let [sse-data (str "event: message_start\n"
                        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_123\"}}\n\n"
                        "event: content_block_start\n"
                        "data: {\"type\":\"content_block_start\",\"index\":0}\n\n"
                        "event: content_block_delta\n"
                        "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"sql\\\":\"}}\n\n"
                        "event: content_block_delta\n"
                        "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"SELECT 1\\\"}\"}}\n\n"
                        "event: message_stop\n"
                        "data: {\"type\":\"message_stop\"}\n\n")
          input (ByteArrayInputStream. (.getBytes sse-data "UTF-8"))
          ch (streaming/anthropic-sse-chan input)
          results (loop [acc []]
                    (if-let [v (a/<!! ch)]
                      (recur (conj acc v))
                      acc))]
      (is (= 4 (count results)))
      (is (= "message_start" (:type (first results))))
      (is (= "content_block_delta" (:type (nth results 2))))
      (is (= "{\"sql\":" (-> (nth results 2) :delta :partial_json)))))

  (testing "closes channel on message_stop event"
    (let [sse-data (str "event: message_start\n"
                        "data: {\"type\":\"message_start\"}\n\n"
                        "event: message_stop\n"
                        "data: {\"type\":\"message_stop\"}\n\n")
          input (ByteArrayInputStream. (.getBytes sse-data "UTF-8"))
          ch (streaming/anthropic-sse-chan input)
          results (loop [acc []]
                    (if-let [v (a/<!! ch)]
                      (recur (conj acc v))
                      acc))]
      (is (= 1 (count results)))
      (is (= "message_start" (:type (first results)))))))

(deftest type-prefix-test
  (testing "type prefixes are correct AI SDK v5 values"
    (is (= "0:" (:text streaming/type-prefix)))
    (is (= "2:" (:data streaming/type-prefix)))
    (is (= "3:" (:error streaming/type-prefix)))
    (is (= "d:" (:finish-message streaming/type-prefix)))
    (is (= "e:" (:finish-step streaming/type-prefix)))
    (is (= "f:" (:start-step streaming/type-prefix)))))
