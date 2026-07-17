(ns metabase.metabot.self.openai-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- fixture
  "Load cached OpenAI raw chunks, or capture from the API when `*live*` / no cache."
  [fixture-name opts]
  (metabot.tu/raw-fixture fixture-name #(openai/openai-raw (merge {:model "gpt-4.1-mini"} opts))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel openai-text-conv-test
  (let [raw-chunks (fixture "openai-text"
                            {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})]
    (testing "text streaming chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start}
               {:type :text :text string?}
               {:type  :usage
                :usage {:promptTokens        pos-int?
                        :completionTokens    pos-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens     nat-int?}}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel openai-tool-calls-conv-test
  (let [raw-chunks (fixture "openai-tool-calls"
                            {:input [{:role :user :content "What time is it in Kyiv?"}]
                             :tools [(metabot.tu/get-time-tool)]})]
    (testing "tool call chunks are mapped correctly"
      (is (=? [{:type :start} {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available} {:type :usage}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces tool-input(s) + usage"
      (let [parts (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks)]
        (is (=? [{:type :start}
                 {:type :tool-input :function string? :arguments map?}]
                (take 2 parts)))
        (is (=? {:type  :usage
                 :usage {:promptTokens        pos-int?
                         :completionTokens    pos-int?
                         :cacheCreationTokens nat-int?
                         :cacheReadTokens     nat-int?}}
                (last parts)))))))

(deftest ^:parallel openai-structured-output-conv-test
  (let [raw-chunks (fixture "openai-structured-output"
                            {:input  [{:role :user :content "List the currencies for USA, Canada, and Mexico. Use three-letter country and currency codes."}]
                             :schema [:map {:closed true}
                                      [:currencies [:sequential
                                                    [:map {:closed true}
                                                     [:country [:string {:description "Three-letter code"}]]
                                                     [:currency [:string {:description "Three-letter code"}]]]]]]})]
    (testing "structured output chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start}
               {:type :text :text string?}
               {:type  :usage
                :usage {:promptTokens        pos-int?
                        :completionTokens    pos-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens     nat-int?}}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel openai-text-and-tool-calls-conv-test
  (let [raw-chunks (fixture "openai-text-and-tool-calls"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [(metabot.tu/get-time-tool)]})]
    (testing "text + tool call chunks contain expected types"
      (is (=? [{:type :start}
               {:type :text-start} {:type :text-delta} {:type :text-end}
               {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available}
               {:type :usage}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + tool-input + usage"
      (is (=? [{:type :start}
               {:type :text :text string?}
               {:type :tool-input :function "get-time" :arguments {:tz string?}}
               {:type  :usage
                :usage {:promptTokens        pos-int?
                        :completionTokens    pos-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens     nat-int?}}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel openai-reasoning-summaries-are-translated-test
  (testing "reasoning summary items (GPT-5 / o-series) become reasoning chunks"
    (let [base      (fixture "openai-text"
                             {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})
          ;; GPT-5 reasoning models emit a reasoning output item + summary deltas before the text
          reasoning [{:type "response.output_item.added" :item {:type "reasoning" :id "rs_1"}}
                     {:type "response.reasoning_summary_part.added" :item_id "rs_1"}
                     {:type "response.reasoning_summary_text.delta" :item_id "rs_1" :delta "Keeping it "}
                     {:type "response.reasoning_summary_text.delta" :item_id "rs_1" :delta "short"}
                     {:type "response.reasoning_summary_text.done"  :item_id "rs_1"}
                     {:type "response.output_item.done"  :item {:type "reasoning" :id "rs_1"}}]
          ;; splice the reasoning events in right after response.created
          patched   (into [] (mapcat (fn [chunk]
                                       (if (= (:type chunk) "response.created")
                                         (cons chunk reasoning)
                                         [chunk])))
                          base)]
      (testing "reasoning start/delta/end surround the text"
        (is (=? [{:type :start}
                 {:type :reasoning-start} {:type :reasoning-delta :delta "Keeping it "}
                 {:type :reasoning-end}
                 {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
                (into [] (comp (openai/openai->aisdk-chunks-xf) (m/distinct-by :type)) patched))))
      (testing "full pipeline coalesces the reasoning into one part"
        (is (=? [{:type :start}
                 {:type :reasoning :text "Keeping it short"}
                 {:type :text :text string?}
                 {:type  :usage
                  :usage {:promptTokens        pos-int?
                          :completionTokens    pos-int?
                          :cacheCreationTokens nat-int?
                          :cacheReadTokens     nat-int?}}]
                (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) patched)))))))

(deftest ^:parallel openai-response-failed-surfaces-error-test
  (testing "a terminal response.failed event is surfaced as an :error chunk (not silently dropped)"
    ;; The error detail lives nested under `response.error`, unlike a top-level `error` event. Without
    ;; this branch a mid-stream failure ends silently after :start, with no error shown to the user.
    (let [raw [{:type "response.created"     :response {:id "resp_1" :model "gpt-5.5"}}
               {:type "response.in_progress" :response {:id "resp_1"}}
               {:type "response.failed"
                :response {:id    "resp_1"
                           :error {:code    "server_error"
                                   :message "The server had an error while processing your request. Sorry about that!"}}}]]
      (is (=? [{:type :start}
               {:type      :error
                :errorText "The server had an error while processing your request. Sorry about that!"}]
              (into [] (openai/openai->aisdk-chunks-xf) raw))))))

(deftest ^:parallel openai-response-failed-without-message-test
  (testing "response.failed with no message falls back to the error code, then a generic message"
    (let [code-only [{:type "response.created" :response {:id "resp_1"}}
                     {:type "response.failed"  :response {:id "resp_1" :error {:code "server_error"}}}]
          bare      [{:type "response.created" :response {:id "resp_1"}}
                     {:type "response.failed"  :response {:id "resp_1"}}]]
      (is (=? [{:type :start} {:type :error :errorText "server_error"}]
              (into [] (openai/openai->aisdk-chunks-xf) code-only)))
      (is (=? [{:type :start} {:type :error :errorText "The model provider failed to complete the response"}]
              (into [] (openai/openai->aisdk-chunks-xf) bare))))))

(deftest ^:parallel openai-response-failed-reaches-wire-and-persistence-test
  (testing "a response.failed error flows through to both the wire line and the persisted turn error"
    ;; Regression guard: once collected into a part (via aisdk-chunks->part), the AI SDK v5 `:errorText`
    ;; chunk must become an `{:error {:message ...}}` part, which is what self.core/format-error-line and
    ;; metabot.api's finalize-turn `(:error part)` lookup both read.
    (let [raw   [{:type "response.created" :response {:id "resp_1" :model "gpt-5.5"}}
                 {:type "response.failed"  :response {:id "resp_1" :error {:code "server_error" :message "boom"}}}]
          parts (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) raw)
          err   (m/find-first #(= :error (:type %)) parts)]
      (testing "persistence picks up a non-nil error payload"
        (is (=? {:message "boom"} (:error err))))
      (testing "wire serializer emits the message (not an empty string)"
        (is (= (self.core/format-sse-event {:type "error" :errorText "boom"})
               (self.core/format-error-line err)))))))

(deftest ^:parallel openai-response-incomplete-keeps-partial-text-and-usage-test
  (testing "a terminal response.incomplete event keeps the partial text and still emits usage (not an error)"
    ;; An incomplete response (e.g. truncated at max_output_tokens) has valid partial output, so we record
    ;; its usage like a completed response rather than discarding it or surfacing an error.
    (let [raw-chunks (fixture "openai-text"
                              {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})
          ;; turn the terminal response.completed into a response.incomplete carrying the same usage
          patched    (mapv (fn [chunk]
                             (if (= (:type chunk) "response.completed")
                               (-> chunk
                                   (assoc :type "response.incomplete")
                                   (assoc-in [:response :incomplete_details] {:reason "max_output_tokens"}))
                               chunk))
                           raw-chunks)
          parts      (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) patched)]
      (is (=? [{:type :start}
               {:type :text :text string?}
               {:type  :usage
                :usage {:promptTokens        pos-int?
                        :completionTokens    pos-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens     nat-int?}}]
              parts))
      (testing "no error chunk is produced for an incomplete (partial-but-valid) response"
        (is (empty? (filter #(= :error (:type %)) parts)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Usage normalization tests
;;; ──────────────────────────────────────────────────────────────────

(defn- usage-from-patched-fixture
  "Run the openai-text fixture through the full pipeline with its terminal
  `response.completed` usage replaced by `usage`, and return the final
  AISDK `:usage` map."
  [usage]
  (let [raw-chunks (fixture "openai-text"
                            {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})
        patched    (mapv (fn [chunk]
                           (cond-> chunk
                             (= (:type chunk) "response.completed")
                             (assoc-in [:response :usage] usage)))
                         raw-chunks)
        parts      (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) patched)]
    (:usage (last parts))))

(deftest ^:parallel openai-usage-reports-cached-tokens-test
  (testing "cached tokens from input_tokens_details (Responses API shape) are reported as :cacheReadTokens"
    (is (= {:promptTokens        2006
            :completionTokens    300
            :cacheCreationTokens 0
            :cacheReadTokens     1920}
           (usage-from-patched-fixture
            {:input_tokens          2006
             :output_tokens         300
             :total_tokens          2306
             :input_tokens_details  {:cached_tokens 1920 :cache_write_tokens 0}
             :output_tokens_details {:reasoning_tokens 0}})))))

(deftest ^:parallel openai-usage-zero-cached-tokens-test
  (testing "input_token_details missing the cache keys reports zero cache tokens"
    (is (= {:promptTokens        20
            :completionTokens    8
            :cacheCreationTokens 0
            :cacheReadTokens     0}
           (usage-from-patched-fixture
            {:input_tokens          20
             :output_tokens         8
             :total_tokens          28
             :input_tokens_details  {}
             :output_tokens_details {:reasoning_tokens 3}})))))

(deftest ^:parallel openai-usage-cache-write-tokens-passthrough-test
  (testing "a (hypothetical) non-zero cache_write_tokens is passed through as :cacheCreationTokens"
    ;; The live API always reports cache_write_tokens 0 (automatic caching bills no writes), but if
    ;; OpenAI ever starts populating it we want the count to flow through rather than be dropped.
    (is (= {:promptTokens        20
            :completionTokens    8
            :cacheCreationTokens 7
            :cacheReadTokens     0}
           (usage-from-patched-fixture
            {:input_tokens          20
             :output_tokens         8
             :total_tokens          28
             :input_tokens_details  {:cached_tokens 0 :cache_write_tokens 7}
             :output_tokens_details {:reasoning_tokens 3}})))))

;;; ──────────────────────────────────────────────────────────────────
;;; parts->openai-input tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->openai-input-plain-text-test
  (testing "user and assistant text"
    (is (=? [{:role "user" :content "Hello"}
             {:type "message" :role "assistant" :content [{:type "output_text" :text "Hi!"}]}]
            (openai/parts->openai-input
             [{:role :user :content "Hello"}
              {:type :text :text "Hi!"}])))))

(deftest ^:parallel parts->openai-input-tool-call-test
  (testing "tool call becomes function_call item"
    (is (=? [{:type    "function_call"
              :call_id "call-1"
              :name    "search"}]
            (openai/parts->openai-input
             [{:type :tool-input :id "call-1" :function "search" :arguments {:q "test"}}])))))

(deftest ^:parallel parts->openai-input-tool-result-test
  (testing "tool output becomes function_call_output item"
    (is (=? [{:type    "function_call_output"
              :call_id "call-1"
              :output  "Found 42"}]
            (openai/parts->openai-input
             [{:type :tool-output :id "call-1" :result {:output "Found 42"}}])))))

(deftest ^:parallel parts->openai-input-full-conversation-test
  (testing "full conversation with tool round-trip"
    (is (=? [{:role "user" :content "What time is it?"}
             {:type "function_call" :call_id "call-1" :name "get-time"}
             {:type "function_call_output" :call_id "call-1" :output "14:00"}
             {:type "message" :role "assistant" :content [{:type "output_text" :text "It's 2 PM."}]}]
            (openai/parts->openai-input
             [{:role :user :content "What time is it?"}
              {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
              {:type :tool-output :id "call-1" :result {:output "14:00"}}
              {:type :text :text "It's 2 PM."}])))))

(deftest ^:parallel parts->openai-input-error-result-test
  (testing "tool error is formatted in output"
    (is (=? [{:type   "function_call_output"
              :call_id "call-1"
              :output  #"Error:.*failed"}]
            (openai/parts->openai-input
             [{:type :tool-output :id "call-1" :error {:message "Tool failed"}}])))))

(deftest ^:parallel parts->openai-input-drops-reasoning-test
  (testing "reasoning parts are not replayed to the Responses API"
    (is (=? [{:type "message" :role "assistant" :content [{:type "output_text" :text "hi"}]}]
            (openai/parts->openai-input
             [{:type :reasoning :id "r1" :text "thinking" :provider-metadata {}}
              {:type :text :text "hi"}])))))

(deftest ^:parallel openai-request-body-reasoning-gating-test
  (testing "reasoning models ask for a summary; others don't"
    (let [reasoning #(:reasoning (openai/openai-request-body {:model % :input []}))]
      (is (= {:summary "auto"} (reasoning "gpt-5.4")))
      (is (= {:summary "auto"} (reasoning "gpt-5.6-sol")))
      (is (= {:summary "auto"} (reasoning "o3")))
      (testing "bedrock/azure vendor prefix is stripped"
        (is (= {:summary "auto"} (reasoning "openai.gpt-5.4"))))
      (testing "non-reasoning models get no reasoning param"
        (is (nil? (reasoning "gpt-4.1")))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models filtering tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel supported-model?-test
  (testing "whitelisted models are supported"
    (doseq [id ["gpt-5.6-sol" "gpt-5.6-terra" "gpt-5.6-luna" "gpt-5.5" "gpt-5.4-mini"]]
      (is (true? (#'openai/supported-model? {:id id})) id)))
  (testing "non-white-listed models are not supported"
    (doseq [id ["gpt-5" "gpt-4.1" "gpt-4.1-mini" "gpt-4o" "o3" "text-embedding-3-small"]]
      (is (false? (#'openai/supported-model? {:id id})) id))))

(deftest list-models-filters-catalog-to-whitelist-test
  (testing "list-models keeps only whitelisted models sorted by id"
    (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-test"]
      (with-redefs [http/request (fn [_]
                                   {:status 200
                                    :body   {:data [{:id "gpt-5.6-sol"            :created 40}
                                                    {:id "gpt-5.6-luna"           :created 39}
                                                    {:id "gpt-5-mini"             :created 30}
                                                    {:id "gpt-5"                  :created 28}
                                                    {:id "gpt-5.4"                :created 25}
                                                    {:id "gpt-4.1"                :created 20}
                                                    {:id "gpt-4.1-mini"           :created 19}
                                                    {:id "gpt-4o-mini"            :created 18}
                                                    {:id "o3"                     :created 15}
                                                    {:id "text-embedding-3-small" :created 8}
                                                    {:id "whisper-1"              :created 7}]}})]
        (is (= [{:id "gpt-5.4" :display_name "GPT-5.4"}
                {:id "gpt-5.6-luna" :display_name "GPT-5.6 Luna"}
                {:id "gpt-5.6-sol" :display_name "GPT-5.6 Sol"}]
               (:models (openai/list-models))))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer sk-explicit"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (openai/list-models {:credentials {:api-key "sk-explicit"}})))))))

(deftest list-models-blank-credentials-fall-back-to-configured-key-test
  (testing "a blank passed-in api-key falls back to the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer sk-setting"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (openai/list-models {:credentials {:api-key ""}})))))))

(deftest list-models-blank-credentials-without-configured-key-test
  (testing "throws when the passed-in api-key is blank and no key is configured"
    (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No OpenAI API key is set"
           (openai/list-models {:credentials {:api-key ""}}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; temperature support tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel model-supports-temperature?-test
  (testing "non-reasoning models accept an explicit temperature"
    (doseq [model ["gpt-4.1-mini" "gpt-4.1" "gpt-4o" "gpt-3.5-turbo"]]
      (is (true? (#'openai/model-supports-temperature? model))
          model)))
  (testing "GPT-5 family and o-series reasoning models do not"
    (doseq [model ["gpt-5" "gpt-5-mini" "gpt-5-nano" "gpt-5-2025-08-07" "gpt-5.6-sol"
                   "o1" "o1-mini" "o3" "o3-mini" "o4-mini"]]
      (is (false? (#'openai/model-supports-temperature? model))
          model))))

(deftest ^:parallel model-supports-temperature?-bedrock-prefixed-test
  (testing "Bedrock mantle ids carry an openai. vendor prefix that is stripped before the check"
    (doseq [model ["openai.gpt-5.5" "openai.gpt-5.4" "openai.gpt-5.5-2026-04-23" "openai.o3-mini"]]
      (is (false? (#'openai/model-supports-temperature? model))
          model))
    (is (true? (#'openai/model-supports-temperature? "openai.gpt-4.1-mini")))))

(deftest temperature-omitted-for-reasoning-models-test
  (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-test"]
    (let [request-body (fn [opts]
                         (with-redefs [self.core/sse-reducible identity
                                       debug/capture-stream    (fn [r _] r)
                                       http/request            (fn [req] {:body req})]
                           (json/decode+kw (:body (openai/openai-raw
                                                   (merge {:input [{:role :user :content "hi"}]
                                                           :temperature 0.3}
                                                          opts))))))]
      (testing "temperature is sent for a non-reasoning model"
        (is (= 0.3 (:temperature (request-body {:model "gpt-4.1-mini"})))))
      (testing "temperature is omitted for a GPT-5 model"
        (is (not (contains? (request-body {:model "gpt-5"}) :temperature))))
      (testing "temperature is omitted for an o-series model"
        (is (not (contains? (request-body {:model "o3-mini"}) :temperature)))))))

(deftest openai-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-ant-byok"
                                         llm.settings/llm-proxy-base-url "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (with-redefs [self.core/sse-reducible identity
                        debug/capture-stream    (fn [r _] r)
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.openai.com/v1/responses"
                     :headers {"Authorization" "Bearer sk-ant-byok"}
                     :body    string?}
                    (openai/openai-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Does not fall back to ai proxy when BYOK is missing"
          (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No OpenAI API key is set"
                 (openai/openai-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil
                                             llm.settings/llm-proxy-base-url nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No OpenAI API key is set"
                 (openai/openai-raw {:input [{:role :user :content "hi"}]})))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; AI proxy (unsupported)
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for OpenAI"
             (openai/list-models {:ai-proxy? true})))))))

(deftest openai-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for OpenAI"
             (openai/openai-raw {:model     "gpt-4.1-mini"
                                 :input     [{:role :user :content "hi"}]
                                 :ai-proxy? true})))))))
