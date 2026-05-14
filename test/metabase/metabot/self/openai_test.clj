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
   [metabase.test :as mt]))

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

(deftest openai-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (with-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
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
