(ns metabase.metabot.self.openai.chat-completions-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.test-util :as metabot.tu]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; parts->cc-messages tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->cc-messages-plain-text-test
  (testing "plain user and assistant text"
    (is (=? [{:role "user" :content "Hello"}
             {:role "assistant" :content "Hi there!"}]
            (chat-completions/parts->cc-messages
             [{:role :user :content "Hello"}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->cc-messages-drops-reasoning-test
  (testing "reasoning parts are dropped, not turned into empty user messages"
    (is (=? [{:role "user" :content "Hello"}
             {:role "assistant" :content "Hi there!"}]
            (chat-completions/parts->cc-messages
             [{:role :user :content "Hello"}
              {:type :reasoning :id "r1" :text "thinking"}
              {:type :reasoning :id "r1" :text "" :provider-metadata {:anthropic {:signature "abc"}}}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->cc-messages-tool-call-test
  (testing "text + tool call merges into single assistant message"
    (is (=? [{:role       "assistant"
              :content    "Let me check..."
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name "search"}}]}]
            (chat-completions/parts->cc-messages
             [{:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->cc-messages-tool-call-only-test
  (testing "tool call without preceding text"
    (is (=? [{:role       "assistant"
              :content    nil
              :tool_calls [{:id "call-1"}]}]
            (chat-completions/parts->cc-messages
             [{:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->cc-messages-tool-result-test
  (testing "tool output becomes tool role message"
    (is (=? [{:role         "tool"
              :tool_call_id "call-1"
              :content      "Found 42 results"}]
            (chat-completions/parts->cc-messages
             [{:type :tool-output :id "call-1" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->cc-messages-multiple-tool-results-test
  (testing "multiple tool outputs become separate tool messages"
    (is (=? [{:role "tool" :tool_call_id "call-1" :content "Result 1"}
             {:role "tool" :tool_call_id "call-2" :content "Result 2"}]
            (chat-completions/parts->cc-messages
             [{:type :tool-output :id "call-1" :result {:output "Result 1"}}
              {:type :tool-output :id "call-2" :result {:output "Result 2"}}])))))

(deftest ^:parallel parts->cc-messages-nil-arguments-test
  (testing "tool call with nil arguments defaults to empty object JSON string"
    (is (=? [{:role       "assistant"
              :content    nil
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name      "todo_read"
                                       :arguments "{}"}}]}]
            (chat-completions/parts->cc-messages
             [{:type :tool-input :id "call-1" :function "todo_read" :arguments nil}])))))

(deftest ^:parallel parts->cc-messages-full-conversation-test
  (testing "full conversation with tool round-trip"
    (is (=? [{:role "user"      :content "What time is it in Kyiv?"}
             {:role "assistant" :tool_calls [{:id "call-1" :function {:name "get-time"}}]}
             {:role "tool"      :tool_call_id "call-1" :content "2025-02-13T14:00:00+02:00"}
             {:role "assistant" :content "It's 2:00 PM in Kyiv."}]
            (chat-completions/parts->cc-messages
             [{:role :user :content "What time is it in Kyiv?"}
              {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
              {:type :tool-output :id "call-1" :result {:output "2025-02-13T14:00:00+02:00"}}
              {:type :text :text "It's 2:00 PM in Kyiv."}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; request-body tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-system-plain-string-test
  (testing "the generic dialect keeps the system prompt a plain string"
    (let [body (chat-completions/request-body
                {:model  "some/model"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first))))))

(deftest ^:parallel request-body-no-system-message-test
  (testing "no system message is added when system is not provided"
    (let [body (chat-completions/request-body
                {:model "some/model"
                 :input [{:role :user :content "hi"}]})]
      (is (= ["user"] (map :role (:messages body)))))))

(deftest ^:parallel request-body-streaming-usage-test
  (testing "requests stream and ask for usage in the final chunk"
    (is (=? {:stream         true
             :stream_options {:include_usage true}}
            (chat-completions/request-body {:model "some/model"
                                            :input [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are sent in OpenAI function format with tool_choice auto"
    (is (=? {:tools       [{:type     "function"
                            :function {:name "get-time"}}]
             :tool_choice "auto"}
            (chat-completions/request-body {:model "some/model"
                                            :input [{:role :user :content "hi"}]
                                            :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-tool-choice-passthrough-test
  (testing "an explicit tool_choice passes through when tools are present"
    (is (=? {:tool_choice "required"}
            (chat-completions/request-body {:model       "some/model"
                                            :input       [{:role :user :content "hi"}]
                                            :tools       [(metabot.tu/get-time-tool)]
                                            :tool_choice "required"})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a schema forces a structured_output tool call"
    (is (=? {:tools       [{:type     "function"
                            :function {:name       "structured_output"
                                       :parameters {:type "object"}}}]
             :tool_choice "required"}
            (chat-completions/request-body {:model  "some/model"
                                            :input  [{:role :user :content "hi"}]
                                            :schema {:type       "object"
                                                     :properties {:title {:type "string"}}}})))))

(deftest ^:parallel request-body-temperature-and-max-tokens-test
  (testing "temperature and max-tokens pass through"
    (is (=? {:temperature 0.2
             :max_tokens  128}
            (chat-completions/request-body {:model       "some/model"
                                            :input       [{:role :user :content "hi"}]
                                            :temperature 0.2
                                            :max-tokens  128})))))
