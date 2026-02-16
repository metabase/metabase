(ns metabase-enterprise.metabot-v3.self.openrouter-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.self.core :as self.core]
   [metabase-enterprise.metabot-v3.self.openrouter :as openrouter]
   [metabase-enterprise.metabot-v3.test-util :as test-util]))

(set! *warn-on-reflection* true)

(defn- fixture
  "Load cached OpenRouter raw chunks, or capture from the API when `*live*` / no cache."
  [fixture-name opts]
  (test-util/raw-fixture fixture-name #(openrouter/openrouter-raw (merge {:model "anthropic/claude-haiku-4-5"} opts))))

;;; ──────────────────────────────────────────────────────────────────
;;; parts->cc-messages tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->cc-messages-plain-text-test
  (testing "plain user and assistant text"
    (is (=? [{:role "user" :content "Hello"}
             {:role "assistant" :content "Hi there!"}]
            (openrouter/parts->cc-messages
             [{:role :user :content "Hello"}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->cc-messages-tool-call-test
  (testing "text + tool call merges into single assistant message"
    (is (=? [{:role       "assistant"
              :content    "Let me check..."
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name "search"}}]}]
            (openrouter/parts->cc-messages
             [{:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->cc-messages-tool-call-only-test
  (testing "tool call without preceding text"
    (is (=? [{:role       "assistant"
              :content    nil
              :tool_calls [{:id "call-1"}]}]
            (openrouter/parts->cc-messages
             [{:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->cc-messages-tool-result-test
  (testing "tool output becomes tool role message"
    (is (=? [{:role         "tool"
              :tool_call_id "call-1"
              :content      "Found 42 results"}]
            (openrouter/parts->cc-messages
             [{:type :tool-output :id "call-1" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->cc-messages-multiple-tool-results-test
  (testing "multiple tool outputs become separate tool messages"
    (is (=? [{:role "tool" :tool_call_id "call-1" :content "Result 1"}
             {:role "tool" :tool_call_id "call-2" :content "Result 2"}]
            (openrouter/parts->cc-messages
             [{:type :tool-output :id "call-1" :result {:output "Result 1"}}
              {:type :tool-output :id "call-2" :result {:output "Result 2"}}])))))

(deftest ^:parallel parts->cc-messages-full-conversation-test
  (testing "full conversation with tool round-trip"
    (is (=? [{:role "user"      :content "What time is it in Kyiv?"}
             {:role "assistant" :tool_calls [{:id "call-1" :function {:name "get-time"}}]}
             {:role "tool"      :tool_call_id "call-1" :content "2025-02-13T14:00:00+02:00"}
             {:role "assistant" :content "It's 2:00 PM in Kyiv."}]
            (openrouter/parts->cc-messages
             [{:role :user :content "What time is it in Kyiv?"}
              {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
              {:type :tool-output :id "call-1" :result {:output "2025-02-13T14:00:00+02:00"}}
              {:type :text :text "It's 2:00 PM in Kyiv."}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel openrouter-text-conv-test
  (let [raw-chunks (fixture "openrouter-text"
                            {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})]
    (testing "text streaming chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start}
               {:type :text :text #"Hello, .*"}
               {:type  :usage :model string?
                :usage {:promptTokens pos-int? :completionTokens pos-int?}}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf)
                             (self.core/aisdk-xf))
                    raw-chunks))))))

(deftest ^:parallel openrouter-tool-calls-conv-test
  (let [raw-chunks (fixture "openrouter-tool-calls"
                            {:input [{:role :user :content "What time is it in Kyiv?"}]
                             :tools [#'test-util/get-time]})]
    (testing "single tool call chunks are mapped correctly"
      (is (=? [{:type :start} {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available} {:type :usage}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces tool-input + usage"
      (is (=? [{:type :start}
               {:type      :tool-input
                :id        string?
                :function  "get-time"
                :arguments {:tz string?}}
               {:type :usage :usage {:promptTokens pos-int? :completionTokens pos-int?}}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf)
                             (self.core/aisdk-xf))
                    raw-chunks))))))

(deftest ^:parallel openrouter-parallel-tool-calls-conv-test
  (let [raw-chunks (fixture "openrouter-parallel-tool-calls"
                            {:input [{:role :user :content "What time is it in Kyiv AND convert 100 EUR to USD? Use both tools in parallel."}]
                             :tools [#'test-util/get-time #'test-util/convert-currency]})]
    (testing "parallel tool calls are mapped correctly"
      (is (=? [{:type :start} {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available} {:type :usage}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces two tool-inputs + usage"
      (is (=? [{:type :start}
               {:type      :tool-input
                :function  "get-time"
                :arguments {:tz string?}}
               {:type      :tool-input
                :function  "convert-currency"
                :arguments {:amount number? :from string? :to string?}}
               {:type :usage :usage {:promptTokens pos-int? :completionTokens pos-int?}}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf)
                             (self.core/aisdk-xf))
                    raw-chunks))))))

(deftest ^:parallel openrouter-text-and-tool-calls-conv-test
  (let [raw-chunks (fixture "openrouter-text-and-tool-calls"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [#'test-util/get-time]})]
    (testing "text + tool call chunks contain expected types"
      (is (=? [{:type :start}
               {:type :text-start} {:type :text-delta} {:type :text-end}
               {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available}
               {:type :usage}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + tool-input + usage"
      (is (=? [{:type :start}
               {:type :text :text #"(?s)I'm going to get.*call now:"}
               {:type      :tool-input
                :function  "get-time"
                :arguments {:tz string?}}
               {:type  :usage :model string?
                :usage {:promptTokens pos-int? :completionTokens pos-int?}}]
              (into [] (comp (openrouter/openrouter->aisdk-chunks-xf)
                                 (self.core/aisdk-xf))
                        raw-chunks))))))

(deftest ^:parallel openrouter-lite-aisdk-xf-test
  (testing "lite-aisdk-xf streams text deltas for openrouter format"
    (let [raw-chunks (fixture "openrouter-text-and-tool-calls"
                              {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                               :tools [#'test-util/get-time]})
          res (into [] (comp (openrouter/openrouter->aisdk-chunks-xf)
                             (self.core/lite-aisdk-xf))
                    raw-chunks)]
      (is (=? [{:type :start}
               {:type      :tool-input
                :function  "get-time"
                :arguments {:tz string?}}
               {:type  :usage :model string?
                :usage {:promptTokens pos-int? :completionTokens pos-int?}}]
              (remove #(= (:type %) :text) res)))
      (is (< 10 (count (filter #(= (:type %) :text) res)))))))
