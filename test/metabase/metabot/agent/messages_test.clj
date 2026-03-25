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
    (is (=? [{:role :user :content #(str/ends-with? % "Hello")}]
            (messages/build-message-history
             {}
             (memory/initialize [{:role :user :content "Hello"}] {})))))

  (testing "includes assistant text from input"
    (is (=? [{:role :user :content "Hello"}
             {:type :text :text "Hi there"}]
            (messages/build-message-history
             {}
             (memory/initialize [{:role :user :content "Hello"}
                                 {:role :assistant :content "Hi there"}] {})))))

  (testing "includes step parts from memory"
    (is (=? [{:role :user :content #(str/ends-with? % "Hello")}
             {:type :text :text "Response text"}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :text :text "Response text"}]))))))

  (testing "includes tool calls from steps"
    (is (=? [{:role :user :content #(str/ends-with? % "Search for revenue")}
             {:type :tool-input :id "t1" :function "search" :arguments {:query "revenue"}}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Search for revenue"}] {})
                 (memory/add-step [{:type      :tool-input
                                    :id        "t1"
                                    :function  "search"
                                    :arguments {:query "revenue"}}]))))))

  (testing "includes tool results from steps"
    (is (=? [{:role :user :content #(str/ends-with? % "Search")}
             {:type :tool-input :id "t1" :function "search"}
             {:type :tool-output :id "t1"}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Search"}] {})
                 (memory/add-step [{:type :tool-input :id "t1" :function "search" :arguments {:query "test"}}])
                 (memory/add-step [{:type :tool-output :id "t1" :result {:data []}}]))))))

  (testing "handles multiple iterations"
    (is (=? [{:role :user :content #(str/ends-with? % "Hello")}
             {:type :tool-input :id "t1"}
             {:type :tool-output :id "t1"}
             {:type :text :text "Found results"}]
            (messages/build-message-history
             {}
             (-> (memory/initialize [{:role :user :content "Hello"}] {})
                 (memory/add-step [{:type :tool-input :id "t1" :function "search" :arguments {}}])
                 (memory/add-step [{:type :tool-output :id "t1" :result {:data []}}])
                 (memory/add-step [{:type :text :text "Found results"}]))))))

  (testing "filters out non-message parts from steps"
    (is (=? [{:role :user :content #(str/ends-with? % "Hello")}
             {:type :text :text "Response"}]
            (messages/build-message-history
             {}
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
             {}
             (memory/initialize [{:role :user :content "Hello"}
                                 {:role :assistant :content "I'll search for that."}
                                 {:role :assistant :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}
                                 {:role :tool :tool_call_id "t1" :content "results"}]
                                {}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; build-message-history — context injection
;;; ──────────────────────────────────────────────────────────────────

(defn- last-user-content
  "Return the :content of the last user message from build-message-history output."
  [parts]
  (->> parts (filter #(= :user (:role %))) last :content))

(deftest ^:parallel context-injection-basic-test
  (testing "injects <context> block into the last user message"
    (let [content (last-user-content
                   (messages/build-message-history
                    {}
                    (memory/initialize [{:role :user :content "Hello"}] {})))]
      (is (str/starts-with? content "<context>"))
      (is (str/ends-with? content "Hello"))
      (is (str/includes? content "Current date:"))
      (is (str/includes? content "first day of the week")))))

(deftest ^:parallel context-injection-skips-non-user-last-message-test
  (testing "does not inject when last message is not :user"
    (let [parts (messages/build-message-history
                 {}
                 (memory/initialize [{:role :user :content "Hello"}
                                     {:role :assistant :content "Reply"}] {}))]
      (is (= "Hello" (:content (first parts)))))))

(deftest ^:parallel context-injection-targets-last-user-only-test
  (testing "injects into last user message only, not earlier ones"
    (let [parts (messages/build-message-history
                 {}
                 (memory/initialize [{:role :user :content "First"}
                                     {:role :assistant :content "Reply"}
                                     {:role :user :content "Second"}] {}))]
      (is (= "First" (:content (first parts))))
      (let [last-user (last-user-content parts)]
        (is (str/starts-with? last-user "<context>"))
        (is (str/ends-with? last-user "Second"))))))

(deftest ^:parallel context-injection-does-not-affect-assistant-parts-test
  (testing "context injection does not affect non-user parts"
    (let [parts (messages/build-message-history
                 {:user_is_viewing [{:type "dashboard" :id 1 :name "Sales"}]}
                 (-> (memory/initialize [{:role :user :content "Hello"}] {})
                     (memory/add-step [{:type :text :text "Response"}])))]
      (is (= "Response" (:text (second parts)))))))

(deftest ^:parallel context-injection-first-day-of-week-test
  (testing "includes first_day_of_week from context"
    (let [content (last-user-content
                   (messages/build-message-history
                    {:first_day_of_week "Monday"}
                    (memory/initialize [{:role :user :content "Hi"}] {})))]
      (is (str/includes? content "Monday"))))

  (testing "default first_day_of_week is Sunday"
    (let [content (last-user-content
                   (messages/build-message-history
                    {}
                    (memory/initialize [{:role :user :content "Hi"}] {})))]
      (is (str/includes? content "Sunday")))))

(deftest ^:parallel context-injection-viewing-dashboard-test
  (testing "includes viewing context when user is viewing a dashboard"
    (let [content (last-user-content
                   (messages/build-message-history
                    {:user_is_viewing [{:type "dashboard" :id 1 :name "Sales"}]}
                    (memory/initialize [{:role :user :content "Hi"}] {})))]
      (is (str/includes? content "Sales")))))

(deftest ^:parallel context-injection-viewing-native-query-test
  (testing "includes SQL and schema when user is viewing a native query"
    (let [mp (mt/metadata-provider)
          context {:user_is_viewing [{:type "adhoc",
                                      :query
                                      (lib/native-query mp "SELECT * FROM orders WHERE status = 'paid'")
                                      :sql_engine "postgres"
                                      :used_tables
                                      [{:description nil,
                                        :database_id 2,
                                        :name "orders",
                                        :fields
                                        [{:field_id "t23-0" :name "id" :display_name "ID" :type :number :database_type "int4" :semantic_type "pk"}
                                         {:field_id "t24-0" :name "status" :display_name "Status" :type :number :database_type "int4"}
                                         {:field_id "t25-0" :name "total" :display_name "Total" :type :number :database_type "int4"}]
                                        :type :table
                                        :database_schema "public",
                                        :display_name "Orders"}],
                                      :id "6ef8bcf9-383d-449f-827f-501c4d9b3564"}
                                     {:type "code_editor",
                                      :buffers [{:id "qb", :source {:language "sql", :database_id 2}, :cursor {:line 0, :column 0}}],
                                      :id "f4f07783-9276-403f-af5f-b9e7bd96fc88"}]}
          content (last-user-content
                   (messages/build-message-history
                    context
                    (memory/initialize [{:role :user :content "Fix my query"}] {})))]
      (is (str/includes? content "SQL editor"))
      (is (str/includes? content "SELECT * FROM orders WHERE status = 'paid'"))
      (is (str/includes? content "public.orders"))
      (is (str/includes? content "id, status, total"))
      (is (str/ends-with? content "Fix my query")))))

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
