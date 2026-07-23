(ns metabase.metabot.self.openrouter-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- fixture
  "Load cached OpenRouter raw chunks, or capture from the API when `*live*` / no cache."
  [fixture-name opts]
  (metabot.tu/raw-fixture fixture-name #(openrouter/openrouter-raw (merge {:model "anthropic/claude-haiku-4-5"} opts))))

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

(deftest ^:parallel parts->cc-messages-drops-reasoning-test
  (testing "reasoning parts are dropped, not turned into empty user messages"
    (is (=? [{:role "user" :content "Hello"}
             {:role "assistant" :content "Hi there!"}]
            (openrouter/parts->cc-messages
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

(deftest ^:parallel parts->cc-messages-nil-arguments-test
  (testing "tool call with nil arguments defaults to empty object JSON string"
    (is (=? [{:role       "assistant"
              :content    nil
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name      "todo_read"
                                       :arguments "{}"}}]}]
            (openrouter/parts->cc-messages
             [{:type :tool-input :id "call-1" :function "todo_read" :arguments nil}])))))

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
;;; openrouter-request-body prompt-caching tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-anthropic-system-cached-block-test
  (testing "anthropic models wrap the system prompt in a single cache_control content block"
    (let [body (openrouter/openrouter-request-body
                {:model  "anthropic/claude-haiku-4.5"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role    "system"
              :content [{:type          "text"
                         :text          "You are a helpful assistant."
                         :cache_control {:type "ephemeral"}}]}
             (-> body :messages first))))))

(deftest ^:parallel request-body-anthropic-system-sentinel-split-test
  (testing "anthropic models split the system prompt at the sentinel into cached prefix + uncached suffix"
    (let [body (openrouter/openrouter-request-body
                {:model  "anthropic/claude-haiku-4.5"
                 :system "Stable prefix content.\n\n<<<METABOT_CACHE_BREAKPOINT>>>\n\nDynamic suffix content."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role    "system"
              :content [{:type          "text"
                         :text          "Stable prefix content."
                         :cache_control {:type "ephemeral"}}
                        {:type "text"
                         :text "Dynamic suffix content."}]}
             (-> body :messages first))))))

(deftest ^:parallel request-body-openai-system-plain-string-test
  (testing "openai models get a plain string system message with no cache markup"
    (let [body (openrouter/openrouter-request-body
                {:model  "openai/gpt-5.4"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first))))))

(deftest ^:parallel request-body-no-system-message-test
  (testing "no system message is added when system is not provided"
    (let [body (openrouter/openrouter-request-body
                {:model "anthropic/claude-haiku-4.5"
                 :input [{:role :user :content "hi"}]})]
      (is (= ["user"] (map :role (:messages body)))))))

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
                             :tools [(metabot.tu/get-time-tool)]})]
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
                             :tools [(metabot.tu/get-time-tool)
                                     (metabot.tu/convert-currency-tool)]})]
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
                             :tools [(metabot.tu/get-time-tool)]})]
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
                               :tools [(metabot.tu/get-time-tool)]})
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

(deftest ^:parallel openrouter-usage-cache-tokens-test
  (testing "cache read/write counts are extracted from prompt_tokens_details"
    (let [chunks [{:id      "gen-1"
                   :model   "anthropic/claude-haiku-4.5"
                   :choices [{:delta {:role "assistant" :content "Hello"}}]}
                  {:choices [{:delta {} :finish_reason "stop"}]}
                  ;; OpenRouter reports usage on a final chunk with empty choices.
                  ;; prompt_tokens is the total input; the cache buckets are a
                  ;; subset breakdown, so no summing happens on our side.
                  {:choices []
                   :usage   {:prompt_tokens         5000
                             :completion_tokens     7
                             :total_tokens          5007
                             :prompt_tokens_details {:cached_tokens      4200
                                                     :cache_write_tokens 250
                                                     :audio_tokens       0}}}]
          usage  (->> (into [] (openrouter/openrouter->aisdk-chunks-xf) chunks)
                      (filter #(= :usage (:type %)))
                      first)]
      (is (=? {:type  :usage
               :id    "gen-1"
               :model "anthropic/claude-haiku-4.5"
               :usage {:promptTokens        5000
                       :completionTokens    7
                       :cacheCreationTokens 250
                       :cacheReadTokens     4200}}
              usage)))))

(deftest ^:parallel openrouter-usage-missing-cache-details-test
  (testing "missing prompt_tokens_details (or missing cache fields) default to 0"
    (let [chunks [{:id      "gen-2"
                   :model   "openai/gpt-5.4"
                   :choices [{:delta {:role "assistant" :content "Hi"}}]}
                  {:choices [{:delta {} :finish_reason "stop"}]}
                  {:choices []
                   :usage   {:prompt_tokens 10 :completion_tokens 3 :total_tokens 13}}]
          usage  (->> (into [] (openrouter/openrouter->aisdk-chunks-xf) chunks)
                      (filter #(= :usage (:type %)))
                      first)]
      (is (= {:promptTokens        10
              :completionTokens    3
              :cacheCreationTokens 0
              :cacheReadTokens     0}
             (:usage usage))))))

(deftest openrouter-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key "sk-or-v1-byok"
                                         llm.settings/llm-proxy-base-url    "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (with-redefs [self.core/sse-reducible identity
                        debug/capture-stream    (fn [r _] r)
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://openrouter.ai/api/v1/chat/completions"
                     :headers {"Authorization" "Bearer sk-or-v1-byok"}
                     :body    string?}
                    (openrouter/openrouter-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Does not fall back to ai proxy when BYOK is missing"
          (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No OpenRouter API key is set"
                 (openrouter/openrouter-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key nil
                                             llm.settings/llm-proxy-base-url    nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No OpenRouter API key is set"
                 (openrouter/openrouter-raw {:input [{:role :user :content "hi"}]})))))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for OpenRouter"
             (openrouter/list-models {:ai-proxy? true})))))))

(deftest openrouter-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for OpenRouter"
             (openrouter/openrouter-raw {:model "anthropic/claude-haiku-4.5"
                                         :input [{:role :user :content "hi"}]
                                         :ai-proxy? true})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models tests
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-filters-catalog-to-whitelist-test
  (testing "list-models keeps only whitelisted models sorted by id, preferring the catalog display name"
    (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key "sk-or-v1-test"]
      (with-redefs [http/request (fn [_]
                                   {:status 200
                                    :body   {:data [{:id "openai/gpt-5.6-sol"          :name "OpenAI: GPT-5.6 Sol"          :created 50}
                                                    {:id "openai/gpt-5.6-terra"        :name "OpenAI: GPT-5.6 Terra"        :created 49}
                                                    {:id "openai/gpt-5.6-luna"         :name "OpenAI: GPT-5.6 Luna"         :created 48}
                                                    {:id "qwen/qwen3.7-max"            :name "Qwen: Qwen3.7 Max"            :created 40}
                                                    {:id "openai/gpt-5.4"              :name "OpenAI: GPT-5.4"              :created 30}
                                                    {:id "openai/gpt-oss-120b:free"    :name "OpenAI: gpt-oss-120b (free)"  :created 28}
                                                    {:id "anthropic/claude-sonnet-4.6"                                      :created 25}
                                                    {:id "anthropic/claude-haiku-4.5"  :name "Anthropic: Claude Haiku 4.5"  :created 20}
                                                    {:id "openai/gpt-4o"               :name "OpenAI: GPT-4o"               :created 10}
                                                    {:id "openai/gpt-5"                :name "OpenAI: GPT-5"                :created 5}]}})]
        (is (= [{:id "anthropic/claude-haiku-4.5"  :display_name "Anthropic: Claude Haiku 4.5"}
                {:id "anthropic/claude-sonnet-4.6" :display_name "Claude Sonnet 4.6"}
                {:id "openai/gpt-5.4"              :display_name "OpenAI: GPT-5.4"}
                {:id "openai/gpt-5.6-luna"         :display_name "OpenAI: GPT-5.6 Luna"}
                {:id "openai/gpt-5.6-sol"          :display_name "OpenAI: GPT-5.6 Sol"}
                {:id "openai/gpt-5.6-terra"        :display_name "OpenAI: GPT-5.6 Terra"}]
               (:models (openrouter/list-models))))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key "sk-or-v1-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer sk-or-v1-explicit"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (openrouter/list-models {:credentials {:api-key "sk-or-v1-explicit"}})))))))

(deftest list-models-blank-credentials-fall-back-to-configured-key-test
  (testing "a blank passed-in api-key falls back to the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key "sk-or-v1-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer sk-or-v1-setting"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (openrouter/list-models {:credentials {:api-key ""}})))))))

(deftest list-models-blank-credentials-without-configured-key-test
  (testing "throws when the passed-in api-key is blank and no key is configured"
    (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No OpenRouter API key is set"
           (openrouter/list-models {:credentials {:api-key ""}}))))))
