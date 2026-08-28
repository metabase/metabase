(ns metabase.metabot.self.bedrock-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Model listing
;;; ──────────────────────────────────────────────────────────────────

(def ^:private fake-catalog
  [{:id "qwen.qwen3-next-80b-a3b-instruct" :object "model" :status "available"}
   {:id "openai.gpt-5.5" :object "model" :status "available"}
   {:id "anthropic.claude-haiku-4-5" :object "model" :status "available"}
   {:id "openai.gpt-oss-120b" :object "model" :status "available"}
   {:id "deepseek.v3.2" :object "model" :status "available"}
   {:id "anthropic.claude-opus-4-8" :object "model" :status "available"}
   {:id "anthropic.claude-fable-5" :object "model" :status "available"}
   {:id "anthropic.claude-3-5-sonnet" :object "model" :status "available"}
   {:id "openai.gpt-5.4" :object "model" :status "available"}])

(def ^:private credentials
  "What a resolved Bedrock connection hands the adapter: adapters read credentials only, never settings."
  {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
   :secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
   :region            "us-east-1"})

(deftest ^:parallel supported-model?-test
  (testing "whitelisted models are supported"
    (doseq [id ["anthropic.claude-fable-5" "anthropic.claude-opus-5" "anthropic.claude-opus-4-8"
                "anthropic.claude-sonnet-5" "openai.gpt-5.5"]]
      (is (true? (#'bedrock/supported-model? {:id id})) id)))
  (testing "non-whitelisted models are not supported, even for supported vendors"
    (doseq [id ["anthropic.claude-3-5-sonnet" "openai.gpt-oss-120b"
                "qwen.qwen3-next-80b-a3b-instruct" "deepseek.v3.2"]]
      (is (false? (#'bedrock/supported-model? {:id id})) id))))

(deftest list-models-filters-to-whitelist-test
  (mt/with-dynamic-fn-redefs [bedrock/list-all-models (constantly fake-catalog)]
    (testing "only whitelisted models survive sorted by id"
      (is (= {:models [{:id "anthropic.claude-fable-5" :display_name "Claude Fable 5"}
                       {:id "anthropic.claude-haiku-4-5" :display_name "Claude Haiku 4.5"}
                       {:id "anthropic.claude-opus-4-8" :display_name "Claude Opus 4.8"}
                       {:id "openai.gpt-5.4" :display_name "GPT-5.4"}
                       {:id "openai.gpt-5.5" :display_name "GPT-5.5"}]}
             (bedrock/list-models {:credentials credentials}))))))

(deftest list-models-filters-unavailable-models-test
  (mt/with-dynamic-fn-redefs
    [bedrock/list-all-models
     (constantly
      [{:id             "anthropic.claude-fable-5"
        :object         "model"
        :status         "unavailable"
        :status_reason  "This model is not available under data retention mode 'default'."
        :data_retention {:allowed_modes ["provider_data_share"] :mode "default" :source "model_default"}}
       {:id             "anthropic.claude-sonnet-5"
        :object         "model"
        :status         "available"
        :data_retention {:allowed_modes ["default" "provider_data_share" "none"] :mode "default" :source "model_default"}}])]
    (testing "whitelisted models whose catalog status is not \"available\" are excluded"
      (is (= {:models [{:id "anthropic.claude-sonnet-5" :display_name "Claude Sonnet 5"}]}
             (bedrock/list-models {:credentials credentials}))))))

(deftest list-models-missing-credentials-test
  (testing "a connection with no credentials fails rather than picking up the single-provider settings"
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "wJalrXUtnFEMI"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AWS Bedrock credentials are not configured"
           (bedrock/list-models)))))
  (deftest list-models-requires-both-keys-test
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"AWS Bedrock credentials are not configured"
         (bedrock/list-models)))))

(deftest list-models-accepts-credentials-override-test
  (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     nil
                                     llm.settings/llm-bedrock-secret-access-key nil]
    (testing "credentials passed in opts are used without requiring saved settings"
      (let [captured (atom nil)]
        (with-redefs [http/request (fn [req] (reset! captured req) {:body {:data fake-catalog}})]
          (is (=? {:models [{:id "anthropic.claude-fable-5"}
                            {:id "anthropic.claude-haiku-4-5"}
                            {:id "anthropic.claude-opus-4-8"}
                            {:id "openai.gpt-5.4"}
                            {:id "openai.gpt-5.5"}]}
                  (bedrock/list-models {:credentials {:access-key-id     "AKIAOVERRIDEOVERRID1"
                                                      :secret-access-key "override-secret"
                                                      :session-token     "override-token"
                                                      :region            "eu-west-1"}})))
          (is (=? {:url     "https://bedrock-mantle.eu-west-1.api.aws/v1/models"
                   :headers {"Authorization"        #".*Credential=AKIAOVERRIDEOVERRID1/.*"
                             "X-Amz-Security-Token" "override-token"}}
                  @captured)))))))

(deftest list-models-credentials-override-must-be-complete-test
  (testing "an override missing the secret access key throws without falling back to saved settings"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"AWS Bedrock credentials are not configured"
         (bedrock/list-models {:credentials {:access-key-id "AKIAOVERRIDEOVERRID1"}})))))

(deftest list-models-credentials-override-region-validated-test
  (testing "a bogus region in override credentials is rejected before the mantle URL is built"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid AWS Bedrock region \"evil\.example/\?x=\""
           (bedrock/list-models {:credentials {:access-key-id     "AKIAOVERRIDEOVERRID1"
                                               :secret-access-key "override-secret"
                                               :region            "evil.example/?x="}}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; AI proxy (unsupported)
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for AWS Bedrock"
           (bedrock/list-models {:ai-proxy? true}))))))

(deftest bedrock-raw-forwards-credentials-test
  (testing "credentials passed to bedrock-raw reach the request, without requiring saved settings"
    (with-redefs [http/request (fn [req]
                                 (is (= "https://bedrock-mantle.eu-west-1.api.aws/anthropic/v1/messages"
                                        (:url req)))
                                 (is (str/includes? (get-in req [:headers "Authorization"])
                                                    "AKIAOVERRIDEOVERRID1"))
                                 (throw (ex-info "stop" {::stop true})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"stop"
           (bedrock/bedrock-raw {:model       "anthropic.claude-haiku-4-5"
                                 :input       [{:role :user :content "hi"}]
                                 :credentials {:access-key-id     "AKIAOVERRIDEOVERRID1"
                                               :secret-access-key "override-secret"
                                               :region            "eu-west-1"}}))))))

(deftest bedrock-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for AWS Bedrock"
           (bedrock/bedrock-raw {:model     "anthropic.claude-haiku-4-5"
                                 :input     [{:role :user :content "hi"}]
                                 :ai-proxy? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; API family dispatch
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-raw-request!
  "Run `bedrock-raw` with HTTP stubbed out and return the clj-http request map it would send."
  [opts]
  (with-redefs [self.core/sse-reducible             identity
                self.core/reducible-with-api-errors (fn [r _ _] r)
                debug/capture-stream                (fn [r _] r)
                http/request                        (fn [req] {:body req})]
    (bedrock/bedrock-raw (merge {:credentials credentials} opts))))

(deftest anthropic-model-dispatches-to-messages-api-test
  (let [req  (captured-raw-request! {:model "anthropic.claude-haiku-4-5"
                                     :system "be brief"
                                     :input  [{:role :user :content "hi"}]})
        body (json/decode+kw (:body req))]
    (is (= "https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages" (:url req)))
    (testing "the unsigned anthropic-version header is sent alongside the signed SigV4 headers"
      (is (=? {"anthropic-version"    "2023-06-01"
               "Host"                 "bedrock-mantle.us-east-1.api.aws"
               "Content-Type"         "application/json"
               "x-amz-content-sha256" #"^[0-9a-f]{64}$"
               "Authorization"        #"^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/.*SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date.*"}
              (:headers req))))
    (testing "body is an Anthropic Messages request without the top-level cache_control mantle rejects"
      (is (=? {:model    "anthropic.claude-haiku-4-5"
               :stream   true
               :system   [{:type "text" :text "be brief" :cache_control {:type "ephemeral"}}]
               :messages [{:role "user" :content [{:type "text" :text "hi"}]}]}
              body))
      (is (not (contains? body :cache_control))))))

(deftest openai-model-dispatches-to-responses-api-test
  (let [req  (captured-raw-request! {:model      "openai.gpt-5.5"
                                     :system      "be brief"
                                     :input       [{:role :user :content "hi"}]
                                     :temperature 0.3
                                     :max-tokens  128})
        body (json/decode+kw (:body req))]
    (is (= "https://bedrock-mantle.us-east-1.api.aws/openai/v1/responses" (:url req)))
    (is (=? {:model             "openai.gpt-5.5"
             :stream            true
             :instructions      "be brief"
             :max_output_tokens 128
             :input             [{:role "user" :content "hi"}]}
            body))
    (testing "temperature is omitted for openai.-prefixed reasoning models"
      (is (not (contains? body :temperature))))))

(defn- captured-body!
  "The decoded request body `bedrock-raw` would send for `opts`, with a stock user message."
  [opts]
  (json/decode+kw (:body (captured-raw-request! (merge {:input [{:role :user :content "hi"}]} opts)))))

(deftest anthropic-model-max-tokens-test
  (testing "the `anthropic.` prefix is stripped so the model's own ceiling resolves"
    (are [opts tokens] (= tokens (:max_tokens (captured-body! opts)))
      {:model "anthropic.claude-opus-4-8"}                  128000
      {:model "anthropic.claude-opus-4-8" :max-tokens 128}     128))
  (testing "openai.* models omit the field entirely"
    (is (not (contains? (captured-body! {:model "openai.gpt-5.5"}) :max_output_tokens)))))

(deftest reasoning-request-config-test
  (testing "anthropic models request adaptive summarized thinking, and only that"
    (let [body (captured-body! {:model "anthropic.claude-opus-4-8"})]
      (is (=? {:thinking {:type "adaptive" :display "summarized"}} body))
      (is (not (contains? body :reasoning)))
      (is (not (contains? body :include)))))
  (testing "openai models request reasoning summaries with encrypted-content replay, and only that"
    (let [body (captured-body! {:model "openai.gpt-5.5"})]
      (is (=? {:reasoning {:summary "auto"}
               :include   ["reasoning.encrypted_content"]}
              body))
      (is (not (contains? body :thinking)))))
  (testing "models that do not stream reasoning get no thinking config"
    (is (not (contains? (captured-body! {:model "anthropic.claude-haiku-4-5"}) :thinking))))
  (testing ":reasoning? false suppresses both families"
    (is (not (contains? (captured-body! {:model "anthropic.claude-opus-4-8" :reasoning? false}) :thinking)))
    (let [body (captured-body! {:model "openai.gpt-5.5" :reasoning? false})]
      (is (not (contains? body :reasoning)))
      (is (not (contains? body :include)))))
  (testing "structured output suppresses thinking for the anthropic family only"
    (is (not (contains? (captured-body! {:model  "anthropic.claude-opus-4-8"
                                         :schema {:type "object"}})
                        :thinking)))
    (is (=? {:reasoning {:summary "auto"}}
            (captured-body! {:model "openai.gpt-5.5" :schema {:type "object"}})))))

(deftest reasoning-replay-test
  (testing "signed reasoning parts replay as a thinking block merged into the assistant turn"
    (let [body (json/decode+kw
                (:body (captured-raw-request!
                        {:model "anthropic.claude-opus-4-8"
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
  (testing "the capability gate and the request body agree for every whitelisted model"
    (doseq [model (keys @#'bedrock/supported-models)]
      (testing model
        (let [body (captured-body! {:model model})]
          (is (= (bedrock/reasoning-model? model)
                 ;; `case` so a model of an unknown family fails loudly here
                 (case (#'bedrock/model-family model)
                   :anthropic (contains? body :thinking)
                   :openai    (contains? body :reasoning)))))))))

(deftest ^:parallel reasoning-model?-test
  (are [model expected] (= expected (bedrock/reasoning-model? model))
    "anthropic.claude-opus-4-8"  true
    "anthropic.claude-fable-5"   true
    "anthropic.claude-haiku-4-5" false
    "openai.gpt-5.5"             true
    "openai.gpt-5.4-2026-03-05"  true
    "deepseek.v3.2"              false
    nil                          false))

(deftest fast-mode-is-disabled-test
  (testing "a fast-mode request is stripped before the anthropic body is built"
    (let [body (json/decode+kw
                (:body (captured-raw-request! {:model "anthropic.claude-opus-4-8"
                                               :fast? true
                                               :input [{:role :user :content "hi"}]})))]
      (is (not (contains? body :speed))))))

(deftest unsupported-model-throws-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Unsupported Bedrock model deepseek.v3.2. Only anthropic.\* and openai.\* models are supported."
       (captured-raw-request! {:model "deepseek.v3.2"
                               :input [{:role :user :content "hi"}]}))))

(deftest ^:parallel mantle-anthropic-body-test
  (testing "drops only the top-level cache_control, preserving content-block-level markers"
    (is (= {:model "anthropic.claude-haiku-4-5"
            :system [{:type "text" :text "s" :cache_control {:type "ephemeral"}}]}
           (bedrock/->mantle-anthropic-body
            {:model         "anthropic.claude-haiku-4-5"
             :cache_control {:type "ephemeral"}
             :system        [{:type "text" :text "s" :cache_control {:type "ephemeral"}}]})))))

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
          (bedrock/bedrock {:model       model
                            :input       [{:role :user :content "hi"}]
                            :credentials credentials}))))

(deftest anthropic-model-uses-claude-stream-translation-test
  (is (=? [{:type :start :id "msg_1"}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "anthropic.claude-haiku-4-5"
           [{:type "message_start" :message {:id "msg_1" :model "claude-haiku-4-5" :usage {:input_tokens 3}}}
            {:type "content_block_start" :index 0 :content_block {:type "text"}}
            {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "pong"}}
            {:type "content_block_stop" :index 0}
            {:type "message_delta" :delta {:stop_reason "end_turn"} :usage {:input_tokens 3 :output_tokens 2}}
            {:type "message_stop"}]))))

(deftest openai-model-uses-openai-stream-translation-test
  (is (=? [{:type :start :id "resp_1"}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "openai.gpt-5.5"
           [{:type "response.created" :response {:id "resp_1" :model "openai.gpt-5.5"}}
            {:type "response.output_item.added" :item {:type "message" :id "item_1"} :id "item_1"}
            {:type "response.output_text.delta" :delta "pong" :id "item_1"}
            {:type "response.output_item.done" :item {:type "message" :id "item_1"} :id "item_1"}
            {:type "response.completed"
             :response {:id "resp_1" :usage {:input_tokens 3 :output_tokens 2}}}]))))

(deftest anthropic-model-streams-reasoning-test
  (is (=? [{:type :start :id "msg_1"}
           {:type :reasoning :text "let me think" :provider-metadata {:anthropic {:signature "sig-1"}}}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "anthropic.claude-opus-4-8"
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

(deftest openai-model-streams-reasoning-test
  (is (=? [{:type :start :id "resp_1"}
           {:type :reasoning :text "keeping it short"}
           {:type :text :text "pong"}
           {:type :usage :usage {:promptTokens 3 :completionTokens 2}}]
          (aisdk-parts-for!
           "openai.gpt-5.5"
           [{:type "response.created" :response {:id "resp_1" :model "openai.gpt-5.5"}}
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
;;; Region validation (host-injection backstop)
;;; ──────────────────────────────────────────────────────────────────

(deftest invalid-region-rejected-before-request-test
  (testing "a bogus region on the connection is rejected before the mantle URL is built"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid AWS Bedrock region \"evil\.example/\?x=\""
           (bedrock/list-models {:credentials (assoc credentials :region "evil.example/?x=")}))))))

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
      (bedrock/list-models {:credentials credentials})
      (catch Exception e
        (ex-message e)))))

(deftest auth-error-is-translated-without-body-preview-test
  (testing "403s get the canonical message; the upstream body is withheld (may carry auth detail)"
    (is (= "AWS Bedrock credentials lack permission for this model or action"
           (list-models-error-message! 403 "{\"message\":\"secret account detail\"}")))))

(deftest not-found-error-is-translated-with-body-preview-test
  (is (= "AWS Bedrock model or endpoint is unavailable in the configured region — no such model"
         (list-models-error-message! 404 "{\"message\":\"no such model\"}"))))
