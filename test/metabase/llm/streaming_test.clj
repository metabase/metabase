(ns metabase.llm.streaming-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.llm.streaming :as streaming])
  (:import
   (java.io ByteArrayInputStream)))

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

(deftest format-code-edit-part-test
  (testing "creates code edit part with correct structure"
    (let [part (streaming/format-code-edit-part "qb" "SELECT * FROM users")]
      (is (= "code_edit" (:type part)))
      (is (= 1 (:version part)))
      (is (= "qb" (get-in part [:value :buffer_id])))
      (is (= "rewrite" (get-in part [:value :mode])))
      (is (= "SELECT * FROM users" (get-in part [:value :value]))))))

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

(deftest type-prefix-test
  (testing "type prefixes are correct AI SDK v5 values"
    (is (= "0:" (:text streaming/type-prefix)))
    (is (= "2:" (:data streaming/type-prefix)))
    (is (= "3:" (:error streaming/type-prefix)))
    (is (= "d:" (:finish-message streaming/type-prefix)))
    (is (= "e:" (:finish-step streaming/type-prefix)))
    (is (= "f:" (:start-step streaming/type-prefix)))))
