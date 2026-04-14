(ns metabase.metabot.self.claude-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- fixture
  "Load cached Claude raw chunks, or capture from the API when `*live*` / no cache."
  [fixture-name opts]
  (metabot.tu/raw-fixture fixture-name #(claude/claude-raw (merge {:model "claude-haiku-4-5"} opts))))

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
                             :tools [(metabot.tu/get-time-tool)]})]
    (testing "tool input chunks are mapped correctly"
      (is (=? [{:type :start} {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available} {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces tool-input-start + tool-input + usage"
      (is (=? [{:type :start}
               {:type :tool-input-start :function string?}
               {:type :tool-input :arguments map?}
               {:type :usage :model string? :usage {:promptTokens pos-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-text-and-tool-input-conv-test
  (let [raw-chunks (fixture "claude-text-and-tool-input"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [(metabot.tu/get-time-tool)]})]
    (testing "text + tool input chunks are mapped correctly"
      (is (=? [{:type :start}
               {:type :text-start} {:type :text-delta} {:type :text-end}
               {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available}
               {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + tool-input-start + tool-input + usage"
      (is (=? [{:type :start}
               {:type :text :text string?}
               {:type :tool-input-start :function "get-time"}
               {:type :tool-input :function "get-time" :arguments {:tz string?}}
               {:type :usage :model string? :usage {:promptTokens pos-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-lite-aisdk-xf-test
  (let [raw-chunks (fixture "claude-text-and-tool-input"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [(metabot.tu/get-time-tool)]})
        res        (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/lite-aisdk-xf)) raw-chunks)]
    (testing "lite-aisdk-xf emits eager tool-input-start then finalized tool-input"
      (is (=? [{:type :start}
               {:type :tool-input-start :function "get-time"}
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

(deftest ^:parallel parts->claude-messages-nil-arguments-test
  (testing "tool call with nil arguments defaults to empty object"
    (is (=? [{:role    "assistant"
              :content [{:type  "tool_use"
                         :id    "call-1"
                         :name  "todo-read"
                         :input {}}]}]
            (claude/parts->claude-messages
             [{:type :tool-input :id "call-1" :function "todo-read" :arguments nil}])))))

(deftest ^:parallel parts->claude-messages-error-result-test
  (testing "tool error is formatted as error string"
    (is (=? [{:role    "user"
              :content [{:type    "tool_result"
                         :content #"Error:.*failed"}]}]
            (claude/parts->claude-messages
             [{:type :tool-output :id "call-1" :error {:message "Tool failed"}}])))))

(deftest ^:parallel parts->claude-messages-blank-content-test
  (testing "blank string content is filtered out during merge"
    ;; When Claude streams tokens, whitespace-only chunks can arrive separately.
    ;; These must not become bare strings in the content array (which would cause
    ;; API errors), so they are dropped during merge-consecutive.
    (is (=? [{:role    "assistant"
              :content [{:type "text" :text "Hello"}
                        {:type "text" :text "world"}]}]
            (claude/parts->claude-messages
             [{:type :text :text "Hello"}
              {:type :text :text " "}
              {:type :text :text "world"}]))))
  (testing "empty string content is also filtered out"
    (is (=? [{:role    "assistant"
              :content [{:type "text" :text "Hello"}]}]
            (claude/parts->claude-messages
             [{:type :text :text ""}
              {:type :text :text "Hello"}
              {:type :text :text ""}])))))

(deftest claude-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-byok"
                                         llm.settings/llm-proxy-base-url    "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (with-redefs [self.core/sse-reducible identity
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.anthropic.com/v1/messages"
                     :headers {"x-api-key" "sk-ant-byok"}
                     :body    string?}
                    (claude/claude-raw {:input [{:role :user :content "hi"}]})))))

        (testing "Uses ai proxy when explicitly requested"
          (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)
                        self.core/sse-reducible             identity
                        http/request                        (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://proxy.example/anthropic/v1/messages"
                     :headers {"x-metabase-instance-token" "proxy-token"}
                     :body    string?}
                    (claude/claude-raw {:input [{:role :user :content "hi"}]
                                        :ai-proxy? true})))))

        (testing "Does not fall back to ai proxy when BYOK is missing"
          (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Anthropic API key is set"
                 (claude/claude-raw {:input [{:role :user :content "hi"}]})))))

        (testing "Throws an error if nothing is defined"
          (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url nil]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"No Anthropic API key is set"
                   (claude/claude-raw {:input [{:role :user :content "hi"}]}))))))))))

(deftest claude-list-models-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-byok"
                                         llm.settings/llm-proxy-base-url    "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (with-redefs [http/request (fn [req]
                                       (is (=? {:method  :get
                                                :url     "https://api.anthropic.com/v1/models"
                                                :headers {"anthropic-version" "2023-06-01"
                                                          "x-api-key"        "sk-ant-byok"}}
                                               req))
                                       {:body "{\"data\":[]}"})]
            (is (= {:models []}
                   (claude/list-models {})))))

        (testing "Uses ai proxy when explicitly requested"
          (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)
                        http/request                        (fn [req]
                                                              (is (=? {:method  :get
                                                                       :url     "https://proxy.example/anthropic/v1/models"
                                                                       :headers {"anthropic-version"         "2023-06-01"
                                                                                 "x-metabase-instance-token" "proxy-token"}}
                                                                      req))
                                                              {:body "{\"data\":[]}"})]
            (is (= {:models []}
                   (claude/list-models {:ai-proxy? true})))))

        (testing "Does not fall back to ai proxy when BYOK is missing"
          (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Anthropic API key is set"
                 (claude/list-models {})))))

        (testing "Throws an error if nothing is defined"
          (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url nil]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"No Anthropic API key is set"
                   (claude/list-models {}))))))))))
