(ns metabase-enterprise.metabot-v3.agent.messages-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]))

;;; ──────────────────────────────────────────────────────────────────
;;; input-message->parts
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel input-message-user-test
  (testing "plain user message"
    (is (=? [{:role :user :content "Hello"}]
            (messages/input-message->parts {:role :user :content "Hello"}))))

  (testing "user message with string role"
    (is (=? [{:role :user :content "Hello"}]
            (messages/input-message->parts {:role "user" :content "Hello"})))))

(deftest ^:parallel input-message-assistant-test
  (testing "assistant with plain text"
    (is (=? [{:type :text :text "Hi there"}]
            (messages/input-message->parts {:role :assistant :content "Hi there"}))))

  (testing "assistant with tool_calls (OpenAI style)"
    (is (=? [{:type :text :text "Searching..."}
             {:type :tool-input :id "t1" :function "search" :arguments {:q "test"}}]
            (messages/input-message->parts
             {:role       :assistant
              :content    "Searching..."
              :tool_calls [{:id "t1" :name "search" :arguments "{\"q\":\"test\"}"}]}))))

  (testing "assistant with only tool_calls (no content)"
    (is (=? [{:type :tool-input :id "t1" :function "search" :arguments {}}]
            (messages/input-message->parts
             {:role       :assistant
              :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}))))

  (testing "assistant with content blocks (Claude style)"
    (is (=? [{:type :text :text "Let me check..."}
             {:type :tool-input :id "t1" :function "search" :arguments {:q "test"}}]
            (messages/input-message->parts
             {:role    :assistant
              :content [{:type "text" :text "Let me check..."}
                        {:type "tool_use" :id "t1" :name "search" :input {:q "test"}}]}))))

  (testing "assistant with only content block tool_use (no text)"
    (is (=? [{:type :tool-input :id "t1" :function "search"}]
            (messages/input-message->parts
             {:role    :assistant
              :content [{:type "tool_use" :id "t1" :name "search" :input {:q "test"}}]}))))

  (testing "malformed tool_call arguments fall through"
    (is (=? [{:type :tool-input :id "t1" :function "search" :arguments "{bad-json"}]
            (messages/input-message->parts
             {:role       :assistant
              :tool_calls [{:id "t1" :name "search" :arguments "{bad-json"}]})))))

(deftest ^:parallel input-message-tool-test
  (testing "tool result message"
    (is (=? [{:type :tool-output :id "t1" :result {:output "Found 42"}}]
            (messages/input-message->parts
             {:role :tool :tool_call_id "t1" :content "Found 42"}))))

  (testing "tool result with string role"
    (is (=? [{:type :tool-output :id "t1" :result {:output "results"}}]
            (messages/input-message->parts
             {:role "tool" :tool_call_id "t1" :content "results"})))))

(deftest ^:parallel input-message-user-with-tool-results-test
  (testing "user message with tool_result content blocks"
    (is (=? [{:type :tool-output :id "t1" :result {:output "Result 1"}}
             {:type :tool-output :id "t2" :result {:output "Result 2"}}]
            (messages/input-message->parts
             {:role    :user
              :content [{:type "tool_result" :tool_use_id "t1" :content "Result 1"}
                        {:type "tool_result" :tool_use_id "t2" :content "Result 2"}]})))))

;;; ──────────────────────────────────────────────────────────────────
;;; build-message-history
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel build-message-history-test
  (testing "builds history from user messages only"
    (is (=? [{:role :user :content "Hello"}]
            (messages/build-message-history
             (memory/initialize [{:role :user :content "Hello"}] {})))))

  (testing "includes assistant text from input"
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "Hi there"}]
            (messages/build-message-history
             (memory/initialize [{:role :user :content "Hello"}
                                 {:role :assistant :content "Hi there"}] {})))))

  (testing "includes step parts from memory"
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "Response text"}]
            (messages/build-message-history
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :text :text "Response text"}]))))))

  (testing "includes tool calls from steps"
    (is (=? [{:role :user :content "Search for revenue"}
             {:type :tool-input :id "t1" :function "search" :arguments {:query "revenue"}}]
            (messages/build-message-history
             (-> (memory/initialize [{:role :user :content "Search for revenue"}] {})
                 (memory/add-step [{:type      :tool-input
                                    :id        "t1"
                                    :function  "search"
                                    :arguments {:query "revenue"}}]))))))

  (testing "includes tool results from steps"
    (is (=? [{:role :user :content "Search"}
             {:type :tool-input :id "t1" :function "search"}
             {:type :tool-output :id "t1"}]
            (messages/build-message-history
             (-> (memory/initialize [{:role :user :content "Search"}] {})
                 (memory/add-step [{:type :tool-input :id "t1" :function "search" :arguments {:query "test"}}])
                 (memory/add-step [{:type :tool-output :id "t1" :result {:data []}}]))))))

  (testing "handles multiple iterations"
    (is (=? [{:role :user :content "Hello"}
             {:type :tool-input :id "t1"}
             {:type :tool-output :id "t1"}
             {:type :text :text "Found results"}]
            (messages/build-message-history
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :tool-input :id "t1" :function "search" :arguments {}}])
                 (memory/add-step [{:type :tool-output :id "t1" :result {:data []}}])
                 (memory/add-step [{:type :text :text "Found results"}]))))))

  (testing "filters out non-message parts from steps"
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "Response"}]
            (messages/build-message-history
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :start :messageId "m1"}
                                   {:type :text :text "Response"}
                                   {:type :usage :usage {:promptTokens 10}}]))))))

  (testing "merges consecutive assistant messages from input history"
    ;; Frontend may send separate text and tool_calls messages
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "I'll search for that."}
             {:type :tool-input :id "t1" :function "search"}
             {:type :tool-output :id "t1"}]
            (messages/build-message-history
             (memory/initialize [{:role :user :content "Hello"}
                                 {:role :assistant :content "I'll search for that."}
                                 {:role :assistant :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}
                                 {:role :tool :tool_call_id "t1" :content "results"}]
                                {}))))))

(deftest ^:parallel build-system-message-test
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

  (testing "handles empty context gracefully"
    (let [profile {:prompt-template "internal.selmer"
                   :model           "claude-sonnet-4-5-20250929"}]
      (is (=? {:content #(not (str/blank? %))}
              (messages/build-system-message {} profile {}))))))
