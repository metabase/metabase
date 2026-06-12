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
  [{:id "qwen.qwen3-next-80b-a3b-instruct" :object "model"}
   {:id "openai.gpt-5.5" :object "model"}
   {:id "anthropic.claude-haiku-4-5" :object "model"}
   {:id "openai.gpt-oss-120b" :object "model"}
   {:id "deepseek.v3.2" :object "model"}
   {:id "anthropic.claude-opus-4-8" :object "model"}
   {:id "anthropic.claude-fable-5" :object "model"}
   {:id "openai.gpt-5.4" :object "model"}])

(deftest list-models-filters-to-supported-vendors-test
  (mt/with-dynamic-fn-redefs [bedrock/list-all-models (constantly fake-catalog)]
    (testing "only anthropic.* and openai.* models survive, gpt-oss and fable excluded, sorted by id"
      (is (= {:models [{:id "anthropic.claude-haiku-4-5" :display_name "anthropic.claude-haiku-4-5"}
                       {:id "anthropic.claude-opus-4-8" :display_name "anthropic.claude-opus-4-8"}
                       {:id "openai.gpt-5.4" :display_name "openai.gpt-5.4"}
                       {:id "openai.gpt-5.5" :display_name "openai.gpt-5.5"}]}
             (bedrock/list-models))))))

(deftest list-models-missing-credentials-test
  (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id nil
                                     llm.settings/llm-bedrock-secret-access-key nil]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"AWS Bedrock credentials are not configured"
         (bedrock/list-models)))))

(deftest list-models-requires-both-keys-test
  (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                     llm.settings/llm-bedrock-secret-access-key nil]
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
          (is (=? {:models [{:id "anthropic.claude-haiku-4-5"}
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
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     nil
                                       llm.settings/llm-bedrock-secret-access-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for AWS Bedrock"
             (bedrock/list-models {:ai-proxy? true})))))))

(deftest bedrock-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     nil
                                       llm.settings/llm-bedrock-secret-access-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for AWS Bedrock"
             (bedrock/bedrock-raw {:model     "anthropic.claude-haiku-4-5"
                                   :input     [{:role :user :content "hi"}]
                                   :ai-proxy? true})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; API family dispatch
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-raw-request!
  "Run `bedrock-raw` with HTTP stubbed out and return the clj-http request map it would send."
  [opts]
  (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                     llm.settings/llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
                                     llm.settings/llm-bedrock-session-token nil
                                     llm.settings/llm-bedrock-region "us-east-1"]
    (with-redefs [self.core/sse-reducible identity
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [req] {:body req})]
      (bedrock/bedrock-raw opts))))

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
  (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                     llm.settings/llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
                                     llm.settings/llm-bedrock-region "us-east-1"]
    (with-redefs [debug/capture-stream (fn [r _] r)
                  http/request         (fn [_] (sse-response-for events))]
      (into [] (self.core/aisdk-xf)
            (bedrock/bedrock {:model model
                              :input [{:role :user :content "hi"}]})))))

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

;;; ──────────────────────────────────────────────────────────────────
;;; Region validation (host-injection backstop)
;;; ──────────────────────────────────────────────────────────────────

(deftest invalid-region-rejected-before-request-test
  (testing "a bogus region set via env var is rejected before the mantle URL is built"
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (mt/with-temp-env-var-value! [mb-llm-bedrock-region "evil.example/?x="]
        (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid AWS Bedrock region \"evil\.example/\?x=\""
               (bedrock/list-models))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Error translation
;;; ──────────────────────────────────────────────────────────────────

(defn- list-models-error-message!
  "The translated message `list-models` throws when the HTTP layer fails with `status`/`body`."
  [status body]
  (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                     llm.settings/llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
                                     llm.settings/llm-bedrock-region "us-east-1"]
    (with-redefs [http/request (fn [_] (throw (ex-info "HTTP error" {:status  status
                                                                     :headers {"content-type" "application/json"}
                                                                     :body    body})))]
      (try
        (bedrock/list-models)
        (catch Exception e
          (ex-message e))))))

(deftest auth-error-is-translated-without-body-preview-test
  (testing "403s get the canonical message; the upstream body is withheld (may carry auth detail)"
    (is (= "AWS Bedrock credentials lack permission for this model or action"
           (list-models-error-message! 403 "{\"message\":\"secret account detail\"}")))))

(deftest not-found-error-is-translated-with-body-preview-test
  (is (= "AWS Bedrock model or endpoint is unavailable in the configured region — no such model"
         (list-models-error-message! 404 "{\"message\":\"no such model\"}"))))
