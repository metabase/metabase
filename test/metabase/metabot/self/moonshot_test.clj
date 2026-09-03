(ns metabase.metabot.self.moonshot-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private byok-credentials
  "What a resolved Moonshot connection hands the adapter: adapters read credentials only, never settings."
  {:api-key "sk-moonshot-key-byok" :base-url "https://api.moonshot.ai/v1"})

;;; ──────────────────────────────────────────────────────────────────
;;; moonshot-request-body tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-default-model-test
  (testing "the model defaults to kimi-k3"
    (is (= "kimi-k3"
           (:model (moonshot/moonshot-request-body {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-system-plain-string-test
  (testing "the system prompt stays a plain string"
    (let [body (moonshot/moonshot-request-body
                {:model  "kimi-k2.6"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first))))))

(deftest ^:parallel request-body-keeps-stream-options-test
  (testing "stream_options is kept — Moonshot accepts it, unlike Mistral"
    (let [body (moonshot/moonshot-request-body {:model "kimi-k2.6"
                                                :input [{:role :user :content "hi"}]})]
      (is (true? (:stream body)))
      (is (= {:include_usage true} (:stream_options body))))))

(deftest ^:parallel request-body-drops-temperature-test
  (testing "temperature is never sent — Moonshot 400s on any value but the one its thinking mode allows"
    (is (not (contains? (moonshot/moonshot-request-body {:model       "kimi-k2.6"
                                                         :input       [{:role :user :content "hi"}]
                                                         :temperature 0.3})
                        :temperature)))))

(deftest ^:parallel request-body-max-tokens-test
  (testing "max-tokens passes through"
    ;; a capped k2.6 chat call would share this budget with thinking (reasoning_content counts
    ;; toward max_tokens); unreachable today — the only :max-tokens producer also sets :schema,
    ;; which disables k2.6's thinking
    (is (= 128 (:max_tokens (moonshot/moonshot-request-body {:model      "kimi-k2.6"
                                                             :input      [{:role :user :content "hi"}]
                                                             :max-tokens 128}))))))

(deftest ^:parallel request-body-thinking-switch-test
  (testing "kimi-k2.6's thinking switch follows the path"
    ;; enabled only where reasoning renders; disabled on the structured path, under a forced tool
    ;; choice (k2.6 rejects `tool_choice "required"` while thinking is on — probe-derived,
    ;; BOT-1929), and with :reasoning? false. thinking.keep stays at its default null — see the
    ;; hook note in moonshot-request-body.
    (are [expected opts] (= expected (:thinking (moonshot/moonshot-request-body
                                                 (assoc opts
                                                        :model "kimi-k2.6"
                                                        :input [{:role :user :content "hi"}]))))
      {:type "enabled"}  {}
      {:type "enabled"}  {:tools [(metabot.tu/get-time-tool)]}
      {:type "disabled"} {:tools [(metabot.tu/get-time-tool)] :tool_choice "required"}
      {:type "disabled"} {:schema {:type "object" :properties {:title {:type "string"}}}}
      {:type "disabled"} {:reasoning? false}))
  (testing "an off-whitelist model keeps the safe disable"
    (is (= {:type "disabled"}
           (:thinking (moonshot/moonshot-request-body {:model "kimi-k9"
                                                       :input [{:role :user :content "hi"}]})))))
  (testing "no thinking parameter is sent for a thinking-only model"
    ;; kimi-k3 reports `supports_thinking_type: "only"` and would reject `{:type "disabled"}`. It accepts
    ;; `tool_choice "required"` with thinking on, so it does not need it.
    (is (not (contains? (moonshot/moonshot-request-body {:model "kimi-k3"
                                                         :input [{:role :user :content "hi"}]})
                        :thinking)))
    (testing "including when it is reached as the default model"
      (is (not (contains? (moonshot/moonshot-request-body {:input [{:role :user :content "hi"}]})
                          :thinking))))))

(deftest ^:parallel request-body-reasoning-effort-test
  (testing "reasoning_effort is sent exactly for whitelisted reasoning models, per path"
    ;; kimi-k3 always thinks — "max" pins the documented server default on the chat path; "low" is the
    ;; best-effort floor everywhere reasoning is never rendered. k2.6 gets `thinking` instead; the two
    ;; keys must never ride together (k3 rejects `thinking`; reasoning_effort is explicitly not
    ;; supported on k2.6). A forced tool_choice keeps k3 at "max" — k3 accepts required+thinking, and
    ;; the guard row pins that the k2.6 forced-tool-choice disable stayed k2.6-scoped.
    (are [expected opts] (let [body (moonshot/moonshot-request-body opts)]
                           (and (= expected (:reasoning_effort body))
                                (not (and (contains? body :reasoning_effort)
                                          (contains? body :thinking)))))
      "max" {:model "kimi-k3" :input [{:role :user :content "hi"}]}
      "max" {:model "kimi-k3" :input [{:role :user :content "hi"}]
             :tools [(metabot.tu/get-time-tool)]}
      "max" {:model "kimi-k3" :input [{:role :user :content "hi"}]
             :tools [(metabot.tu/get-time-tool)] :tool_choice "required"}
      "low" {:model "kimi-k3" :input [{:role :user :content "hi"}] :reasoning? false}
      "low" {:model "kimi-k3" :input [{:role :user :content "hi"}]
             :schema {:type "object" :properties {:title {:type "string"}}}}
      nil   {:model "kimi-k2.6" :input [{:role :user :content "hi"}]}
      nil   {:model "kimi-k2.6" :input [{:role :user :content "hi"}]
             :tools [(metabot.tu/get-time-tool)] :tool_choice "required"}
      nil   {:model "kimi-k2.6" :input [{:role :user :content "hi"}]
             :schema {:type "object" :properties {:title {:type "string"}}}})))

(deftest ^:parallel request-body-schema-floors-max-tokens-test
  (testing "a structured call on a thinking-only model gets its max_tokens cap floored"
    ;; k3 bills thinking and the forced tool call against one budget — a small cap risks a `length`
    ;; finish before the tool call is emitted (the conversation-title path sends 512).
    (let [schema {:type "object" :properties {:title {:type "string"}}}]
      (are [expected opts] (= expected (:max_tokens (moonshot/moonshot-request-body opts)))
        2048 {:model "kimi-k3" :input [{:role :user :content "hi"}] :schema schema :max-tokens 512}
        4096 {:model "kimi-k3" :input [{:role :user :content "hi"}] :schema schema :max-tokens 4096}
        nil  {:model "kimi-k3" :input [{:role :user :content "hi"}] :schema schema}
        512  {:model "kimi-k3" :input [{:role :user :content "hi"}] :max-tokens 512}
        512  {:model "kimi-k2.6" :input [{:role :user :content "hi"}] :schema schema :max-tokens 512}))))

(deftest ^:parallel request-body-replays-reasoning-test
  (let [reasoning-round [{:role :user :content "q"}
                         {:type :reasoning :id "r1" :text "think "}
                         {:type :reasoning :id "r1" :text "hard"}
                         {:type :tool-input :id "c1" :function "f" :arguments {:x 1}}
                         {:type :tool-output :id "c1" :result {:output "ok"}}
                         {:type :reasoning :id "r2" :text "more"}
                         {:type :text :text "answer"}]]
    (testing "in-turn reasoning replays as reasoning_content on each round's assistant message"
      ;; Moonshot requires the complete assistant message back as-is, including reasoning_content —
      ;; https://platform.kimi.ai/docs/guide/use-thinking-models
      (is (=? [{:role "user" :content "q"}
               {:role              "assistant"
                :content           ""
                :tool_calls        [{:id "c1"}]
                :reasoning_content "think hard"}
               {:role "tool" :tool_call_id "c1" :content "ok"}
               {:role "assistant" :content "answer" :reasoning_content "more"}]
              (:messages (moonshot/moonshot-request-body {:model "kimi-k3" :input reasoning-round})))))
    (testing "the replay strips with the gate: structured path and :reasoning? false"
      (are [opts] (not-any? :reasoning_content
                            (:messages (moonshot/moonshot-request-body
                                        (assoc opts :model "kimi-k3" :input reasoning-round))))
        {:schema {:type "object" :properties {:title {:type "string"}}}}
        {:reasoning? false}))
    (testing "k2.6 never replays, even though it is whitelisted"
      ;; its thinking.keep stays at the default null, under which the server ignores replayed
      ;; reasoning_content — see the hook note in moonshot-request-body
      (is (not-any? :reasoning_content
                    (:messages (moonshot/moonshot-request-body {:model "kimi-k2.6"
                                                                :input reasoning-round})))))
    (testing "an off-whitelist model never replays"
      (is (not-any? :reasoning_content
                    (:messages (moonshot/moonshot-request-body {:model "kimi-k9"
                                                                :input reasoning-round})))))))

(deftest ^:parallel request-body-prompt-cache-key-test
  (testing "a :prompt-cache-key is forwarded as prompt_cache_key, absent otherwise"
    (is (= "d34d4c93-a5cc-4d5e-b0a6-6b8f89525b48"
           (:prompt_cache_key (moonshot/moonshot-request-body
                               {:model            "kimi-k2.6"
                                :input            [{:role :user :content "hi"}]
                                :prompt-cache-key "d34d4c93-a5cc-4d5e-b0a6-6b8f89525b48"}))))
    (is (not (contains? (moonshot/moonshot-request-body {:model "kimi-k2.6"
                                                         :input [{:role :user :content "hi"}]})
                        :prompt_cache_key)))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are sent in OpenAI function format with tool_choice auto"
    (is (=? {:tools       [{:type     "function"
                            :function {:name "get-time"}}]
             :tool_choice "auto"}
            (moonshot/moonshot-request-body {:model "kimi-k2.6"
                                             :input [{:role :user :content "hi"}]
                                             :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a schema forces a structured_output tool call, with thinking disabled so the model accepts it"
    (is (=? {:tools       [{:type     "function"
                            :function {:name       "structured_output"
                                       :parameters {:type "object"}}}]
             :tool_choice "required"
             :thinking    {:type "disabled"}}
            (moonshot/moonshot-request-body {:model  "kimi-k2.6"
                                             :input  [{:role :user :content "hi"}]
                                             :schema {:type       "object"
                                                      :properties {:title {:type "string"}}}})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;;
;;; The adapter delegates to the shared Chat Completions transducer,
;;; whose Moonshot-shaped edge cases — usage reported in two places,
;;; cache reads reported flat and nested, serialized parallel tool
;;; calls, reasoning deltas — are pinned in
;;; `metabase.metabot.self.openai.chat-completions-test`. These cases
;;; assert the adapter is wired to it, against chunks transcribed from
;;; real streams (notes/bot-1929-moonshot/fixtures/).
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel moonshot-text-conv-test
  (let [chunks [{:id      "chatcmpl-6a73f0a398c4bd9176c05066"
                 :model   "kimi-k2.6"
                 :choices [{:index 0 :delta {:role "assistant" :content "Hello"} :finish_reason nil}]}
                {:choices [{:index 0 :delta {:content " there"}}]}
                {:choices [{:index 0 :delta {} :finish_reason "stop"}]}
                {:choices [] :usage {:prompt_tokens 12 :completion_tokens 2 :total_tokens 14}}]]
    (testing "text streaming chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (moonshot/moonshot->aisdk-chunks-xf) (m/distinct-by :type)) chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start}
               {:type :text :text "Hello there"}
               {:type  :usage :model "kimi-k2.6"
                :usage {:promptTokens 12 :completionTokens 2}}]
              (into [] (comp (moonshot/moonshot->aisdk-chunks-xf)
                             (self.core/aisdk-xf))
                    chunks))))))

(deftest ^:parallel moonshot-reasoning-conv-test
  (testing "reasoning_content deltas stream as a reasoning block ahead of the text"
    ;; No captured kimi-k3 stream exists yet — chunk shapes follow the official streaming example
    ;; (flat `delta.reasoning_content`, always ahead of content:
    ;; https://platform.kimi.ai/docs/guide/use-thinking-models); verify against a live capture once
    ;; Moonshot credentials exist. The empty-string opener chunk must not open a reasoning block.
    (let [chunks [{:id      "chatcmpl-synthetic-k3"
                   :model   "kimi-k3"
                   :choices [{:index 0 :delta {:role "assistant" :content ""} :finish_reason nil}]}
                  {:choices [{:index 0 :delta {:reasoning_content ""} :finish_reason nil}]}
                  {:choices [{:index 0 :delta {:reasoning_content "Let me think"} :finish_reason nil}]}
                  {:choices [{:index 0 :delta {:reasoning_content " about it"} :finish_reason nil}]}
                  {:choices [{:index 0 :delta {:content "Answer"} :finish_reason nil}]}
                  {:choices [{:index 0 :delta {} :finish_reason "stop"}]}
                  {:choices [] :usage {:prompt_tokens 10 :completion_tokens 50 :total_tokens 60}}]]
      (testing "chunk stream: :start first, then one reasoning block, then text"
        (is (= [:start :reasoning-start :reasoning-delta :reasoning-delta :reasoning-end
                :text-start :text-delta :text-end :usage]
               (into [] (comp (moonshot/moonshot->aisdk-chunks-xf) (map :type)) chunks))))
      (testing "through the full pipeline: one reasoning part ahead of the text"
        (is (=? [{:type :start}
                 {:type :reasoning :text "Let me think about it"}
                 {:type :text :text "Answer"}
                 {:type :usage}]
                (into [] (comp (moonshot/moonshot->aisdk-chunks-xf) (self.core/aisdk-xf)) chunks)))))))

(deftest ^:parallel moonshot-tool-call-conv-test
  (testing "a streamed tool call preceded by reasoning deltas produces one tool-input and no text block"
    ;; Moonshot opens every stream with an empty-string `content` delta and then streams `reasoning_content`
    ;; before the tool call. Neither may open a text block — that would close the tool call that follows.
    (is (=? [{:type :start}
             {:type      :tool-input
              :id        "get_weather_0"
              :function  "get_weather"
              :arguments {:city "Berlin"}}
             {:type :usage}]
            (into [] (comp (moonshot/moonshot->aisdk-chunks-xf)
                           (self.core/aisdk-xf))
                  [{:id      "chatcmpl-6a73f057ecb22d28d50ec557"
                    :model   "kimi-k2.6"
                    :choices [{:index 0 :delta {:role "assistant" :content ""} :finish_reason nil}]}
                   {:choices [{:index 0 :delta {:reasoning_content ""} :finish_reason nil}]}
                   {:choices [{:index 0
                               :delta {:tool_calls [{:index    0
                                                     :id       "get_weather_0"
                                                     :type     "function"
                                                     :function {:name "get_weather" :arguments ""}}]}}]}
                   {:choices [{:index 0 :delta {:tool_calls [{:index 0 :function {:arguments "{\"city\":"}}]}}]}
                   {:choices [{:index 0 :delta {:tool_calls [{:index 0 :function {:arguments " \"Berlin\"}"}}]}}]}
                   {:choices [{:index 0 :delta {} :finish_reason "tool_calls"}]}
                   {:choices [] :usage {:prompt_tokens 138 :completion_tokens 36 :total_tokens 174}}])))))

(deftest ^:parallel moonshot-usage-dual-location-test
  (testing "a stream reporting usage twice emits one :usage part, with cache reads from prompt_tokens_details"
    ;; Moonshot puts usage both under the finishing choice and on a final top-level chunk. Emitting both would
    ;; double `ai_usage_log` rows and every token metric downstream.
    (let [usage-chunk {:prompt_tokens             4253
                       :completion_tokens         20
                       :total_tokens              4273
                       :cached_tokens             4096
                       :completion_tokens_details {:reasoning_tokens 1}
                       :prompt_tokens_details     {:cached_tokens 4096}}
          usages      (->> (into [] (moonshot/moonshot->aisdk-chunks-xf)
                                 [{:id      "chatcmpl-6a73f0a398c4bd9176c05066"
                                   :model   "kimi-k2.6"
                                   :choices [{:index 0 :delta {:role "assistant" :content "Hi"}}]}
                                  {:choices [{:index         0
                                              :delta         {}
                                              :finish_reason "stop"
                                              :usage         usage-chunk}]}
                                  {:choices [] :usage usage-chunk}])
                           (filterv #(= :usage (:type %))))]
      (is (= 1 (count usages)))
      (is (=? {:type  :usage
               :id    "chatcmpl-6a73f0a398c4bd9176c05066"
               :model "kimi-k2.6"
               :usage {:promptTokens        4253
                       :completionTokens    20
                       :cacheCreationTokens 0
                       :cacheReadTokens     4096}}
              (first usages))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth tests
;;; ──────────────────────────────────────────────────────────────────

(deftest moonshot-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url "https://proxy.example"]
        (testing "Uses the connection's own credentials"
          (with-redefs [self.core/sse-reducible identity
                        debug/capture-stream    (fn [r _] r)
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.moonshot.ai/v1/chat/completions"
                     :headers {"Authorization" "Bearer sk-moonshot-key-byok"}
                     :body    string?}
                    (moonshot/moonshot-raw {:input       [{:role :user :content "hi"}]
                                            :credentials byok-credentials})))))
        (testing "Does not fall back to ai proxy when the connection carries no key"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"No Moonshot API key is set"
               (moonshot/moonshot-raw {:input [{:role :user :content "hi"}]}))))
        (testing "Does not borrow the single-provider setting when the connection carries no key"
          (mt/with-temporary-setting-values [llm.settings/llm-moonshot-api-key "sk-moonshot-key-elsewhere"]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Moonshot API key is set"
                 (moonshot/moonshot-raw {:input       [{:role :user :content "hi"}]
                                         :credentials {:api-key ""}})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Moonshot API key is set"
                 (moonshot/moonshot-raw {:input [{:role :user :content "hi"}]})))))))))

(deftest moonshot-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for Moonshot"
           (moonshot/moonshot-raw {:model     "kimi-k2.6"
                                   :input     [{:role :user :content "hi"}]
                                   :ai-proxy? true}))))))

(deftest moonshot-raw-explicit-credentials-test
  (testing "a passed-in api-key and base-url are used over the configured ones"
    (mt/with-temporary-setting-values [llm.settings/llm-moonshot-api-key      "sk-moonshot-key-setting"
                                       llm.settings/llm-moonshot-api-base-url "https://configured.example"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:url     "https://explicit.example/chat/completions"
                                                          :headers {"Authorization" "Bearer sk-moonshot-key-explicit"}}
                                                         req))
                                                 (throw (ex-info "stop" {::stop true})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"stop"
             (moonshot/moonshot-raw {:input       [{:role :user :content "hi"}]
                                     :credentials {:api-key  "sk-moonshot-key-explicit"
                                                   :base-url "https://explicit.example"}})))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for Moonshot"
           (moonshot/list-models {:ai-proxy? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models tests
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-filters-catalog-to-whitelist-test
  (testing "list-models keeps only whitelisted models, naming them from the whitelist"
    ;; Moonshot catalog entries carry no `:name`, so the display name has nowhere else to come from. The coding
    ;; models in the live catalog are excluded.
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (=? {:method  :get
                                                        :url     "https://api.moonshot.ai/v1/models"
                                                        :headers {"Authorization" "Bearer sk-moonshot-key-byok"}}
                                                       req))
                                               {:status 200
                                                :body   {:object "list"
                                                         :data   [{:id "kimi-k2.7-code" :object "model"}
                                                                  {:id "kimi-k2.7-code-highspeed" :object "model"}
                                                                  {:id "kimi-k3" :object "model"}
                                                                  {:id "kimi-k2.6" :object "model"}]}})]
      (is (= {:models [{:id "kimi-k2.6" :display_name "Kimi K2.6"}
                       {:id "kimi-k3" :display_name "Kimi K3"}]}
             (moonshot/list-models {:credentials byok-credentials}))))))

(deftest list-models-omits-models-the-key-cannot-reach-test
  (testing "a model missing from the per-key catalog is not offered"
    ;; k3's catalog permission group is `staff` where the other models report `moonshot`, so not every account
    ;; sees it.
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               {:status 200 :body {:data [{:id "kimi-k2.6"}]}})]
      (is (= {:models [{:id "kimi-k2.6" :display_name "Kimi K2.6"}]}
             (moonshot/list-models {:credentials byok-credentials}))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-moonshot-api-key "sk-moonshot-key-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer sk-moonshot-key-explicit"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (moonshot/list-models {:credentials {:api-key "sk-moonshot-key-explicit"}})))))))

(deftest list-models-blank-credentials-do-not-borrow-the-setting-test
  (testing "a blank api-key does not fall back to the single-provider setting"
    (mt/with-temporary-setting-values [llm.settings/llm-moonshot-api-key "sk-moonshot-key-elsewhere"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Moonshot API key is set"
           (moonshot/list-models {:credentials {:api-key ""}}))))))

(deftest list-models-blank-credentials-without-configured-key-test
  (testing "throws when the passed-in api-key is blank and no key is configured"
    (mt/with-temporary-setting-values [llm.settings/llm-moonshot-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Moonshot API key is set"
           (moonshot/list-models {:credentials {:api-key ""}}))))))

(deftest list-models-malformed-catalog-throws-test
  (testing "a 2xx whose body carries no model list throws instead of reporting an empty catalog"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:object "list"}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Moonshot returned an unexpected model list response"
           (moonshot/list-models {:credentials byok-credentials}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Error mapping tests
;;; ──────────────────────────────────────────────────────────────────

(deftest error-status-messages-test
  (doseq [[status body pattern]
          [[400 "{\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid temperature\"}}"
            #"Moonshot rejected the request"]
           [401 "{\"error\":{\"type\":\"invalid_authentication_error\",\"message\":\"Invalid Authentication\"}}"
            #"Moonshot API key expired or invalid"]
           [404 "{\"error\":{\"type\":\"resource_not_found_error\",\"message\":\"Not found the model\"}}"
            #"Moonshot API endpoint or model was not found"]]]
    (testing (str "HTTP " status)
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 (throw (ex-info (str "clj-http: status " status)
                                                                 {:status status :body body})))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo pattern
                              (moonshot/list-models {:credentials byok-credentials})))))))
