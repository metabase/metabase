(ns metabase.metabot.self.zai-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.zai :as zai]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; zai-request-body tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-default-model-test
  (testing "the model defaults to glm-5.2"
    (is (= "glm-5.2"
           (:model (zai/zai-request-body {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-system-plain-string-test
  (testing "the system prompt stays a plain string (Z.AI prompt caching is automatic server-side)"
    (let [body (zai/zai-request-body
                {:model  "glm-5.2"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first))))))

(deftest ^:parallel request-body-streaming-usage-test
  (testing "requests stream and ask for usage in the final chunk"
    (is (=? {:stream         true
             :stream_options {:include_usage true}}
            (zai/zai-request-body {:model "glm-5.2"
                                   :input [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are sent in OpenAI function format with tool_choice auto"
    (is (=? {:tools       [{:type     "function"
                            :function {:name "get-time"}}]
             :tool_choice "auto"}
            (zai/zai-request-body {:model "glm-5.2"
                                   :input [{:role :user :content "hi"}]
                                   :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a schema forces a structured_output tool call"
    (is (=? {:tools       [{:type     "function"
                            :function {:name       "structured_output"
                                       :parameters {:type "object"}}}]
             :tool_choice "required"}
            (zai/zai-request-body {:model  "glm-5.2"
                                   :input  [{:role :user :content "hi"}]
                                   :schema {:type "object"
                                            :properties {:title {:type "string"}}}})))))

(deftest ^:parallel request-body-temperature-and-max-tokens-test
  (testing "temperature and max-tokens pass through"
    (is (=? {:temperature 0.2
             :max_tokens  128}
            (zai/zai-request-body {:model       "glm-5.2"
                                   :input       [{:role :user :content "hi"}]
                                   :temperature 0.2
                                   :max-tokens  128})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;;
;;; Z.AI streams the same Chat Completions chunk dialect the adapter shares
;;; with OpenRouter; these chunks are synthetic but mirror the shapes Z.AI
;;; sends: reasoning deltas (`delta.reasoning_content`) when thinking mode is
;;; on, tool calls arriving whole in one delta (`tool_stream` defaults to
;;; false), and usage on the final chunk alongside `finish_reason`.
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel zai-text-conv-test
  (let [chunks [{:id      "20260723-1"
                 :model   "glm-5.2"
                 :choices [{:delta {:role "assistant" :content "Hello"}}]}
                {:choices [{:delta {:content " there"}}]}
                {:choices [{:delta {} :finish_reason "stop"}]
                 :usage   {:prompt_tokens 12 :completion_tokens 2 :total_tokens 14}}]]
    (testing "text streaming chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (zai/zai->aisdk-chunks-xf) (m/distinct-by :type)) chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start}
               {:type :text :text "Hello there"}
               {:type  :usage :model "glm-5.2"
                :usage {:promptTokens 12 :completionTokens 2}}]
              (into [] (comp (zai/zai->aisdk-chunks-xf)
                             (self.core/aisdk-xf))
                    chunks))))))

(deftest ^:parallel zai-reasoning-deltas-ignored-test
  (testing "thinking-mode reasoning_content deltas produce no text blocks"
    (is (=? [{:type :start}
             {:type :text :text "4"}
             {:type :usage}]
            (into [] (comp (zai/zai->aisdk-chunks-xf)
                           (self.core/aisdk-xf))
                  [{:id      "20260723-2"
                    :model   "glm-5.2"
                    :choices [{:delta {:role "assistant" :reasoning_content "Let me think"}}]}
                   {:choices [{:delta {:reasoning_content " about 2+2."}}]}
                   {:choices [{:delta {:content "4"}}]}
                   {:choices [{:delta {} :finish_reason "stop"}]
                    :usage   {:prompt_tokens 8 :completion_tokens 1 :total_tokens 9}}])))))

(deftest ^:parallel zai-whole-tool-call-conv-test
  (testing "a tool call arriving whole in one delta (tool_stream false) is mapped correctly"
    (is (=? [{:type :start}
             {:type      :tool-input
              :id        "call_1"
              :function  "get-time"
              :arguments {:tz "Europe/Kyiv"}}
             {:type :usage :usage {:promptTokens 20 :completionTokens 5}}]
            (into [] (comp (zai/zai->aisdk-chunks-xf)
                           (self.core/aisdk-xf))
                  [{:id      "20260723-3"
                    :model   "glm-5.2"
                    :choices [{:delta {:role       "assistant"
                                       :tool_calls [{:id       "call_1"
                                                     :type     "function"
                                                     :function {:name      "get-time"
                                                                :arguments "{\"tz\":\"Europe/Kyiv\"}"}}]}}]}
                   {:choices [{:delta {} :finish_reason "tool_calls"}]
                    :usage   {:prompt_tokens 20 :completion_tokens 5 :total_tokens 25}}])))))

(deftest ^:parallel zai-streamed-tool-call-conv-test
  (testing "tool-call argument deltas (tool_stream true) accumulate into one tool-input"
    (is (=? [{:type :start}
             {:type      :tool-input
              :id        "call_2"
              :function  "get-time"
              :arguments {:tz "Europe/Kyiv"}}]
            (into [] (comp (zai/zai->aisdk-chunks-xf)
                           (self.core/aisdk-xf))
                  [{:id      "20260723-4"
                    :model   "glm-5.2"
                    :choices [{:delta {:role       "assistant"
                                       :tool_calls [{:id       "call_2"
                                                     :type     "function"
                                                     :function {:name      "get-time"
                                                                :arguments "{\"tz\":"}}]}}]}
                   {:choices [{:delta {:tool_calls [{:function {:arguments "\"Europe/Kyiv\"}"}}]}}]}
                   {:choices [{:delta {} :finish_reason "tool_calls"}]}])))))

(deftest ^:parallel zai-usage-cached-tokens-test
  (testing "automatic context-cache reads are extracted from prompt_tokens_details; Z.AI reports no cache writes"
    (let [usage (->> (into [] (zai/zai->aisdk-chunks-xf)
                           [{:id      "20260723-5"
                             :model   "glm-5.2"
                             :choices [{:delta {:role "assistant" :content "Hi"}}]}
                            {:choices [{:delta {} :finish_reason "stop"}]
                             :usage   {:prompt_tokens         5000
                                       :completion_tokens     7
                                       :total_tokens          5007
                                       :prompt_tokens_details {:cached_tokens 4200}}}])
                     (filter #(= :usage (:type %)))
                     first)]
      (is (=? {:type  :usage
               :id    "20260723-5"
               :model "glm-5.2"
               :usage {:promptTokens        5000
                       :completionTokens    7
                       :cacheCreationTokens 0
                       :cacheReadTokens     4200}}
              usage)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth tests
;;; ──────────────────────────────────────────────────────────────────

(deftest zai-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key    "zai-key.byok"
                                         llm.settings/llm-proxy-base-url "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (with-redefs [self.core/sse-reducible identity
                        debug/capture-stream    (fn [r _] r)
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.z.ai/api/paas/v4/chat/completions"
                     :headers {"Authorization" "Bearer zai-key.byok"}
                     :body    string?}
                    (zai/zai-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Does not fall back to ai proxy when BYOK is missing"
          (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Z\.AI API key is set"
                 (zai/zai-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key    nil
                                             llm.settings/llm-proxy-base-url nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Z\.AI API key is set"
                 (zai/zai-raw {:input [{:role :user :content "hi"}]})))))))))

(deftest zai-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for Z\.AI"
             (zai/zai-raw {:model "glm-5.2"
                           :input [{:role :user :content "hi"}]
                           :ai-proxy? true})))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for Z\.AI"
             (zai/list-models {:ai-proxy? true})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models tests
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-filters-catalog-to-whitelist-test
  (testing "list-models keeps only whitelisted models, falling back to the whitelist display name"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key "zai-key.test"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:method  :get
                                                          :url     "https://api.z.ai/api/paas/v4/models"
                                                          :headers {"Authorization" "Bearer zai-key.test"}}
                                                         req))
                                                 {:status 200 :body {:data [{:id "glm-4.7"}
                                                                            {:id "glm-5.2"}
                                                                            {:id "some-other-model"}]}})]
        (is (= {:models [{:id "glm-5.2" :display_name "GLM-5.2"}]}
               (zai/list-models)))))))

(deftest list-models-prefers-catalog-display-name-test
  (testing "a display name carried by the catalog entry wins over the whitelist fallback"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key "zai-key.test"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 {:status 200 :body {:data [{:id "glm-5.2" :name "GLM-5.2 (catalog)"}]}})]
        (is (= {:models [{:id "glm-5.2" :display_name "GLM-5.2 (catalog)"}]}
               (zai/list-models)))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key "zai-key.setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer zai-key.explicit"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (zai/list-models {:credentials {:api-key "zai-key.explicit"}})))))))

(deftest list-models-blank-credentials-fall-back-to-configured-key-test
  (testing "a blank passed-in api-key falls back to the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key "zai-key.setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer zai-key.setting"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (zai/list-models {:credentials {:api-key ""}})))))))

(deftest list-models-blank-credentials-without-configured-key-test
  (testing "throws when the passed-in api-key is blank and no key is configured"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Z\.AI API key is set"
           (zai/list-models {:credentials {:api-key ""}}))))))

(deftest list-models-401-maps-to-invalid-key-message-test
  (testing "a 401 from Z.AI surfaces as the canonical invalid-key message"
    (mt/with-temporary-setting-values [llm.settings/llm-zai-api-key "zai-key.expired"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 (throw (ex-info "clj-http: status 401"
                                                                 {:status 401
                                                                  :body   "{\"error\":{\"code\":\"401\",\"message\":\"token expired or incorrect\"}}"})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Z\.AI API key expired or invalid"
             (zai/list-models)))))))
