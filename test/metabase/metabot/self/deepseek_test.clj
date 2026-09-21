(ns metabase.metabot.self.deepseek-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private user-message {:role :user :content "hi"})

(def ^:private byok-credentials
  "What a resolved DeepSeek connection hands the adapter: adapters read credentials only, never settings."
  {:api-key "sk-deepseek-byok" :base-url "https://api.deepseek.com"})

(defn- signed-reasoning
  [signature]
  {:type              :reasoning
   :id                "r1"
   :text              "Let me look that up."
   :provider-metadata {:anthropic {:signature signature}}})

(def ^:private tool-call
  {:type :tool-input :id "call_00_abc" :function "get-time" :arguments {:tz "Asia/Tokyo"}})

(def ^:private tool-result
  {:type :tool-output :id "call_00_abc" :result {:output "13:00"}})

;;; ──────────────────────────────────────────────────────────────────
;;; The thinking directive
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-enables-thinking-by-default-test
  (is (= {:type "enabled"}
         (:thinking (deepseek/deepseek-request-body {:input [user-message]})))))

(deftest ^:parallel request-body-replays-reasoning-onto-the-tool-call-message-test
  (testing "a signed reasoning part rides the same assistant message as the tool_use it preceded"
    (is (=? [{:role "user"}
             {:role    "assistant"
              :content [{:type "thinking" :thinking "Let me look that up." :signature "sig-1"}
                        {:type "tool_use" :id "call_00_abc" :name "get-time"}]}
             {:role "user" :content [{:type "tool_result" :tool_use_id "call_00_abc"}]}]
            (:messages (deepseek/deepseek-request-body
                        {:input [user-message (signed-reasoning "sig-1") tool-call tool-result]}))))))

(deftest ^:parallel request-body-disables-thinking-for-structured-output-test
  (testing "a schema forces tool_choice {:type \"tool\"}, which DeepSeek rejects in thinking mode"
    (let [body (deepseek/deepseek-request-body
                {:input  [user-message (signed-reasoning "sig-1") tool-call tool-result]
                 :schema {:type "object" :properties {:title {:type "string"}}}})]
      (is (= {:type "disabled"} (:thinking body)))
      (is (= {:type "tool" :name "structured_output"} (:tool_choice body)))
      (is (not-any? #(some (comp #{"thinking"} :type) (:content %)) (:messages body))))))

(deftest ^:parallel request-body-keeps-thinking-under-required-tool-choice-test
  (testing "tool_choice \"required\" maps to {:type \"any\"}, which DeepSeek accepts with thinking on"
    (let [body (deepseek/deepseek-request-body
                {:input       [user-message]
                 :tools       [(metabot.tu/get-time-tool)]
                 :tool_choice "required"})]
      (is (= {:type "any"} (:tool_choice body)))
      (is (= {:type "enabled"} (:thinking body))))))

(deftest ^:parallel request-body-disables-thinking-for-the-dialect-preload-test
  (testing "the synthetic load_skill pair carries no signed reasoning, so thinking is turned off"
    (let [preload (skills/dialect-preload-parts "postgres")]
      (is (seq preload))
      (is (= {:type "disabled"}
             (:thinking (deepseek/deepseek-request-body
                         {:input (vec (concat [user-message] preload))})))))))

(deftest ^:parallel request-body-keeps-thinking-for-a-signed-tool-call-test
  (testing "the agent-loop shape — signed reasoning ahead of the tool call — keeps thinking on"
    (is (= {:type "enabled"}
           (:thinking (deepseek/deepseek-request-body
                       {:input [user-message (signed-reasoning "sig-1") tool-call tool-result]}))))))

(deftest ^:parallel request-body-ignores-tool-calls-in-closed-turns-test
  (testing "provenance is only checked over the open turn, so a later user message clears an unsigned call"
    (let [preload (skills/dialect-preload-parts "postgres")]
      (is (= {:type "enabled"}
             (:thinking (deepseek/deepseek-request-body
                         {:input (vec (concat [user-message] preload [user-message]))})))))))

(deftest ^:parallel request-body-disables-thinking-when-reasoning-is-off-test
  (let [body (deepseek/deepseek-request-body
              {:input      [user-message (signed-reasoning "sig-1") tool-call tool-result]
               :reasoning? false})]
    (is (= {:type "disabled"} (:thinking body)))
    (is (not-any? #(some (comp #{"thinking"} :type) (:content %)) (:messages body)))))

(deftest ^:parallel request-body-always-carries-a-thinking-directive-test
  (testing "an omitted directive leaves thinking on, so every request states it explicitly"
    (doseq [schema      [nil {:type "object"}]
            tool_choice [nil "auto" "required"]
            reasoning?  [true false]]
      (let [opts (cond-> {:input      [user-message]
                          :tools      [(metabot.tu/get-time-tool)]
                          :reasoning? reasoning?}
                   schema      (assoc :schema schema)
                   tool_choice (assoc :tool_choice tool_choice))]
        (is (contains? #{{:type "enabled"} {:type "disabled"}}
                       (:thinking (deepseek/deepseek-request-body opts)))
            (pr-str opts))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Body shape inherited from the Anthropic dialect
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-anthropic-shape-test
  (let [body (deepseek/deepseek-request-body
              {:system "You are Metabot."
               :input  [user-message]
               :tools  [(metabot.tu/get-time-tool)]})]
    (testing "the model defaults to deepseek-v4-pro"
      (is (= "deepseek-v4-pro" (:model body))))
    (testing "an unknown model id falls back to the shared max_tokens ceiling"
      (is (= 64000 (:max_tokens body))))
    (is (true? (:stream body)))
    (testing "the system prompt is sent as cache-marked content blocks"
      (is (=? [{:type "text" :text "You are Metabot." :cache_control {:type "ephemeral"}}]
              (:system body))))
    (testing "tools use the Anthropic envelope"
      (is (=? [{:name "get-time" :input_schema {:type "object"}}] (:tools body))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Stream translation
;;;
;;; Events transcribed from a live `deepseek-v4-flash` capture: a thinking block
;;; (whose content_block_start carries no id) followed by two parallel tool_use
;;; blocks with distinct ids.
;;; ──────────────────────────────────────────────────────────────────

(def ^:private stream-events
  [{:type "message_start"
    :message {:id "dd71c602-baab-442c-88ec-3d57b85447b3"
              :role "assistant"
              :model "deepseek-v4-flash"
              :usage {:input_tokens 47 :cache_creation_input_tokens 0 :cache_read_input_tokens 384 :output_tokens 0}}}
   {:type "content_block_start" :index 0 :content_block {:type "thinking" :thinking "" :signature ""}}
   {:type "ping"}
   {:type "content_block_delta" :index 0 :delta {:type "thinking_delta" :thinking "The user wants two cities."}}
   {:type "content_block_delta" :index 0 :delta {:type "signature_delta" :signature "dd71c602-baab-442c-88ec-3d57b85447b3"}}
   {:type "content_block_stop" :index 0}
   {:type "content_block_start" :index 1 :content_block {:type "tool_use" :id "call_00_cB0D45Xgu" :name "get-time" :input {}}}
   {:type "content_block_delta" :index 1 :delta {:type "input_json_delta" :partial_json "{\"tz\":\"Asia/Tokyo\"}"}}
   {:type "content_block_stop" :index 1}
   {:type "content_block_start" :index 2 :content_block {:type "tool_use" :id "call_01_nOr1amlw2" :name "get-time" :input {}}}
   {:type "content_block_delta" :index 2 :delta {:type "input_json_delta" :partial_json "{\"tz\":\"Europe/Paris\"}"}}
   {:type "content_block_stop" :index 2}
   {:type "message_delta"
    :delta {:stop_reason "tool_use"}
    :usage {:input_tokens 47 :cache_creation_input_tokens 0 :cache_read_input_tokens 384 :output_tokens 137}}
   {:type "message_stop"}])

(defn- sse-response
  [events]
  {:status 200
   :body   (java.io.ByteArrayInputStream.
            (.getBytes (str/join (map #(str "data: " (json/encode %) "\n\n") events)) "UTF-8"))})

(defn- aisdk-parts!
  [events]
  (with-redefs [debug/capture-stream (fn [r _] r)
                http/request         (fn [_] (sse-response events))]
    (into [] (self.core/aisdk-xf) (deepseek/deepseek {:input       [user-message]
                                                      :credentials byok-credentials}))))

(deftest deepseek-uses-claude-stream-translation-test
  (let [parts (aisdk-parts! stream-events)]
    (testing "thinking, parallel tool calls, and usage all translate"
      (is (=? [{:type :start :id "dd71c602-baab-442c-88ec-3d57b85447b3"}
               {:type              :reasoning
                :text              "The user wants two cities."
                :provider-metadata {:anthropic {:signature "dd71c602-baab-442c-88ec-3d57b85447b3"}}}
               {:type :tool-input :id "call_00_cB0D45Xgu" :function "get-time" :arguments {:tz "Asia/Tokyo"}}
               {:type :tool-input :id "call_01_nOr1amlw2" :function "get-time" :arguments {:tz "Europe/Paris"}}
               {:type :usage}]
              parts)))
    (testing "the disjoint input buckets are summed into promptTokens"
      (is (=? {:type  :usage
               :model "deepseek-v4-flash"
               :usage {:promptTokens        431
                       :completionTokens    137
                       :cacheCreationTokens 0
                       :cacheReadTokens     384}}
              (last parts))))))

(deftest reasoning-round-trips-within-a-turn-test
  (testing "reasoning captured off the stream replays as a thinking block on the tool-call message"
    (let [parts (filterv #(#{:text :reasoning :tool-input} (:type %)) (aisdk-parts! stream-events))]
      (is (=? [{:role "user"}
               {:role    "assistant"
                :content [{:type      "thinking"
                           :thinking  "The user wants two cities."
                           :signature "dd71c602-baab-442c-88ec-3d57b85447b3"}
                          {:type "tool_use" :id "call_00_cB0D45Xgu"}
                          {:type "tool_use" :id "call_01_nOr1amlw2"}]}]
              (:messages (deepseek/deepseek-request-body
                          {:input (into [user-message] parts)})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth and request routing
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-request!
  [f]
  (let [captured (atom nil)]
    (with-redefs [self.core/sse-reducible identity
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [req] (reset! captured req) {:body req})]
      (f))
    @captured))

(deftest deepseek-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url "https://proxy.example"]
        (testing "uses the connection's own credentials rather than the ai proxy"
          (is (=? {:method  :post
                   :url     "https://api.deepseek.com/anthropic/v1/messages"
                   :headers {"Authorization"     "Bearer sk-deepseek-byok"
                             "anthropic-version" "2023-06-01"}}
                  (captured-request! #(deepseek/deepseek-raw {:input       [user-message]
                                                              :credentials byok-credentials})))))
        (testing "does not fall back to the ai proxy when the connection carries no key"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"No DeepSeek API key is set"
               (deepseek/deepseek-raw {:input [user-message]}))))
        (testing "does not borrow the single-provider setting when the connection carries no key"
          (mt/with-temporary-setting-values [llm.settings/llm-deepseek-api-key "sk-deepseek-elsewhere"]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No DeepSeek API key is set"
                 (deepseek/deepseek-raw {:input       [user-message]
                                         :credentials {:api-key ""}})))))))))

(deftest deepseek-raw-explicit-credentials-test
  (testing "the connection's base URL is used over the configured one"
    (mt/with-temporary-setting-values [llm.settings/llm-deepseek-api-base-url "https://configured.example"]
      (is (=? {:url     "https://explicit.example/anthropic/v1/messages"
               :headers {"Authorization" "Bearer sk-deepseek-explicit"}}
              (captured-request! #(deepseek/deepseek-raw
                                   {:input       [user-message]
                                    :credentials {:api-key  "sk-deepseek-explicit"
                                                  :base-url "https://explicit.example"}})))))))

(deftest deepseek-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for DeepSeek"
           (deepseek/deepseek-raw {:input [user-message] :ai-proxy? true}))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for DeepSeek"
           (deepseek/list-models {:ai-proxy? true}))))))

(deftest chat-and-catalog-share-one-base-url-test
  (testing "the base URL carries neither /anthropic nor /v1 — both paths hang off the same root"
    (is (= "https://api.deepseek.com/anthropic/v1/messages"
           (:url (captured-request! #(deepseek/deepseek-raw {:input       [user-message]
                                                             :credentials byok-credentials})))))
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (= "https://api.deepseek.com/models" (:url req)))
                                               {:status 200 :body {:data []}})]
      (is (= {:models []} (deepseek/list-models {:credentials byok-credentials}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-filters-catalog-to-whitelist-test
  (testing "display names come from the whitelist — DeepSeek catalog entries carry none"
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (=? {:method  :get
                                                        :headers {"Authorization" "Bearer sk-deepseek-byok"}}
                                                       req))
                                               {:status 200
                                                :body   {:data [{:id "deepseek-v4-flash"}
                                                                {:id "deepseek-v4-pro"}
                                                                {:id "deepseek-chat"}]}})]
      (is (= {:models [{:id "deepseek-v4-flash" :display_name "DeepSeek V4 Flash"}
                       {:id "deepseek-v4-pro" :display_name "DeepSeek V4 Pro"}]}
             (deepseek/list-models {:credentials byok-credentials}))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-deepseek-api-key "sk-deepseek-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer sk-deepseek-explicit"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []} (deepseek/list-models {:credentials {:api-key "sk-deepseek-explicit"}})))))))

(deftest list-models-blank-credentials-do-not-borrow-the-setting-test
  (testing "a blank api-key does not fall back to the single-provider setting"
    (mt/with-temporary-setting-values [llm.settings/llm-deepseek-api-key "sk-deepseek-elsewhere"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No DeepSeek API key is set"
           (deepseek/list-models {:credentials {:api-key ""}}))))))

(deftest list-models-blank-credentials-without-configured-key-test
  (testing "throws when the passed-in api-key is blank and no key is configured"
    (mt/with-temporary-setting-values [llm.settings/llm-deepseek-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No DeepSeek API key is set"
           (deepseek/list-models {:credentials {:api-key ""}}))))))

(deftest list-models-malformed-catalog-throws-test
  (testing "a 2xx whose body carries no model list throws instead of reporting an empty catalog"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body "<html>Not Found</html>"})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"DeepSeek returned an unexpected model list response"
           (deepseek/list-models {:credentials byok-credentials}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Error translation
;;; ──────────────────────────────────────────────────────────────────

(defn- list-models-error-message!
  [status]
  (with-redefs [http/request (fn [_] (throw (ex-info "HTTP error"
                                                     {:status  status
                                                      :headers {"content-type" "application/json"}
                                                      :body    "{\"error\":{\"message\":\"nope\"}}"})))]
    (try
      (deepseek/list-models {:credentials byok-credentials})
      (catch Exception e
        (ex-message e)))))

(deftest error-status-messages-test
  (testing "4xx statuses that mean a rejected request say so — the admin UI renders any 4xx under the API-key field"
    (is (str/starts-with? (list-models-error-message! 400) "DeepSeek rejected the request"))
    (is (str/starts-with? (list-models-error-message! 422) "DeepSeek rejected the request parameters")))
  (testing "an exhausted balance is not a key problem"
    (is (str/starts-with? (list-models-error-message! 402) "DeepSeek account balance is exhausted")))
  (testing "auth failures keep the canonical message and withhold the upstream body"
    (is (= "DeepSeek API key expired or invalid" (list-models-error-message! 401))))
  (is (str/starts-with? (list-models-error-message! 429) "DeepSeek has rate limited us"))
  (is (str/starts-with? (list-models-error-message! 503) "DeepSeek is overloaded"))
  (is (str/starts-with? (list-models-error-message! 418) "DeepSeek API error (HTTP 418)")))

;;; ──────────────────────────────────────────────────────────────────
;;; Reasoning capability reporting
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel reasoning-model-test
  (is (true? (deepseek/reasoning-model? "deepseek-v4-flash")))
  (is (true? (deepseek/reasoning-model? "deepseek-v4-pro")))
  (is (false? (deepseek/reasoning-model? "deepseek-chat"))))

;;; ──────────────────────────────────────────────────────────────────
;;; The shared claude.clj hook
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel claude-request-body-unchanged-without-reasoning-config-test
  (doseq [opts [{:model "claude-sonnet-4-6" :input [user-message]}
                {:model "claude-sonnet-4-6" :input [user-message] :schema {:type "object"}}
                {:model "claude-sonnet-4-6" :input [user-message] :tool_choice "required"
                 :tools [(metabot.tu/get-time-tool)]}
                {:model "claude-haiku-4-5-20251001" :input [user-message]}]]
    (is (= (dissoc (claude/claude-request-body opts) :thinking)
           (dissoc (claude/claude-request-body (assoc opts :reasoning-config nil)) :thinking))
        (pr-str opts))))

(deftest ^:parallel claude-request-body-reasoning-config-overrides-suppression-test
  (testing "an explicit config survives the rules that would otherwise suppress thinking"
    (doseq [opts [{:model "claude-sonnet-4-6" :input [user-message] :schema {:type "object"}}
                  {:model "claude-sonnet-4-6" :input [user-message] :tool_choice "required"
                   :tools [(metabot.tu/get-time-tool)]}
                  {:model "not-a-claude-model" :input [user-message]}]]
      (is (= {:type "enabled"}
             (:thinking (claude/claude-request-body (assoc opts :reasoning-config {:type "enabled"}))))
          (pr-str opts)))))
