(ns metabase.metabot.self.azure-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private test-base-url "https://my-resource.services.ai.azure.com/openai")

(defn- credentials
  "What a resolved Azure connection hands the adapter: adapters read credentials only, never settings."
  ([] (credentials test-base-url))
  ([base-url] {:api-key "azure-key" :base-url base-url}))

;;; ──────────────────────────────────────────────────────────────────
;;; Connect validation (list-models)
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-missing-credentials-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Azure credentials are not configured"
       (azure/list-models {:model "openai/gpt-4.1-mini"}))))

(deftest list-models-requires-both-credential-fields-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Azure credentials are not configured"
       (azure/list-models {:model       "openai/gpt-4.1-mini"
                           :credentials {:api-key "azure-key"}}))))

(deftest list-models-does-not-borrow-the-single-provider-setting-test
  (testing "a connection with no credentials fails rather than picking up the single-provider settings"
    (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key      "azure-key"
                                       llm.settings/llm-azure-api-base-url test-base-url]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Azure credentials are not configured"
           (azure/list-models {:model "openai/gpt-4.1-mini"}))))))

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

(deftest list-models-skips-validation-without-any-model-test
  (testing "without a candidate model there is no surface to probe"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (= {:models []} (azure/list-models))))))

;;; ──────────────────────────────────────────────────────────────────
;;; API family dispatch and request construction
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-raw-request!
  "Run `azure-raw` with HTTP stubbed out and return the clj-http request map it would send."
  ([opts] (captured-raw-request! test-base-url opts))
  ([base-url opts]
   (with-redefs [self.core/sse-reducible             identity
                 self.core/reducible-with-api-errors (fn [r _ _] r)
                 debug/capture-stream                (fn [r _] r)
                 http/request                        (fn [req] {:body req})]
     (azure/azure-raw (merge {:credentials (credentials base-url)} opts)))))

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
              body)))
    (testing "a deployment name matches no model, so max_tokens falls back rather than being omitted"
      (is (= 64000 (:max_tokens body))))))

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

(defn- captured-body!
  "The decoded request body `azure-raw` would send for `opts`, with a stock user message."
  [opts]
  (json/decode+kw (:body (captured-raw-request! (merge {:input [{:role :user :content "hi"}]} opts)))))

(deftest reasoning-request-config-test
  (testing "anthropic deployments named after reasoning models request adaptive summarized thinking, and only that"
    (let [body (captured-body! {:model "anthropic/claude-opus-4-8"})]
      (is (=? {:thinking {:type "adaptive" :display "summarized"}} body))
      (is (not (contains? body :reasoning)))
      (is (not (contains? body :include)))))
  (testing "openai deployments named after reasoning models request reasoning summaries with encrypted-content replay, and only that"
    (let [body (captured-body! {:model "openai/gpt-5.4"})]
      (is (=? {:reasoning {:summary "auto"}
               :include   ["reasoning.encrypted_content"]}
              body))
      (is (not (contains? body :thinking)))))
  (testing "deployments that do not stream reasoning get no thinking config"
    (is (not (contains? (captured-body! {:model "anthropic/claude-haiku-4-5"}) :thinking)))
    (is (not (contains? (captured-body! {:model "anthropic/my-claude-deployment"}) :thinking))))
  (testing ":reasoning? false suppresses both families"
    (is (not (contains? (captured-body! {:model "anthropic/claude-opus-4-8" :reasoning? false}) :thinking)))
    (let [body (captured-body! {:model "openai/gpt-5.4" :reasoning? false})]
      (is (not (contains? body :reasoning)))
      (is (not (contains? body :include)))))
  (testing "structured output suppresses thinking for the anthropic family only"
    (is (not (contains? (captured-body! {:model  "anthropic/claude-opus-4-8"
                                         :schema {:type "object"}})
                        :thinking)))
    (is (=? {:reasoning {:summary "auto"}
             :include   ["reasoning.encrypted_content"]}
            (captured-body! {:model "openai/gpt-5.4" :schema {:type "object"}})))))

(deftest reasoning-replay-test
  (testing "signed reasoning parts replay as a thinking block merged into the assistant turn"
    (let [body (json/decode+kw
                (:body (captured-raw-request!
                        {:model "anthropic/claude-opus-4-8"
                         :input [{:type :reasoning :id "r1" :text "first "}
                                 {:type :reasoning :id "r1" :text "second"}
                                 {:type :reasoning :id "r1" :text ""
                                  :provider-metadata {:anthropic {:signature "abc"}}}
                                 {:type :tool-input :id "call-1" :function "search" :arguments {}}]})))]
      (is (=? [{:role    "assistant"
                :content [{:type "thinking" :thinking "first second" :signature "abc"}
                          {:type "tool_use" :id "call-1"}]}]
              (:messages body))))))

(deftest reasoning-gate-matches-request-config-test
  (testing "the string the gate reads is the string the body is built from"
    (doseq [model ["anthropic/claude-opus-4-8" "anthropic/Claude-Opus-5" "openai/GPT-5.4"]]
      (testing model
        (is (= (#'azure/model->deployment model)
               (:model (captured-body! {:model model}))))))))

(deftest ^:parallel reasoning-model?-test
  (are [model expected] (= expected (azure/reasoning-model? model))
    "anthropic/claude-opus-5"     true
    "anthropic/claude-opus-4-8"   true
    ;; dotted display-name spelling parses the same — deployment names are admin free text
    "anthropic/claude-opus-4.8"   true
    "anthropic/claude-sonnet-4.6" true
    "anthropic/claude-opus-4-6"   true
    "anthropic/claude-sonnet-4-6" true
    "anthropic/claude-fable-5"    true
    "anthropic/claude-opus-4-5"   false
    "anthropic/claude-opus-4.5"   false
    "anthropic/claude-haiku-4-5"  false
    "anthropic/claude-sonnet-4-5" false
    "anthropic/Claude-Opus-5"     true
    "anthropic/my-claude"         false
    "anthropic/"                  false
    "anthropic"                   false
    "openai/gpt-5.4"              true
    "openai/GPT-5.4"              true
    "openai/o3-mini"              true
    "openai/gpt-4.1-mini"         false
    "evilai/some-deployment"      false
    nil                           false))

(deftest fast-mode-is-disabled-test
  (testing "a fast-mode request is stripped before the anthropic body is built"
    (let [body (json/decode+kw
                (:body (captured-raw-request! {:model "anthropic/claude-opus-4-8"
                                               :fast? true
                                               :input [{:role :user :content "hi"}]})))]
      (is (not (contains? body :speed))))))

(deftest unsupported-family-throws-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Unsupported Azure model \"evilai/some-deployment\". Only anthropic/\* and openai/\* models are supported."
       (captured-raw-request! {:model "evilai/some-deployment"
                               :input [{:role :user :content "hi"}]}))))

;;; ──────────────────────────────────────────────────────────────────
;;; AI proxy (unsupported)
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for Azure"
           (azure/list-models {:model "openai/gpt-4.1-mini" :ai-proxy? true}))))))

(deftest azure-raw-forwards-credentials-test
  (testing "credentials passed to azure-raw reach the request, without requiring saved settings"
    (with-redefs [http/request (fn [req]
                                 (is (=? {:url     (str test-base-url "/v1/responses")
                                          :headers {"Authorization" "Bearer override-key"}}
                                         req))
                                 (throw (ex-info "stop" {::stop true})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"stop"
           (azure/azure-raw {:model       "openai/gpt-4.1-mini"
                             :input       [{:role :user :content "hi"}]
                             :credentials {:api-key "override-key" :base-url test-base-url}}))))))

(deftest azure-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for Azure"
           (azure/azure-raw {:model     "openai/gpt-4.1-mini"
                             :input     [{:role :user :content "hi"}]
                             :ai-proxy? true}))))))

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
  (with-redefs [debug/capture-stream (fn [r _] r)
                http/request         (fn [_] (sse-response-for events))]
    (into [] (self.core/aisdk-xf)
          (azure/azure {:model       model
                        :input       [{:role :user :content "hi"}]
                        :credentials (credentials)}))))

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

(deftest anthropic-family-streams-reasoning-test
  (is (=? [{:type :start :id "msg_1"}
           {:type :reasoning :text "let me think" :provider-metadata {:anthropic {:signature "sig-1"}}}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "anthropic/claude-opus-4-8"
           [{:type "message_start" :message {:id "msg_1" :model "claude-opus-4-8" :usage {:input_tokens 3}}}
            {:type "content_block_start" :index 0 :content_block {:type "thinking"}}
            {:type "content_block_delta" :index 0 :delta {:type "thinking_delta" :thinking "let me think"}}
            {:type "content_block_delta" :index 0 :delta {:type "signature_delta" :signature "sig-1"}}
            {:type "content_block_stop" :index 0}
            {:type "content_block_start" :index 1 :content_block {:type "text"}}
            {:type "content_block_delta" :index 1 :delta {:type "text_delta" :text "pong"}}
            {:type "content_block_stop" :index 1}
            {:type "message_delta" :delta {:stop_reason "end_turn"} :usage {:input_tokens 3 :output_tokens 2}}
            {:type "message_stop"}]))))

(deftest openai-family-streams-reasoning-test
  (is (=? [{:type :start :id "resp_1"}
           {:type :reasoning :text "keeping it short"}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "openai/gpt-5.4"
           [{:type "response.created" :response {:id "resp_1" :model "gpt-5.4"}}
            {:type "response.output_item.added" :item {:type "reasoning" :id "rs_1"}}
            {:type "response.reasoning_summary_part.added" :item_id "rs_1"}
            {:type "response.reasoning_summary_text.delta" :item_id "rs_1" :delta "keeping it short"}
            {:type "response.reasoning_summary_text.done"  :item_id "rs_1"}
            {:type "response.output_item.done" :item {:type "reasoning" :id "rs_1"}}
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
  (with-redefs [http/request (fn [_] (throw (ex-info "HTTP error" {:status  status
                                                                   :headers {"content-type" "application/json"}
                                                                   :body    body})))]
    (try
      (azure/list-models {:model "openai/gpt-4.1-mini" :credentials (credentials)})
      (catch Exception e
        (ex-message e)))))

(deftest auth-error-is-translated-without-body-preview-test
  (testing "401s get the canonical message; the upstream body is withheld (may carry auth detail)"
    (is (= "Azure rejected the API key for this resource"
           (list-models-error-message! 401 "{\"error\":{\"message\":\"secret account detail\"}}")))))

(deftest not-found-error-is-translated-with-body-preview-test
  (testing "a wrong-surface base URL produces the canonical 404 message plus the provider's detail"
    (is (= "Azure API endpoint or deployment was not found — check the base URL and deployment name — Resource not found"
           (list-models-error-message! 404 "{\"error\":{\"message\":\"Resource not found\"}}")))))
