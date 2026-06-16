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
                :usage {:promptTokens     pos-int?
                        :completionTokens pos-int?}}]
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
                 :usage {:promptTokens     pos-int?
                         :completionTokens pos-int?}}
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
                :usage {:promptTokens     pos-int?
                        :completionTokens pos-int?}}]
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
                :usage {:promptTokens     pos-int?
                        :completionTokens pos-int?}}]
              (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel openai-reasoning-items-are-ignored-test
  (testing "reasoning output items (emitted by GPT-5 / o-series models) are skipped without breaking the stream"
    (let [base      (fixture "openai-text"
                             {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})
          ;; GPT-5 reasoning models emit a reasoning output item before the text message item
          reasoning [{:type "response.output_item.added" :item {:type "reasoning" :id "rs_1"}}
                     {:type "response.output_item.done"  :item {:type "reasoning" :id "rs_1"}}]
          ;; splice the reasoning events in right after response.created
          patched   (into [] (mapcat (fn [chunk]
                                       (if (= (:type chunk) "response.created")
                                         (cons chunk reasoning)
                                         [chunk])))
                          base)]
      (testing "no reasoning artifacts leak into the translated chunk types"
        (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
                (into [] (comp (openai/openai->aisdk-chunks-xf) (m/distinct-by :type)) patched))))
      (testing "full pipeline still produces text + usage"
        (is (=? [{:type :start}
                 {:type :text :text string?}
                 {:type  :usage
                  :usage {:promptTokens     pos-int?
                          :completionTokens pos-int?}}]
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
        (is (= "3:\"boom\"" (self.core/format-error-line err)))))))

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
                :usage {:promptTokens     pos-int?
                        :completionTokens pos-int?}}]
              parts))
      (testing "no error chunk is produced for an incomplete (partial-but-valid) response"
        (is (empty? (filter #(= :error (:type %)) parts)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Usage normalization tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel openai-usage-strips-nested-details-test
  (testing "nested *_details maps from reasoning models are stripped"
    (let [raw-chunks (fixture "openai-text"
                              {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})
          ;; Patch the last chunk to include nested usage details like reasoning models return
          patched    (mapv (fn [chunk]
                             (if (= (:type chunk) "response.completed")
                               (assoc-in chunk [:response :usage]
                                         {:input_tokens          20
                                          :output_tokens         8
                                          :total_tokens          28
                                          :input_tokens_details  {:cached_tokens 5 :audio_tokens 0}
                                          :output_tokens_details {:reasoning_tokens 3 :audio_tokens 0}})
                               chunk))
                           raw-chunks)
          parts      (into [] (comp (openai/openai->aisdk-chunks-xf) (self.core/aisdk-xf)) patched)
          usage      (:usage (last parts))]
      ;; no nested maps — safe for merge-with + in accumulate-usage-xf
      (is (= {:promptTokens 20
              :completionTokens 8}
             usage)))))

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

;;; ──────────────────────────────────────────────────────────────────
;;; temperature support tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel model-supports-temperature?-test
  (testing "non-reasoning models accept an explicit temperature"
    (doseq [model ["gpt-4.1-mini" "gpt-4.1" "gpt-4o" "gpt-3.5-turbo"]]
      (is (true? (#'openai/model-supports-temperature? model))
          model)))
  (testing "GPT-5 family and o-series reasoning models do not"
    (doseq [model ["gpt-5" "gpt-5-mini" "gpt-5-nano" "gpt-5-2025-08-07"
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
        (testing "Uses ai proxy when explicitly requested"
          (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
            (with-redefs [self.core/sse-reducible identity
                          debug/capture-stream    (fn [r _] r)
                          http/request            (fn [req] {:body req})]
              (is (=? {:method  :post
                       :url     "https://proxy.example/openai/v1/responses"
                       :headers {"x-metabase-instance-token" "proxy-token"}
                       :body    string?}
                      (openai/openai-raw {:input [{:role :user :content "hi"}]
                                          :ai-proxy? true}))))))
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
