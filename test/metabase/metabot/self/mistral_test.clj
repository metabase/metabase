(ns metabase.metabot.self.mistral-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; mistral-request-body tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-default-model-test
  (testing "the model defaults to mistral-medium-3-5"
    (is (= "mistral-medium-3-5"
           (:model (mistral/mistral-request-body {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-system-plain-string-test
  (testing "the system prompt stays a plain string"
    (let [body (mistral/mistral-request-body
                {:model  "mistral-medium-3-5"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first))))))

(deftest ^:parallel request-body-no-stream-options-test
  (testing "requests stream but omit stream_options — Mistral 422s on it and reports usage on the final chunk anyway"
    (let [body (mistral/mistral-request-body {:model "mistral-medium-3-5"
                                              :input [{:role :user :content "hi"}]})]
      (is (true? (:stream body)))
      (is (not (contains? body :stream_options))))))

(deftest ^:parallel request-body-prompt-cache-key-test
  (testing "a :prompt-cache-key is forwarded as prompt_cache_key, absent otherwise"
    (is (= "d34d4c93-a5cc-4d5e-b0a6-6b8f89525b48"
           (:prompt_cache_key (mistral/mistral-request-body
                               {:model            "mistral-medium-3-5"
                                :input            [{:role :user :content "hi"}]
                                :prompt-cache-key "d34d4c93-a5cc-4d5e-b0a6-6b8f89525b48"}))))
    (is (not (contains? (mistral/mistral-request-body {:model "mistral-medium-3-5"
                                                       :input [{:role :user :content "hi"}]})
                        :prompt_cache_key)))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are sent in OpenAI function format with tool_choice auto"
    (is (=? {:tools       [{:type     "function"
                            :function {:name "get-time"}}]
             :tool_choice "auto"}
            (mistral/mistral-request-body {:model "mistral-medium-3-5"
                                           :input [{:role :user :content "hi"}]
                                           :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a schema forces a structured_output tool call"
    (is (=? {:tools       [{:type     "function"
                            :function {:name       "structured_output"
                                       :parameters {:type "object"}}}]
             :tool_choice "required"}
            (mistral/mistral-request-body {:model  "mistral-medium-3-5"
                                           :input  [{:role :user :content "hi"}]
                                           :schema {:type "object"
                                                    :properties {:title {:type "string"}}}})))))

(deftest ^:parallel request-body-temperature-and-max-tokens-test
  (testing "temperature and max-tokens pass through"
    (is (=? {:temperature 0.2
             :max_tokens  128}
            (mistral/mistral-request-body {:model       "mistral-medium-3-5"
                                           :input       [{:role :user :content "hi"}]
                                           :temperature 0.2
                                           :max-tokens  128})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;;
;;; Mistral streams the same Chat Completions chunk dialect the adapter
;;; shares with OpenRouter and Z.AI; these chunks are synthetic but mirror
;;; the shapes Mistral sends: tool calls arriving whole in one delta, and
;;; usage on the final chunk alongside `finish_reason` (no stream_options
;;; needed).
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel mistral-text-conv-test
  (let [chunks [{:id      "20260724-1"
                 :model   "mistral-medium-3-5"
                 :choices [{:delta {:role "assistant" :content "Hello"}}]}
                {:choices [{:delta {:content " there"}}]}
                {:choices [{:delta {} :finish_reason "stop"}]
                 :usage   {:prompt_tokens 12 :completion_tokens 2 :total_tokens 14}}]]
    (testing "text streaming chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (mistral/mistral->aisdk-chunks-xf) (m/distinct-by :type)) chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start}
               {:type :text :text "Hello there"}
               {:type  :usage :model "mistral-medium-3-5"
                :usage {:promptTokens 12 :completionTokens 2}}]
              (into [] (comp (mistral/mistral->aisdk-chunks-xf)
                             (self.core/aisdk-xf))
                    chunks))))))

(deftest ^:parallel mistral-whole-tool-call-conv-test
  (testing "a tool call arriving whole in one delta is mapped correctly"
    (is (=? [{:type :start}
             {:type      :tool-input
              :id        "call_1"
              :function  "get-time"
              :arguments {:tz "Europe/Kyiv"}}
             {:type :usage :usage {:promptTokens 20 :completionTokens 5}}]
            (into [] (comp (mistral/mistral->aisdk-chunks-xf)
                           (self.core/aisdk-xf))
                  [{:id      "20260724-2"
                    :model   "mistral-medium-3-5"
                    :choices [{:delta {:role       "assistant"
                                       :tool_calls [{:id       "call_1"
                                                     :type     "function"
                                                     :function {:name      "get-time"
                                                                :arguments "{\"tz\":\"Europe/Kyiv\"}"}}]}}]}
                   {:choices [{:delta {} :finish_reason "tool_calls"}]
                    :usage   {:prompt_tokens 20 :completion_tokens 5 :total_tokens 25}}])))))

(deftest ^:parallel mistral-streamed-tool-call-conv-test
  (testing "tool-call argument deltas accumulate into one tool-input"
    (is (=? [{:type :start}
             {:type      :tool-input
              :id        "call_2"
              :function  "get-time"
              :arguments {:tz "Europe/Kyiv"}}]
            (into [] (comp (mistral/mistral->aisdk-chunks-xf)
                           (self.core/aisdk-xf))
                  [{:id      "20260724-3"
                    :model   "mistral-medium-3-5"
                    :choices [{:delta {:role       "assistant"
                                       :tool_calls [{:id       "call_2"
                                                     :type     "function"
                                                     :function {:name      "get-time"
                                                                :arguments "{\"tz\":"}}]}}]}
                   {:choices [{:delta {:tool_calls [{:function {:arguments "\"Europe/Kyiv\"}"}}]}}]}
                   {:choices [{:delta {} :finish_reason "tool_calls"}]}])))))

(deftest ^:parallel mistral-usage-final-chunk-test
  (testing "usage is extracted from the final chunk; without a cache hit Mistral reports cached_tokens 0"
    ;; Caching is opt-in via the `prompt_cache_key` request param, which the adapter sends only when
    ;; a :prompt-cache-key (the conversation id) is present.
    (let [usage (->> (into [] (mistral/mistral->aisdk-chunks-xf)
                           [{:id      "20260724-4"
                             :model   "mistral-medium-3-5"
                             :choices [{:delta {:role "assistant" :content "Hi"}}]}
                            {:choices [{:delta {} :finish_reason "stop"}]
                             :usage   {:prompt_tokens         5000
                                       :completion_tokens     7
                                       :total_tokens          5007
                                       :prompt_tokens_details {:cached_tokens 0}}}])
                     (filter #(= :usage (:type %)))
                     first)]
      (is (=? {:type  :usage
               :id    "20260724-4"
               :model "mistral-medium-3-5"
               :usage {:promptTokens        5000
                       :completionTokens    7
                       :cacheCreationTokens 0
                       :cacheReadTokens     0}}
              usage)))))

(deftest ^:parallel mistral-usage-cached-tokens-test
  (testing "prompt-cache reads are extracted from prompt_tokens_details; Mistral reports no cache writes"
    (let [usage (->> (into [] (mistral/mistral->aisdk-chunks-xf)
                           [{:id      "20260724-5"
                             :model   "mistral-medium-3-5"
                             :choices [{:delta {:role "assistant" :content "OK"}}]}
                            {:choices [{:delta {} :finish_reason "stop"}]
                             :usage   {:prompt_tokens         8060
                                       :completion_tokens     2
                                       :total_tokens          8062
                                       :prompt_tokens_details {:cached_tokens 8048}}}])
                     (filter #(= :usage (:type %)))
                     first)]
      (is (=? {:type  :usage
               :id    "20260724-5"
               :model "mistral-medium-3-5"
               :usage {:promptTokens        8060
                       :completionTokens    2
                       :cacheCreationTokens 0
                       :cacheReadTokens     8048}}
              usage)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth tests
;;; ──────────────────────────────────────────────────────────────────

(deftest mistral-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-byok"
                                         llm.settings/llm-proxy-base-url  "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (with-redefs [self.core/sse-reducible identity
                        debug/capture-stream    (fn [r _] r)
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.mistral.ai/v1/chat/completions"
                     :headers {"Authorization" "Bearer mistral-key-byok"}
                     :body    string?}
                    (mistral/mistral-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Does not fall back to ai proxy when BYOK is missing"
          (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Mistral API key is set"
                 (mistral/mistral-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key nil
                                             llm.settings/llm-proxy-base-url  nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Mistral API key is set"
                 (mistral/mistral-raw {:input [{:role :user :content "hi"}]})))))))))

(deftest mistral-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for Mistral"
             (mistral/mistral-raw {:model "mistral-medium-3-5"
                                   :input [{:role :user :content "hi"}]
                                   :ai-proxy? true})))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for Mistral"
             (mistral/list-models {:ai-proxy? true})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models tests
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-filters-catalog-to-whitelist-test
  (testing "list-models keeps only whitelisted models with the whitelist display name"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-test"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:method  :get
                                                          :url     "https://api.mistral.ai/v1/models"
                                                          :headers {"Authorization" "Bearer mistral-key-test"}}
                                                         req))
                                                 {:status 200 :body {:data [{:id "mistral-large-2512"}
                                                                            {:id "mistral-medium-3-5"}
                                                                            {:id "codestral-2508"}]}})]
        (is (= {:models [{:id "mistral-medium-3-5" :display_name "Mistral Medium 3.5"}]}
               (mistral/list-models)))))))

(deftest list-models-matches-aliases-and-dedupes-test
  (testing "a catalog entry whose alias is whitelisted resolves to the whitelisted id, deduped across entries"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-test"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 {:status 200
                                                  :body   {:data [{:id      "mistral-medium-latest"
                                                                   :aliases ["mistral-medium-3-5"]}
                                                                  {:id      "mistral-medium-3-5"
                                                                   :aliases ["mistral-medium-latest"]}]}})]
        (is (= {:models [{:id "mistral-medium-3-5" :display_name "Mistral Medium 3.5"}]}
               (mistral/list-models)))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer mistral-key-explicit"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (mistral/list-models {:credentials {:api-key "mistral-key-explicit"}})))))))

(deftest list-models-blank-credentials-fall-back-to-configured-key-test
  (testing "a blank passed-in api-key falls back to the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer mistral-key-setting"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (mistral/list-models {:credentials {:api-key ""}})))))))

(deftest list-models-blank-credentials-without-configured-key-test
  (testing "throws when the passed-in api-key is blank and no key is configured"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Mistral API key is set"
           (mistral/list-models {:credentials {:api-key ""}}))))))

(deftest list-models-401-maps-to-invalid-key-message-test
  (testing "a 401 from Mistral surfaces as the canonical invalid-key message"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-expired"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 (throw (ex-info "clj-http: status 401"
                                                                 {:status 401
                                                                  :body   "{\"message\":\"Unauthorized\"}"})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Mistral API key expired or invalid"
             (mistral/list-models)))))))
