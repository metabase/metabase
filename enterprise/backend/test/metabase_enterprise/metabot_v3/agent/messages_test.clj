(ns metabase-enterprise.metabot-v3.agent.messages-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]))

(deftest build-message-history-test
  (testing "builds message history from input messages only"
    (let [input-messages [{:role :user :content "Hello"}]
          mem (memory/initialize input-messages {})
          history (messages/build-message-history mem)]
      (is (= 1 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "Hello" (:content (first history))))))

  (testing "includes assistant messages from input"
    (let [input-messages [{:role :user :content "Hello"}
                          {:role :assistant :content "Hi there"}]
          mem (memory/initialize input-messages {})
          history (messages/build-message-history mem)]
      (is (= 2 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))))

  (testing "includes steps from memory"
    (let [input-messages [{:role :user :content "Hello"}]
          parts [{:type :text :text "Response text"}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step parts))
          history (messages/build-message-history mem)]
      (is (= 2 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))
      (is (= "Response text" (:content (second history))))))

  (testing "includes tool calls from steps"
    (let [input-messages [{:role :user :content "Search for revenue"}]
          parts [{:type :tool-input
                  :id "tool_1"
                  :function "search"
                  :arguments {:query "revenue"}}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step parts))
          history (messages/build-message-history mem)]
      (is (= 2 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))
      ;; Tool calls are represented as content blocks with type "tool_use"
      (is (vector? (:content (second history))))
      (is (= "tool_use" (-> (second history) :content first :type)))
      (is (= "tool_1" (-> (second history) :content first :id)))
      (is (= "search" (-> (second history) :content first :name)))))

  (testing "includes tool results from steps"
    (let [input-messages [{:role :user :content "Search"}]
          tool-input [{:type :tool-input
                       :id "tool_1"
                       :function "search"
                       :arguments {:query "test"}}]
          tool-output [{:type :tool-output
                        :id "tool_1"
                        :result {:data []}}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step tool-input)
                  (memory/add-step tool-output))
          history (messages/build-message-history mem)]
      (is (= 3 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))
      (is (= "user" (:role (nth history 2))))
      (is (some? (:content (nth history 2))))
      (is (vector? (:content (nth history 2))))
      (is (= "tool_result" (-> (nth history 2) :content first :type)))))

  (testing "handles tool results with underscore key (structured_output)"
    ;; Some tools return {:structured_output ...} (underscore, from JSON/API responses)
    ;; instead of {:structured-output ...} (hyphen, Clojure idiomatic)
    (let [input-messages [{:role :user :content "Search"}]
          tool-input [{:type :tool-input
                       :id "tool_1"
                       :function "search"
                       :arguments {:query "test"}}]
          ;; Use underscore key format (as returned by search.clj and other tools)
          tool-output [{:type :tool-output
                        :id "tool_1"
                        :result {:structured_output {:data [{:name "Result 1"}]
                                                     :total_count 1}}}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step tool-input)
                  (memory/add-step tool-output))
          history (messages/build-message-history mem)]
      (is (= 3 (count history)))
      ;; Tool result should be formatted as a string, not raw Clojure data
      (let [tool-result-content (-> (nth history 2) :content first :content)]
        (is (string? tool-result-content))
        ;; Should contain search results XML formatting (not raw Clojure map)
        (is (re-find #"<search-results>" tool-result-content)))))

  (testing "formats entity results when type is a string"
    (let [input-messages [{:role :user :content "Details"}]
          tool-output [{:type :tool-output
                        :id "tool_1"
                        :result {:structured_output {:type "table"
                                                     :id 1
                                                     :name "users"}}}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step tool-output))
          history (messages/build-message-history mem)
          tool-result-content (-> (second history) :content first :content)]
      (is (string? tool-result-content))
      (is (re-find #"<table" tool-result-content)))))

(testing "handles multiple iterations"
  (let [input-messages [{:role :user :content "Hello"}]
        iteration1 [{:type :tool-input :id "t1" :function "search" :arguments {}}]
        iteration2 [{:type :tool-output :id "t1" :result {:data []}}]
        iteration3 [{:type :text :text "Found results"}]
        mem (-> (memory/initialize input-messages {})
                (memory/add-step iteration1)
                (memory/add-step iteration2)
                (memory/add-step iteration3))
        history (messages/build-message-history mem)]
    (is (= 4 (count history)))
    (is (= "user" (:role (first history))))
    (is (= "assistant" (:role (second history))))
    (is (= "user" (:role (nth history 2))))
    (is (= "assistant" (:role (nth history 3))))))

(testing "merges consecutive assistant messages from input"
    ;; This happens when the frontend sends separate text and tool_calls messages
  (let [input-messages [{:role :user :content "Hello"}
                        {:role :assistant :content "I'll search for that."}
                        {:role :assistant :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}
                        {:role :tool :tool_call_id "t1" :content "results"}]
        mem (memory/initialize input-messages {})
        history (messages/build-message-history mem)]
      ;; Should merge the two assistant messages into one
    (is (= 3 (count history)))
    (is (= "user" (:role (first history))))
    (is (= "assistant" (:role (second history))))
    (is (= "user" (:role (nth history 2))))
      ;; The merged assistant message should have both text and tool_use
    (let [assistant-content (:content (second history))]
      (is (vector? assistant-content))
      (is (= 2 (count assistant-content)))
      (is (= "text" (-> assistant-content first :type)))
      (is (= "I'll search for that." (-> assistant-content first :text)))
      (is (= "tool_use" (-> assistant-content second :type))))))

(testing "merges multiple consecutive assistant messages"
    ;; Edge case: more than 2 consecutive assistant messages
  (let [input-messages [{:role :user :content "Hello"}
                        {:role :assistant :content "First part."}
                        {:role :assistant :content "Second part."}
                        {:role :assistant :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}]
        mem (memory/initialize input-messages {})
        history (messages/build-message-history mem)]
    (is (= 2 (count history)))
    (is (= "user" (:role (first history))))
    (is (= "assistant" (:role (second history))))
      ;; Should have 3 content blocks merged
    (let [assistant-content (:content (second history))]
      (is (vector? assistant-content))
      (is (= 3 (count assistant-content)))
      (is (= "text" (-> assistant-content first :type)))
      (is (= "text" (-> assistant-content second :type)))
      (is (= "tool_use" (-> assistant-content (nth 2) :type))))))

(deftest format-message-test
  (testing "formats user message"
    (let [msg {:role :user :content "Hello"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "user" (:role (first formatted))))
      (is (= "Hello" (:content (first formatted))))))

  (testing "formats assistant message with content"
    (let [msg {:role :assistant :content "Response"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      (is (= "Response" (:content (first formatted))))))

  (testing "formats assistant message with tool calls"
    ;; OpenAI-style tool_calls should be converted to Claude-style content blocks
    (let [msg {:role :assistant
               :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      ;; Should be converted to Claude-style content blocks, not OpenAI tool_calls
      (is (nil? (:tool_calls (first formatted))))
      (is (vector? (:content (first formatted))))
      (is (= "tool_use" (-> formatted first :content first :type)))
      (is (= "t1" (-> formatted first :content first :id)))
      (is (= "search" (-> formatted first :content first :name)))))

  (testing "formats tool result message"
    (let [msg {:role :tool
               :tool_call_id "t1"
               :content "result"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "user" (:role (first formatted))))
      (is (vector? (:content (first formatted))))
      (is (= "tool_result" (-> formatted first :content first :type)))
      (is (= "t1" (-> formatted first :content first :tool_use_id)))))

  (testing "preserves pre-formatted user message with array content"
    ;; This happens when message history from API already has tool results formatted
    (let [msg {:role :user
               :content [{:type "tool_result"
                          :tool_use_id "toolu_123"
                          :content "{\"data\": []}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "user" (:role (first formatted))))
      ;; Should preserve the array content as-is, not double-wrap it
      (is (vector? (:content (first formatted))))
      (is (= "tool_result" (-> formatted first :content first :type)))
      (is (= "toolu_123" (-> formatted first :content first :tool_use_id)))))

  (testing "preserves pre-formatted assistant message with tool_use array content"
    ;; This happens when message history from API already has tool calls formatted
    (let [msg {:role :assistant
               :content [{:type "tool_use"
                          :id "toolu_456"
                          :name "search"
                          :input {:query "test"}}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      ;; Should preserve the array content as-is
      (is (vector? (:content (first formatted))))
      (is (= "tool_use" (-> formatted first :content first :type)))))

  (testing "handles assistant message without content (only tool_calls)"
    ;; OpenAI-style tool_calls should be converted to Claude-style content blocks
    (let [msg {:role :assistant
               :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      ;; Should have content blocks with tool_use, not empty string
      (is (vector? (:content (first formatted))))
      (is (= "tool_use" (-> formatted first :content first :type)))
      ;; No OpenAI-style tool_calls key
      (is (nil? (:tool_calls (first formatted))))))

  (testing "handles assistant message with both content AND tool_calls"
    ;; When there's both text and tool_calls, combine them into content blocks
    (let [msg {:role :assistant
               :content "I'll search for that."
               :tool_calls [{:id "t1" :name "search" :arguments "{\"query\":\"test\"}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      (is (vector? (:content (first formatted))))
      ;; First block should be text
      (is (= "text" (-> formatted first :content first :type)))
      (is (= "I'll search for that." (-> formatted first :content first :text)))
      ;; Second block should be tool_use
      (is (= "tool_use" (-> formatted first :content second :type)))
      (is (= "t1" (-> formatted first :content second :id)))
      (is (= "search" (-> formatted first :content second :name)))
      (is (= {"query" "test"} (-> formatted first :content second :input)))))

  (testing "passes through messages with string role unchanged"
    ;; Messages that are already fully formatted should pass through
    (let [msg {:role "user" :content "Already formatted"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "user" (:role (first formatted))))
      (is (= "Already formatted" (:content (first formatted))))))

  (testing "handles string role assistant message with tool_calls but no content"
    ;; This is a critical case from the frontend - messages come with string roles
    ;; and tool_calls but no :content key
    (let [msg {:role "assistant"
               :tool_calls [{:id "toolu_123" :name "search" :arguments "{\"query\":\"test\"}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      ;; Must NOT have nil content - should be converted to content blocks
      (is (some? (:content (first formatted))))
      (is (vector? (:content (first formatted))))
      (is (= "tool_use" (-> formatted first :content first :type)))
      (is (= "toolu_123" (-> formatted first :content first :id)))
      (is (= "search" (-> formatted first :content first :name)))
      ;; Arguments should be decoded from JSON string
      (is (= {"query" "test"} (-> formatted first :content first :input)))
      ;; No OpenAI-style tool_calls key in output
      (is (nil? (:tool_calls (first formatted))))))

  (testing "handles string role assistant message with both content and tool_calls"
    ;; Frontend may also send messages with both text content and tool_calls
    (let [msg {:role "assistant"
               :content "I'll search for that."
               :tool_calls [{:id "toolu_456" :name "get_entity_details" :arguments "{\"table_id\":1}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      (is (vector? (:content (first formatted))))
      (is (= 2 (count (:content (first formatted)))))
      ;; First block is text
      (is (= "text" (-> formatted first :content first :type)))
      (is (= "I'll search for that." (-> formatted first :content first :text)))
      ;; Second block is tool_use
      (is (= "tool_use" (-> formatted first :content second :type)))
      (is (= "toolu_456" (-> formatted first :content second :id)))))

  (testing "appends tool_calls when content is already a block list"
    (let [msg {:role :assistant
               :content [{:type "text" :text "Here you go."}]
               :tool_calls [{:id "t1" :name "search" :arguments "{\"query\":\"foo\"}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))
          content (:content (first formatted))]
      (is (vector? content))
      (is (= 2 (count content)))
      (is (= "text" (-> content first :type)))
      (is (= "tool_use" (-> content second :type)))
      (is (= "t1" (-> content second :id)))))

  (testing "handles malformed tool_call arguments"
    (let [msg {:role :assistant
               :tool_calls [{:id "t1" :name "search" :arguments "{bad-json"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))
          content (:content (first formatted))]
      (is (vector? content))
      (is (= "tool_use" (-> content first :type)))
      (is (= "{bad-json" (-> content first :input)))))

  (testing "handles string role tool message"
    ;; Frontend sends tool results with string roles too
    (let [msg {:role "tool"
               :tool_call_id "toolu_789"
               :content "{\"results\": []}"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "user" (:role (first formatted))))
      (is (vector? (:content (first formatted))))
      (is (= "tool_result" (-> formatted first :content first :type)))
      (is (= "toolu_789" (-> formatted first :content first :tool_use_id))))))

(deftest build-system-message-test
  (testing "builds basic system message"
    (let [context {}
          profile {:prompt-template "internal.selmer"
                   :model "claude-sonnet-4-5-20250929"}
          tools {}
          msg (messages/build-system-message context profile tools)]
      (is (= "system" (:role msg)))
      (is (string? (:content msg)))
      (is (re-find #"Metabot" (:content msg)))))

  (testing "includes viewing context when provided"
    (let [context {:user_is_viewing [{:type "dashboard" :id 1 :name "Sales Dashboard"}]}
          profile {:prompt-template "internal.selmer"
                   :model "claude-sonnet-4-5-20250929"}
          tools {}
          msg (messages/build-system-message context profile tools)]
      (is (string? (:content msg)))
      (is (pos? (count (:content msg))))))

  (testing "includes recent views context when provided"
    (let [context {:user_recently_viewed [{:type "question" :id 1 :name "Top Revenue"}]}
          profile {:prompt-template "internal.selmer"
                   :model "claude-sonnet-4-5-20250929"}
          tools {}
          msg (messages/build-system-message context profile tools)]
      (is (string? (:content msg)))
      (is (pos? (count (:content msg))))))

  (testing "handles empty context gracefully"
    (let [context {}
          profile {:prompt-template "internal.selmer"
                   :model "claude-sonnet-4-5-20250929"}
          tools {}
          msg (messages/build-system-message context profile tools)]
      (is (= "system" (:role msg)))
      (is (string? (:content msg))))))
