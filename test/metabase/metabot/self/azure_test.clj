(ns metabase.metabot.self.azure-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private test-base-url "https://my-resource.services.ai.azure.com/openai")

;;; ──────────────────────────────────────────────────────────────────
;;; Connect validation (list-models)
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-missing-credentials-test
  (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      nil
                                     llm.settings/llm-azure-api-base-url nil]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Azure credentials are not configured"
         (azure/list-models {:model "openai/gpt-4.1-mini"})))))

(deftest list-models-requires-both-credential-fields-test
  (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      "azure-key"
                                     llm.settings/llm-azure-api-base-url nil]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Azure credentials are not configured"
         (azure/list-models {:model "openai/gpt-4.1-mini"})))))

(deftest list-models-openai-family-round-trips-the-catalog-endpoint-test
  (testing "validation for the openai family is a GET /v1/models against the candidate credentials"
    (let [captured (atom nil)]
      (with-redefs [http/request (fn [req] (reset! captured req) {:status 200 :body {:data []}})]
        (is (= {:models []}
               (azure/list-models {:credentials {:api-key "override-key" :base-url test-base-url}
                                   :model       "openai/gpt-4.1-mini"})))
        (is (=? {:method  :get
                 :url     (str test-base-url "/v1/models")
                 :headers {"Authorization" "Bearer override-key"}}
                @captured))))))

(deftest list-models-anthropic-family-accepts-the-model-free-400-test
  (testing "the anthropic surface has no GET routes; an empty-body POST /v1/messages 400s from
            the messages route itself, which proves surface + auth without invoking a model"
    (let [captured (atom nil)]
      (with-redefs [http/request (fn [req]
                                   (reset! captured req)
                                   (throw (ex-info "HTTP error" {:status 400
                                                                 :body   "{\"error\":{\"code\":\"no_model_name\"}}"})))]
        (is (= {:models []}
               (azure/list-models {:credentials {:api-key  "override-key"
                                                 :base-url "https://my-resource.services.ai.azure.com/anthropic"}
                                   :model       "anthropic/claude-sonnet-4-5"})))
        (is (=? {:method  :post
                 :url     "https://my-resource.services.ai.azure.com/anthropic/v1/messages"
                 :body    "{}"
                 :headers {"Authorization"     "Bearer override-key"
                           "anthropic-version" "2023-06-01"}}
                @captured))))))

(deftest list-models-anthropic-family-still-rejects-bad-keys-test
  (testing "auth is checked before routing on the anthropic surface, so a bad key 401s and is translated"
    (with-redefs [http/request (fn [_] (throw (ex-info "HTTP error" {:status 401 :body "{}"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Azure rejected the API key for this resource"
           (azure/list-models {:credentials {:api-key  "bogus"
                                             :base-url "https://my-resource.services.ai.azure.com/anthropic"}
                               :model       "anthropic/claude-sonnet-4-5"}))))))

(deftest list-models-falls-back-to-the-configured-azure-model-test
  (testing "without a candidate model, validation uses the saved Azure model's family"
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "azure/openai/gpt-4.1-mini"
                                       llm.settings/llm-azure-api-key        "saved-key"
                                       llm.settings/llm-azure-api-base-url   test-base-url]
      (let [captured (atom nil)]
        (with-redefs [http/request (fn [req] (reset! captured req) {:status 200 :body {:data []}})]
          (is (= {:models []} (azure/list-models)))
          (is (=? {:method :get
                   :url    (str test-base-url "/v1/models")}
                  @captured)))))))

(deftest list-models-skips-validation-without-any-model-test
  (testing "with no candidate model and a non-Azure provider configured, there is no surface to probe"
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (= {:models []} (azure/list-models)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; API family dispatch and request construction
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-raw-request!
  "Run `azure-raw` with HTTP stubbed out and return the clj-http request map it would send."
  ([opts] (captured-raw-request! test-base-url opts))
  ([base-url opts]
   (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      "azure-key"
                                      llm.settings/llm-azure-api-base-url base-url]
     (with-redefs [self.core/sse-reducible identity
                   debug/capture-stream    (fn [r _] r)
                   http/request            (fn [req] {:body req})]
       (azure/azure-raw opts)))))

(deftest anthropic-family-dispatches-to-messages-api-test
  (let [req  (captured-raw-request! "https://my-resource.services.ai.azure.com/anthropic"
                                    {:model  "anthropic/my-claude-deployment"
                                     :system "be brief"
                                     :input  [{:role :user :content "hi"}]})
        body (json/decode+kw (:body req))]
    (is (= "https://my-resource.services.ai.azure.com/anthropic/v1/messages" (:url req)))
    (is (=? {"Authorization"     "Bearer azure-key"
             "anthropic-version" "2023-06-01"
             "Content-Type"      "application/json"}
            (:headers req)))
    (testing "the body is the shared Anthropic Messages request with the deployment name as the model"
      (is (=? {:model    "my-claude-deployment"
               :stream   true
               :system   [{:type "text" :text "be brief" :cache_control {:type "ephemeral"}}]
               :messages [{:role "user" :content [{:type "text" :text "hi"}]}]}
              body)))))

(deftest openai-family-dispatches-to-responses-api-test
  (let [req  (captured-raw-request! {:model       "openai/gpt-5-deployment"
                                     :system      "be brief"
                                     :input       [{:role :user :content "hi"}]
                                     :temperature 0.3
                                     :max-tokens  128})
        body (json/decode+kw (:body req))]
    (is (= (str test-base-url "/v1/responses") (:url req)))
    (is (=? {"Authorization" "Bearer azure-key"
             "Content-Type"  "application/json"}
            (:headers req)))
    (is (=? {:model             "gpt-5-deployment"
             :stream            true
             :instructions      "be brief"
             :max_output_tokens 128
             :input             [{:role "user" :content "hi"}]}
            body))
    (testing "temperature is omitted when the deployment is named after a reasoning model"
      (is (not (contains? body :temperature))))))

(deftest unsupported-family-throws-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Unsupported Azure model \"gemini/some-deployment\". Only anthropic/\* and openai/\* models are supported."
       (captured-raw-request! {:model "gemini/some-deployment"
                               :input [{:role :user :content "hi"}]}))))

;;; ──────────────────────────────────────────────────────────────────
;;; AI proxy (unsupported)
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      nil
                                       llm.settings/llm-azure-api-base-url nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for Azure"
             (azure/list-models {:model "openai/gpt-4.1-mini" :ai-proxy? true})))))))

(deftest azure-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      nil
                                       llm.settings/llm-azure-api-base-url nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for Azure"
             (azure/azure-raw {:model     "openai/gpt-4.1-mini"
                               :input     [{:role :user :content "hi"}]
                               :ai-proxy? true})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Stream translation (xf selection by model family)
;;; ──────────────────────────────────────────────────────────────────

(defn- sse-response-for
  "A stubbed clj-http response whose body is an SSE stream of `events`."
  [events]
  {:status 200
   :body   (java.io.ByteArrayInputStream.
            (.getBytes (str/join (map #(str "data: " (json/encode %) "\n\n") events)) "UTF-8"))})

(defn- aisdk-parts-for! [model events]
  (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      "azure-key"
                                     llm.settings/llm-azure-api-base-url test-base-url]
    (with-redefs [debug/capture-stream (fn [r _] r)
                  http/request         (fn [_] (sse-response-for events))]
      (into [] (self.core/aisdk-xf)
            (azure/azure {:model model
                          :input [{:role :user :content "hi"}]})))))

(deftest anthropic-family-uses-claude-stream-translation-test
  (is (=? [{:type :start :id "msg_1"}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "anthropic/my-claude-deployment"
           [{:type "message_start" :message {:id "msg_1" :model "claude-sonnet-4-5" :usage {:input_tokens 3}}}
            {:type "content_block_start" :index 0 :content_block {:type "text"}}
            {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "pong"}}
            {:type "content_block_stop" :index 0}
            {:type "message_delta" :delta {:stop_reason "end_turn"} :usage {:input_tokens 3 :output_tokens 2}}
            {:type "message_stop"}]))))

(deftest openai-family-uses-openai-stream-translation-test
  (is (=? [{:type :start :id "resp_1"}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "openai/gpt-4.1-mini"
           [{:type "response.created" :response {:id "resp_1" :model "gpt-4.1-mini"}}
            {:type "response.output_item.added" :item {:type "message" :id "item_1"} :id "item_1"}
            {:type "response.output_text.delta" :delta "pong" :id "item_1"}
            {:type "response.output_item.done" :item {:type "message" :id "item_1"} :id "item_1"}
            {:type "response.completed"
             :response {:id "resp_1" :usage {:input_tokens 3 :output_tokens 2}}}]))))

;;; ──────────────────────────────────────────────────────────────────
;;; Error translation
;;; ──────────────────────────────────────────────────────────────────

(defn- list-models-error-message!
  "The translated message `list-models` throws when the HTTP layer fails with `status`/`body`."
  [status body]
  (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      "azure-key"
                                     llm.settings/llm-azure-api-base-url test-base-url]
    (with-redefs [http/request (fn [_] (throw (ex-info "HTTP error" {:status  status
                                                                     :headers {"content-type" "application/json"}
                                                                     :body    body})))]
      (try
        (azure/list-models {:model "openai/gpt-4.1-mini"})
        (catch Exception e
          (ex-message e))))))

(deftest auth-error-is-translated-without-body-preview-test
  (testing "401s get the canonical message; the upstream body is withheld (may carry auth detail)"
    (is (= "Azure rejected the API key for this resource"
           (list-models-error-message! 401 "{\"error\":{\"message\":\"secret account detail\"}}")))))

(deftest not-found-error-is-translated-with-body-preview-test
  (testing "a wrong-surface base URL produces the canonical 404 message plus the provider's detail"
    (is (= "Azure API endpoint or deployment was not found — check the base URL and deployment name — Resource not found"
           (list-models-error-message! 404 "{\"error\":{\"message\":\"Resource not found\"}}")))))
