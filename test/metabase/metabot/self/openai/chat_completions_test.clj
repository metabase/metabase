(ns metabase.metabot.self.openai.chat-completions-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as cc]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; parts->cc-messages tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->cc-messages-plain-text-test
  (testing "plain user and assistant text"
    (is (=? [{:role "user" :content "Hello"}
             {:role "assistant" :content "Hi there!"}]
            (cc/parts->cc-messages
             [{:role :user :content "Hello"}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->cc-messages-tool-call-test
  (testing "text + tool call merges into single assistant message"
    (is (=? [{:role       "assistant"
              :content    "Let me check..."
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name "search"}}]}]
            (cc/parts->cc-messages
             [{:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->cc-messages-tool-result-test
  (testing "tool output becomes tool role message"
    (is (=? [{:role         "tool"
              :tool_call_id "call-1"
              :content      "Found 42 results"}]
            (cc/parts->cc-messages
             [{:type :tool-output :id "call-1" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->cc-messages-nil-arguments-test
  (testing "tool call with nil arguments defaults to empty object JSON string"
    (is (=? [{:role       "assistant"
              :content    nil
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name      "todo_read"
                                       :arguments "{}"}}]}]
            (cc/parts->cc-messages
             [{:type :tool-input :id "call-1" :function "todo_read" :arguments nil}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; request-body tests — no vendor-specific concerns
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-plain-string-system-test
  (testing "the system prompt is a plain string, with no cache_control markup for any model"
    (doseq [model ["anthropic/claude-haiku-4.5" "openai/gpt-5.4" "llama-3.3-70b"]]
      (let [body (cc/chat-completions-request-body
                  {:model  model
                   :system "You are a helpful assistant."
                   :input  [{:role :user :content "hi"}]})]
        (is (= {:role "system" :content "You are a helpful assistant."}
               (-> body :messages first))
            (str "model " model " should get a plain-string system message"))))))

(deftest ^:parallel request-body-no-system-message-test
  (testing "no system message is added when system is not provided"
    (let [body (cc/chat-completions-request-body
                {:model "my-model"
                 :input [{:role :user :content "hi"}]})]
      (is (= ["user"] (map :role (:messages body)))))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are converted to the Chat Completions function shape with auto tool_choice"
    (let [body (cc/chat-completions-request-body
                {:model "my-model"
                 :input [{:role :user :content "hi"}]
                 :tools [{:tool-name "get_weather"
                          :doc       "Get the weather."
                          :schema    [:=> [:cat [:map [:city :string]]] :any]
                          :fn        identity}]})]
      (is (=? {:tool_choice "auto"
               :tools       [{:type     "function"
                              :function {:name        "get_weather"
                                         :description "Get the weather."
                                         :parameters  {:type "object"}}}]}
              body)))))

(deftest ^:parallel request-body-structured-output-test
  (testing "a :schema forces a structured_output tool call"
    (let [body (cc/chat-completions-request-body
                {:model  "my-model"
                 :input  [{:role :user :content "hi"}]
                 :schema {:type "object" :properties {:sql {:type "string"}}}})]
      (is (=? {:tool_choice "required"
               :tools       [{:type     "function"
                              :function {:name       "structured_output"
                                         :parameters {:type "object"}}}]}
              body)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests (synthetic chunks — no live API)
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel text-conv-test
  (testing "text streaming chunks are mapped correctly through the full pipeline"
    (let [chunks [{:id "cc-1" :model "m" :choices [{:delta {:role "assistant" :content "Hel"}}]}
                  {:choices [{:delta {:content "lo"}}]}
                  {:choices [{:delta {} :finish_reason "stop"}]}
                  {:choices [] :usage {:prompt_tokens 5 :completion_tokens 2 :total_tokens 7}}]]
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (cc/cc->aisdk-chunks-xf) (m/distinct-by :type)) chunks)))
      (is (=? [{:type :start}
               {:type :text :text "Hello"}
               {:type :usage :model "m" :usage {:promptTokens 5 :completionTokens 2}}]
              (into [] (comp (cc/cc->aisdk-chunks-xf) (self.core/aisdk-xf)) chunks))))))

(deftest ^:parallel tool-call-conv-test
  (testing "a streamed tool call is mapped to a tool-input part"
    (let [chunks [{:id "cc-2" :model "m"
                   :choices [{:delta {:tool_calls [{:id "call-1" :function {:name "get_time" :arguments ""}}]}}]}
                  {:choices [{:delta {:tool_calls [{:function {:arguments "{\"tz\":\"UTC\"}"}}]}}]}
                  {:choices [{:delta {} :finish_reason "tool_calls"}]}
                  {:choices [] :usage {:prompt_tokens 8 :completion_tokens 4 :total_tokens 12}}]]
      (is (=? [{:type :start}
               {:type      :tool-input
                :id        "call-1"
                :function  "get_time"
                :arguments {:tz "UTC"}}
               {:type :usage :usage {:promptTokens 8 :completionTokens 4}}]
              (into [] (comp (cc/cc->aisdk-chunks-xf) (self.core/aisdk-xf)) chunks))))))

(deftest ^:parallel usage-cache-tokens-test
  (testing "cache read/write counts are extracted from prompt_tokens_details, missing fields default to 0"
    (let [chunks [{:id "cc-3" :model "m" :choices [{:delta {:role "assistant" :content "Hi"}}]}
                  {:choices [{:delta {} :finish_reason "stop"}]}
                  {:choices [] :usage {:prompt_tokens         5000
                                       :completion_tokens     7
                                       :total_tokens          5007
                                       :prompt_tokens_details {:cached_tokens 4200 :cache_write_tokens 250}}}]
          usage  (->> (into [] (cc/cc->aisdk-chunks-xf) chunks)
                      (filter #(= :usage (:type %)))
                      first)]
      (is (= {:promptTokens        5000
              :completionTokens    7
              :cacheCreationTokens 250
              :cacheReadTokens     4200}
             (:usage usage))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth / HTTP tests
;;; ──────────────────────────────────────────────────────────────────

(deftest chat-completions-raw-uses-configured-settings-test
  (testing "the base URL and API key from settings drive the request"
    (mt/with-temporary-setting-values [llm.settings/llm-chat-completions-api-base-url "https://api.example.com/v1"
                                       llm.settings/llm-chat-completions-api-key      "secret-key"]
      (with-redefs [self.core/sse-reducible identity
                    debug/capture-stream    (fn [r _] r)
                    http/request            (fn [req] {:body req})]
        (is (=? {:method  :post
                 :url     "https://api.example.com/v1/chat/completions"
                 :headers {"Authorization" "Bearer secret-key"}
                 :body    string?}
                (cc/chat-completions-raw {:model "m" :input [{:role :user :content "hi"}]})))))))

(deftest chat-completions-raw-missing-base-url-test
  (testing "a missing base URL throws before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-chat-completions-api-base-url nil
                                       llm.settings/llm-chat-completions-api-key      "secret-key"]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"No Chat Completions base URL is set"
             (cc/chat-completions-raw {:model "m" :input [{:role :user :content "hi"}]})))))))

(deftest chat-completions-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for the Chat Completions provider"
           (cc/chat-completions-raw {:model "m" :input [{:role :user :content "hi"}] :ai-proxy? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models tests
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-returns-full-catalog-test
  (testing "list-models returns the endpoint's whole catalog, id-sorted, id as display name (no whitelist)"
    (mt/with-temporary-setting-values [llm.settings/llm-chat-completions-api-base-url "https://api.example.com/v1"
                                       llm.settings/llm-chat-completions-api-key      "secret-key"]
      (with-redefs [http/request (fn [req]
                                   (is (=? {:method  :get
                                            :url     "https://api.example.com/v1/models"
                                            :headers {"Authorization" "Bearer secret-key"}}
                                           req))
                                   {:status 200 :body {:data [{:id "zeta"} {:id "alpha"} {:id "beta"}]}})]
        (is (= {:models [{:id "alpha" :display_name "alpha"}
                         {:id "beta"  :display_name "beta"}
                         {:id "zeta"  :display_name "zeta"}]}
               (cc/list-models)))))))

(deftest list-models-explicit-credentials-test
  (testing "credentials in opts override the configured settings"
    (mt/with-temporary-setting-values [llm.settings/llm-chat-completions-api-base-url "https://saved.example/v1"
                                       llm.settings/llm-chat-completions-api-key      "saved-key"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:url     "https://override.example/v1/models"
                                                          :headers {"Authorization" "Bearer override-key"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (cc/list-models {:credentials {:api-key "override-key" :base-url "https://override.example/v1"}})))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for the Chat Completions provider"
           (cc/list-models {:ai-proxy? true}))))))
