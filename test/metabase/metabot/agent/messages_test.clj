(ns metabase.metabot.agent.messages-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.messages :as messages]
   [metabase.test :as mt]))

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
             {}
             (memory/initialize [{:role :user :content "Hello"}] {}))))))

(deftest ^:parallel build-message-history-test-2
  (testing "includes assistant text from input"
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "Hi there"}]
            (messages/build-message-history
             {}
             (memory/initialize [{:role :user :content "Hello"}
                                 {:role :assistant :content "Hi there"}] {}))))))

(deftest ^:parallel build-message-history-test-3
  (testing "includes step parts from memory"
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "Response text"}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :text :text "Response text"}])))))))

(deftest ^:parallel build-message-history-test-4
  (testing "includes tool calls from steps"
    (is (=? [{:role :user :content "Search for revenue"}
             {:type :tool-input :id "t1" :function "search" :arguments {:query "revenue"}}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Search for revenue"}] {})
                 (memory/add-step [{:type      :tool-input
                                    :id        "t1"
                                    :function  "search"
                                    :arguments {:query "revenue"}}])))))))

(deftest ^:parallel build-message-history-test-5
  (testing "includes tool results from steps"
    (is (=? [{:role :user :content "Search"}
             {:type :tool-input :id "t1" :function "search"}
             {:type :tool-output :id "t1"}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Search"}] {})
                 (memory/add-step [{:type :tool-input :id "t1" :function "search" :arguments {:query "test"}}])
                 (memory/add-step [{:type :tool-output :id "t1" :result {:data []}}])))))))

(deftest ^:parallel build-message-history-test-6
  (testing "handles multiple iterations"
    (is (=? [{:role :user :content "Hello"}
             {:type :tool-input :id "t1"}
             {:type :tool-output :id "t1"}
             {:type :text :text "Found results"}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :tool-input :id "t1" :function "search" :arguments {}}])
                 (memory/add-step [{:type :tool-output :id "t1" :result {:data []}}])
                 (memory/add-step [{:type :text :text "Found results"}])))))))

(deftest ^:parallel build-message-history-test-7
  (testing "filters out non-message parts from steps"
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "Response"}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :start :messageId "m1"}
                                   {:type :text :text "Response"}
                                   {:type :usage :usage {:promptTokens 10}}])))))))

(deftest ^:parallel build-message-history-test-8
  (testing "merges consecutive assistant messages from input history"
    ;; Frontend may send separate text and tool_calls messages
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "I'll search for that."}
             {:type :tool-input :id "t1" :function "search"}
             {:type :tool-output :id "t1"}]
            (messages/build-message-history
             {}
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
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales Dashboard"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [context {:user_is_viewing [{:type "dashboard" :id dash-id :name "Sales Dashboard"}]}
              profile {:prompt-template "internal.selmer"
                       :model           "claude-sonnet-4-5-20250929"}]
          (is (=? {:content #(str/includes? % "Sales Dashboard")}
                  (messages/build-system-message context profile {})))))))
  (testing "handles empty context gracefully"
    (let [profile {:prompt-template "internal.selmer"
                   :model           "claude-sonnet-4-5-20250929"}]
      (is (=? {:content #(not (str/blank? %))}
              (messages/build-system-message {} profile {}))))))

(deftest ^:parallel build-system-message-viewing-dashboard-test
  (testing "system message includes enriched dashboard details when user is viewing a dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name        "Zorblatt Industries Quarterly Sales"
                                                   :description "Zorblatt-brand widget revenue by quarter"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [profile {:prompt-template "internal.selmer"}
              context {:user_is_viewing [{:type "dashboard" :id dash-id :name "Zorblatt Industries Quarterly Sales"}]}
              {:keys [content]} (messages/build-system-message context profile {})]
          (is (str/includes? content "Zorblatt Industries Quarterly Sales"))
          (testing "description comes from the DB, so it proves enrichment rather than the payload fallback"
            (is (str/includes? content "Zorblatt-brand widget revenue by quarter"))))))))

(deftest ^:parallel build-system-message-viewing-native-query-test
  (testing "system message includes SQL and schema when user is viewing a native query"
    (let [mp (mt/metadata-provider)
          profile {:prompt-template "internal.selmer"}
          context {:user_is_viewing [{:type "adhoc",
                                      :query
                                      (lib/native-query mp "SELECT * FROM orders WHERE status = 'paid'")
                                      :sql_engine "postgres"
                                      :used_tables
                                      [{:description nil,
                                        :database_id 2,
                                        :name "orders",
                                        :fields
                                        [{:field_id "t23-0" :name "id" :display_name "ID" :base_type "type/Integer" :database_type "int4" :semantic_type "type/PK"}
                                         {:field_id "t24-0" :name "status" :display_name "Status" :base_type "type/Integer" :database_type "int4"}
                                         {:field_id "t25-0" :name "total" :display_name "Total" :base_type "type/Integer" :database_type "int4"}]
                                        :type :table
                                        :database_schema "public",
                                        :display_name "Orders"}],
                                      :id "6ef8bcf9-383d-449f-827f-501c4d9b3564"}
                                     {:type "code_editor",
                                      :buffers [{:id "qb", :source {:language "sql", :database_id 2}, :cursor {:line 0, :column 0}}],
                                      :id "f4f07783-9276-403f-af5f-b9e7bd96fc88"}]}
          {:keys [content]} (messages/build-system-message context profile {})]
      (is (str/includes? content "SQL editor"))
      (is (str/includes? content "SELECT * FROM orders WHERE status = 'paid'"))
      (is (str/includes? content "public.orders"))
      (is (str/includes? content "id, status, total")))))
