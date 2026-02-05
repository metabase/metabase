(ns metabase-enterprise.metabot-v3.agent.messages-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]))

(deftest build-message-history-test
  (testing "builds message history from input messages only"
    (let [messages [{:role :user :content "Hello"}]
          mem      (memory/initialize messages {})]
      (is (=? [{:role "user" :content "Hello"}]
              (messages/build-message-history mem)))))

  (testing "includes assistant messages from input"
    (let [messages [{:role :user :content "Hello"}
                    {:role :assistant :content "Hi there"}]
          mem      (memory/initialize messages {})]
      (is (=? [{:role "user"}
               {:role "assistant"}]
              (messages/build-message-history mem)))))

  (testing "includes steps from memory"
    (let [messages [{:role :user :content "Hello"}]
          parts    [{:type :text :text "Response text"}]
          mem      (-> (memory/initialize messages {})
                       (memory/add-step parts))]
      (is (=? [{:role "user"}
               {:role "assistant" :content "Response text"}]
              (messages/build-message-history mem)))))

  (testing "includes tool calls from steps"
    (let [messages [{:role :user :content "Search for revenue"}]
          parts    [{:type      :tool-input
                     :id        "tool_1"
                     :function  "search"
                     :arguments {:query "revenue"}}]
          mem      (-> (memory/initialize messages {})
                       (memory/add-step parts))]
      (is (=? [{:role "user"}
               {:role    "assistant"
                :content [{:type "tool_use"
                           :id   "tool_1"
                           :name "search"}]}]
              (messages/build-message-history mem)))))

  (testing "includes tool results from steps"
    (let [messages    [{:role :user :content "Search"}]
          tool-input  [{:type      :tool-input
                        :id        "tool_1"
                        :function  "search"
                        :arguments {:query "test"}}]
          tool-output [{:type   :tool-output
                        :id     "tool_1"
                        :result {:data []}}]
          mem         (-> (memory/initialize messages {})
                          (memory/add-step tool-input)
                          (memory/add-step tool-output))]
      (is (=? [{:role "user"}
               {:role "assistant"}
               {:role    "user"
                :content [{:type "tool_result"}]}]
              (messages/build-message-history mem)))))

  (testing "handles tool results with underscore key (structured_output)"
    ;; Some tools return {:structured_output ...} (underscore, from JSON/API responses)
    ;; instead of {:structured-output ...} (hyphen, Clojure idiomatic)
    (let [messages    [{:role :user :content "Search"}]
          tool-input  [{:type      :tool-input
                        :id        "tool_1"
                        :function  "search"
                        :arguments {:query "test"}}]
          ;; Use underscore key format (as returned by search.clj and other tools)
          tool-output [{:type   :tool-output
                        :id     "tool_1"
                        :result {:structured_output {:data        [{:name "Result 1"}]
                                                     :total_count 1}}}]
          mem         (-> (memory/initialize messages {})
                          (memory/add-step tool-input)
                          (memory/add-step tool-output))]
      (is (=? [{}
               {}
               ;; Tool result should be formatted as a string containing search results XML
               {:content [{:content #"(?s).*<search-results>.*"}]}]
              (messages/build-message-history mem)))))

  (testing "formats entity results when type is a string"
    (let [messages            [{:role :user :content "Details"}]
          tool-output         [{:type   :tool-output
                                :id     "tool_1"
                                :result {:structured_output {:type "table"
                                                             :id   1
                                                             :name "users"}}}]
          mem                 (-> (memory/initialize messages {})
                                  (memory/add-step tool-output))]
      (is (=? [{}
               {:content [{:content #"(?s).*<table.*"}]}]
              (messages/build-message-history mem)))))

  (testing "handles multiple iterations"
    (let [messages   [{:role :user :content "Hello"}]
          iteration1 [{:type :tool-input :id "t1" :function "search" :arguments {}}]
          iteration2 [{:type :tool-output :id "t1" :result {:data []}}]
          iteration3 [{:type :text :text "Found results"}]
          mem        (-> (memory/initialize messages {})
                         (memory/add-step iteration1)
                         (memory/add-step iteration2)
                         (memory/add-step iteration3))]
      (is (=? [{:role "user"}
               {:role "assistant"}
               {:role "user"}
               {:role "assistant"}]
              (messages/build-message-history mem)))))

  (testing "merges consecutive assistant messages from input"
    ;; This happens when the frontend sends separate text and tool_calls messages
    (let [messages [{:role :user :content "Hello"}
                    {:role :assistant :content "I'll search for that."}
                    {:role :assistant :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}
                    {:role :tool :tool_call_id "t1" :content "results"}]
          mem      (memory/initialize messages {})]
      ;; Should merge the two assistant messages into one
      (is (=? [{:role "user"}
               {:role    "assistant"
                :content [{:type "text" :text "I'll search for that."}
                          {:type "tool_use"}]}
               {:role "user"}]
              (messages/build-message-history mem)))))

  (testing "merges multiple consecutive assistant messages"
    ;; Edge case: more than 2 consecutive assistant messages
    (let [messages [{:role :user :content "Hello"}
                    {:role :assistant :content "First part."}
                    {:role :assistant :content "Second part."}
                    {:role :assistant :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}]
          mem      (memory/initialize messages {})]
      (is (=? [{:role "user"}
               {:role    "assistant"
                :content [{:type "text"}
                          {:type "text"}
                          {:type "tool_use"}]}]
              (messages/build-message-history mem))))))

(deftest format-message-test
  (testing "formats user message"
    (let [msg {:role :user :content "Hello"}]
      (is (=? [{:role "user" :content "Hello"}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "formats assistant message with content"
    (let [msg {:role :assistant :content "Response"}]
      (is (=? [{:role "assistant" :content "Response"}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "formats assistant message with tool calls"
    ;; OpenAI-style tool_calls should be converted to Claude-style content blocks
    (let [msg {:role       :assistant
               :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}]
      ;; No OpenAI-style tool_calls key
      (is (= [{:role    "assistant"
               :content [{:type "tool_use" :id "t1" :name "search" :input {}}]}]
             (messages/build-message-history
              (memory/initialize [msg] {}))))))

  (testing "formats tool result message"
    (let [msg {:role         :tool
               :tool_call_id "t1"
               :content      "result"}]
      (is (=? [{:role    "user"
                :content [{:type "tool_result" :tool_use_id "t1"}]}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "preserves pre-formatted user message with array content"
    ;; This happens when message history from API already has tool results formatted
    (let [msg {:role    :user
               :content [{:type        "tool_result"
                          :tool_use_id "toolu_123"
                          :content     "{\"data\": []}"}]}]
      ;; Should preserve the array content as-is, not double-wrap it
      (is (=? [{:role    "user"
                :content [{:type "tool_result" :tool_use_id "toolu_123"}]}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "preserves pre-formatted assistant message with tool_use array content"
    ;; This happens when message history from API already has tool calls formatted
    (let [msg {:role    :assistant
               :content [{:type  "tool_use"
                          :id    "toolu_456"
                          :name  "search"
                          :input {:query "test"}}]}]
      ;; Should preserve the array content as-is
      (is (=? [{:role    "assistant"
                :content [{:type "tool_use"}]}]
              (messages/build-message-history
               (memory/initialize [msg] {})))))))

(deftest format-message-test-2
  (testing "handles assistant message without content (only tool_calls)"
    ;; OpenAI-style tool_calls should be converted to Claude-style content blocks
    (let [msg {:role       :assistant
               :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}]
      (is (= [{:role    "assistant"
               :content [{:type "tool_use", :id "t1", :name "search", :input {}}]}]
             (messages/build-message-history
              (memory/initialize [msg] {}))))))

  (testing "handles assistant message with both content AND tool_calls"
    ;; When there's both text and tool_calls, combine them into content blocks
    (let [msg {:role       :assistant
               :content    "I'll search for that."
               :tool_calls [{:id "t1" :name "search" :arguments "{\"query\":\"test\"}"}]}]
      (is (=? [{:role    "assistant"
                :content [{:type "text" :text "I'll search for that."}
                          {:type "tool_use" :id "t1" :name "search" :input {"query" "test"}}]}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "passes through messages with string role unchanged"
    ;; Messages that are already fully formatted should pass through
    (let [msg {:role "user" :content "Already formatted"}]
      (is (=? [{:role "user" :content "Already formatted"}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "handles string role assistant message with tool_calls but no content"
    ;; This is a critical case from the frontend - messages come with string roles
    ;; and tool_calls but no :content key
    (let [msg {:role       "assistant"
               :tool_calls [{:id "toolu_123" :name "search" :arguments "{\"query\":\"test\"}"}]}]
      (is (= [{:role    "assistant"
               :content [{:type  "tool_use"
                          :id    "toolu_123"
                          :name  "search"
                          :input {"query" "test"}}]}]
             (messages/build-message-history
              (memory/initialize [msg] {}))))))

  (testing "handles string role assistant message with both content and tool_calls"
    ;; Frontend may also send messages with both text content and tool_calls
    (let [msg {:role       "assistant"
               :content    "I'll search for that."
               :tool_calls [{:id "toolu_456" :name "get_entity_details" :arguments "{\"table_id\":1}"}]}]
      (is (=? [{:role    "assistant"
                :content [{:type "text" :text "I'll search for that."}
                          {:type "tool_use" :id "toolu_456"}]}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "appends tool_calls when content is already a block list"
    (let [msg {:role       :assistant
               :content    [{:type "text" :text "Here you go."}]
               :tool_calls [{:id "t1" :name "search" :arguments "{\"query\":\"foo\"}"}]}]
      (is (=? [{:role    "assistant"
                :content [{:type "text"}
                          {:type "tool_use" :id "t1"}]}]
              (messages/build-message-history
               (memory/initialize [msg] {}))))))

  (testing "handles malformed tool_call arguments"
    (let [msg       {:role       :assistant
                     :tool_calls [{:id "t1" :name "search" :arguments "{bad-json"}]}]
      (is (=? [{:role    "assistant"
                :content [{:type "tool_use" :input "{bad-json"}]}]
              (messages/build-message-history
                     (memory/initialize [msg] {}))))))

  (testing "handles string role tool message"
    ;; Frontend sends tool results with string roles too
    (let [msg       {:role         "tool"
                     :tool_call_id "toolu_789"
                     :content      "{\"results\": []}"}]
      (is (=? [{:role    "user"
                :content [{:type "tool_result" :tool_use_id "toolu_789"}]}]
              (messages/build-message-history
                     (memory/initialize [msg] {})))))))

(deftest build-system-message-test
  (testing "builds basic system message"
    (let [profile {:prompt-template "internal.selmer"
                   :model           "claude-sonnet-4-5-20250929"}]
      (is (=? {:role "system" :content #"(?s).*Metabot.*"}
              (messages/build-system-message {} profile {})))))

  (testing "includes viewing context when provided"
    (let [context {:user_is_viewing [{:type "dashboard" :id 1 :name "Sales Dashboard"}]}
          profile {:prompt-template "internal.selmer"
                   :model           "claude-sonnet-4-5-20250929"}]
      (is (=? {:content #(not (str/blank? %))}
              (messages/build-system-message context profile {})))))

  (testing "includes recent views context when provided"
    (let [context {:user_recently_viewed [{:type "question" :id 1 :name "Top Revenue"}]}
          profile {:prompt-template "internal.selmer"
                   :model           "claude-sonnet-4-5-20250929"}]
      (is (=? {:content #(not (str/blank? %))}
              (messages/build-system-message context profile {})))))

  (testing "handles empty context gracefully"
    (let [profile {:prompt-template "internal.selmer"
                   :model           "claude-sonnet-4-5-20250929"}]
      (is (=? {:content #(not (str/blank? %))}
              (messages/build-system-message {} profile {}))))))
