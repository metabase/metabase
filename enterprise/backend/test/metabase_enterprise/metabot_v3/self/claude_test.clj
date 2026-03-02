(ns metabase-enterprise.metabot-v3.self.claude-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.self.claude :as claude]
   [metabase-enterprise.metabot-v3.self.core :as self.core]
   [metabase-enterprise.metabot-v3.test-util :as test-util]))

(set! *warn-on-reflection* true)

(defn- fixture
  "Load cached Claude raw chunks, or capture from the API when `*live*` / no cache."
  [fixture-name opts]
  (test-util/raw-fixture fixture-name #(claude/claude-raw (merge {:model "claude-haiku-4-5"} opts))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel claude-text-conv-test
  (let [raw-chunks (fixture "claude-text"
                            {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})]
    (testing "text streaming chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start :id string?}
               {:type :text :id string? :text string?}
               {:type :usage :id string? :model string? :usage {:promptTokens pos-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-tool-input-conv-test
  (let [raw-chunks (fixture "claude-tool-input"
                            {:input [{:role :user :content "What time is it in Kyiv?"}]
                             :tools [#'test-util/get-time]})]
    (testing "tool input chunks are mapped correctly"
      (is (=? [{:type :start} {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available} {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces tool-input + usage"
      (is (=? [{:type :start}
               {:type :tool-input :arguments map?}
               {:type :usage :model string? :usage {:promptTokens pos-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-text-and-tool-input-conv-test
  (let [raw-chunks (fixture "claude-text-and-tool-input"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [#'test-util/get-time]})]
    (testing "text + tool input chunks are mapped correctly"
      (is (=? [{:type :start}
               {:type :text-start} {:type :text-delta} {:type :text-end}
               {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available}
               {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + tool-input + usage"
      (is (=? [{:type :start}
               {:type :text :text string?}
               {:type :tool-input :function "get-time" :arguments {:tz string?}}
               {:type :usage :model string? :usage {:promptTokens pos-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-lite-aisdk-xf-test
  (let [raw-chunks (fixture "claude-text-and-tool-input"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [#'test-util/get-time]})
        res        (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/lite-aisdk-xf)) raw-chunks)]
    (testing "lite-aisdk-xf collects tool inputs"
      (is (=? [{:type :start}
               {:type :tool-input :function "get-time" :arguments {:tz string?}}
               {:type :usage :model string? :usage {:promptTokens pos-int?}}]
              (remove #(= :text (:type %)) res))))
    (testing "lite-aisdk-xf streams text deltas"
      (is (< 10 (count (filter #(= :text (:type %)) res)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; parts->claude-messages tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->claude-messages-plain-text-test
  (testing "user and assistant text"
    (is (=? [{:role "user" :content [{:type "text" :text "Hello"}]}
             {:role "assistant" :content [{:type "text" :text "Hi there!"}]}]
            (claude/parts->claude-messages
             [{:role :user :content "Hello"}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->claude-messages-tool-call-test
  (testing "text + tool call merge into single assistant message with content blocks"
    (is (=? [{:role    "assistant"
              :content [{:type "text" :text "Let me check..."}
                        {:type  "tool_use"
                         :id    "call-1"
                         :name  "search"
                         :input {:query "revenue"}}]}]
            (claude/parts->claude-messages
             [{:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->claude-messages-tool-result-test
  (testing "tool output becomes user message with tool_result content block"
    (is (=? [{:role    "user"
              :content [{:type        "tool_result"
                         :tool_use_id "call-1"
                         :content     "Found 42 results"}]}]
            (claude/parts->claude-messages
             [{:type :tool-output :id "call-1" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->claude-messages-full-conversation-test
  (testing "full conversation with tool round-trip"
    (is (=? [{:role "user" :content [{:type "text" :text "What time is it?"}]}
             {:role    "assistant"
              :content [{:type "text" :text "Let me check..."}
                        {:type "tool_use" :id "call-1" :name "get-time"}]}
             {:role    "user"
              :content [{:type "tool_result" :tool_use_id "call-1"}]}
             {:role "assistant" :content [{:type "text" :text "It's 2:00 PM in Kyiv."}]}]
            (claude/parts->claude-messages
             [{:role :user :content "What time is it?"}
              {:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
              {:type :tool-output :id "call-1" :result {:output "2025-02-13T14:00:00+02:00"}}
              {:type :text :text "It's 2:00 PM in Kyiv."}])))))

(deftest ^:parallel parts->claude-messages-error-result-test
  (testing "tool error is formatted as error string"
    (is (=? [{:role    "user"
              :content [{:type    "tool_result"
                         :content #"Error:.*failed"}]}]
            (claude/parts->claude-messages
             [{:type :tool-output :id "call-1" :error {:message "Tool failed"}}])))))
