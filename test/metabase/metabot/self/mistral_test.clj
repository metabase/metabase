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

(def ^:private byok-credentials
  "What a resolved Mistral connection hands the adapter: adapters read credentials only, never settings."
  {:api-key "mistral-key-byok" :base-url "https://api.mistral.ai/v1"})

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

(deftest ^:parallel reasoning-model?-test
  (testing "exactly the whitelist streams renderable thinking; aliases are not resolved"
    (is (true?  (mistral/reasoning-model? "mistral-medium-3-5")))
    (is (false? (mistral/reasoning-model? "mistral-medium-latest")))
    (is (false? (mistral/reasoning-model? "mistral-large-2")))
    (is (false? (mistral/reasoning-model? nil)))))

(deftest ^:parallel request-body-reasoning-effort-test
  (let [body-for (fn [opts]
                   (:reasoning_effort
                    (mistral/mistral-request-body
                     (merge {:model "mistral-medium-3-5" :input [{:role :user :content "hi"}]} opts))))]
    (testing "a whitelisted model asks for thinking by default — the server default sends none"
      (is (= "high" (body-for {}))))
    (testing "tool_choice \"required\" keeps thinking on — Mistral accepts the combination"
      (is (= "high" (body-for {:tool_choice "required"
                               :tools       [{:tool-name "t" :doc "d"
                                              :schema    [:=> [:cat [:map [:x :string]]] :any]
                                              :fn        identity}]}))))
    (testing "structured output and :reasoning? false pin thinking off"
      (is (= "none" (body-for {:schema {:type "object"}})))
      (is (= "none" (body-for {:reasoning? false})))
      (is (= "none" (body-for {:reasoning? false :schema {:type "object"}}))))
    (testing "an off-whitelist model gets no directive at all"
      (is (nil? (:reasoning_effort
                 (mistral/mistral-request-body {:model "mistral-large-2"
                                                :input [{:role :user :content "hi"}]})))))))

(deftest ^:parallel request-body-replays-think-chunks-test
  (let [input [{:role :user :content "check the weather"}
               ;; a block streams as several small parts plus an empty-text metadata carrier
               {:type :reasoning :id "r1" :text "I should "}
               {:type :reasoning :id "r1" :text "use the tool."}
               {:type :reasoning :id "r1" :text "" :provider-metadata {:mistral {:signature "sig-abc"}}}
               {:type :text :text "Checking now."}
               {:type :tool-input :id "call-1" :function "get_weather" :arguments {:city "Paris"}}
               {:type :tool-output :id "call-1" :result {:output "18C"}}]]
    (testing "in-turn reasoning replays as ONE think chunk folded into the step's assistant message"
      (is (= {:role       "assistant"
              :content    [{:type "thinking" :thinking [{:type "text" :text "I should use the tool."}]}
                           {:type "text" :text "Checking now."}]
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name "get_weather" :arguments "{\"city\":\"Paris\"}"}}]}
             (nth (:messages (mistral/mistral-request-body {:model "mistral-medium-3-5" :input input})) 1))))
    (testing "the replayed chunk carries neither :closed (400 on replay, error 3240) nor the captured
             :signature (rejected today, error 3051) — the equality assertion above pins both absences"
      (let [chunk (-> (mistral/mistral-request-body {:model "mistral-medium-3-5" :input input})
                      :messages (nth 1) :content first)]
        (is (not (contains? chunk :closed)))
        (is (not (contains? chunk :signature)))))
    (testing "the structured path, :reasoning? false, and off-whitelist models replay nothing"
      (doseq [opts [{:schema {:type "object"}}
                    {:reasoning? false}
                    {:model "mistral-large-2"}]]
        (testing (pr-str opts)
          (is (= "Checking now."
                 (-> (mistral/mistral-request-body
                      (merge {:model "mistral-medium-3-5" :input input} opts))
                     :messages (nth 1) :content))))))))

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

(deftest ^:parallel flatten-content-chunks-test
  (let [flatten* @#'mistral/flatten-content-chunks]
    (testing "string and absent content pass through untouched, including usage-only events"
      (are [event] (= [event] (flatten* event))
        {:id "m" :choices [{:delta {:role "assistant" :content ""}}]}
        {:choices [{:delta {:content "plain"}}]}
        {:choices [{:delta {} :finish_reason "stop"}] :usage {:prompt_tokens 1}}
        {:usage {:prompt_tokens 1}}))
    (testing "a thinking-only vector becomes a reasoning event plus an empty-content original"
      (is (= [{:id "m" :model "mistral-medium-3-5"
               :choices [{:delta {:reasoning "step one"}}]}
              {:id "m" :model "mistral-medium-3-5"
               :choices [{:delta {:content ""}}]}]
             (flatten* {:id "m" :model "mistral-medium-3-5"
                        :choices [{:delta {:content [{:type "thinking" :closed true
                                                      :thinking [{:type "text" :text "step one"}]}]}}]}))))
    (testing "the transition event splits reasoning-first, keeping finish/tool keys on the content event"
      (is (= [{:choices [{:delta {:reasoning "1."}}]}
              {:choices [{:delta {:content "3"} :finish_reason "stop"}]}]
             (flatten* {:choices [{:delta {:content [{:type "thinking" :closed true
                                                      :thinking [{:type "text" :text "1."}]}
                                                     {:type "text" :text "3"}]}
                                   :finish_reason "stop"}]}))))
    (testing "dispatch is structural — spec-legal chunks without :type still translate"
      (is (= [{:choices [{:delta {:reasoning "quiet"}}]}
              {:choices [{:delta {:content "answer"}}]}]
             (flatten* {:choices [{:delta {:content [{:thinking [{:text "quiet"}]}
                                                     {:text "answer"}]}}]}))))
    (testing "chunk kinds carrying neither :thinking nor :text are dropped, at both nesting levels"
      (is (= [{:choices [{:delta {:reasoning "kept"}}]}
              {:choices [{:delta {:content "ans"}}]}]
             (flatten* {:choices [{:delta {:content [{:type "reference" :reference_ids [1 2]}
                                                     {:type "thinking"
                                                      :thinking [{:type "text" :text "kept"}
                                                                 {:type "reference" :reference_ids [3]}]}
                                                     {:type "text" :text "ans"}]}}]}))))
    (testing "a think-chunk signature is lifted out, ready-namespaced, for the shared xf to carry"
      (is (=? [{:choices [{:delta {:reasoning          "hmm"
                                   :reasoning_metadata {:mistral {:signature "sig-abc"}}}}]}
               {:choices [{:delta {:content ""}}]}]
              (flatten* {:choices [{:delta {:content [{:type "thinking" :signature "sig-abc"
                                                       :thinking [{:type "text" :text "hmm"}]}]}}]}))))
    (testing "a signature-only think chunk — the likely closing shape — still gets its synthetic event"
      (is (=? [{:choices [{:delta {:reasoning_metadata {:mistral {:signature "sig-tail"}}}}]}
               {:choices [{:delta {:content ""}}]}]
              (flatten* {:choices [{:delta {:content [{:type "thinking" :signature "sig-tail"
                                                       :thinking []}]}}]}))))))

(deftest ^:parallel mistral-reasoning-conv-test
  ;; Transcribed from a live mistral-medium-3-5 stream with reasoning_effort "high"
  ;; (2026-09-01): prelude string deltas, think-chunk deltas, ONE transition delta
  ;; carrying the closing think chunk and the first text chunk, then plain strings.
  (let [chunks [{:id      "20260901-1"
                 :model   "mistral-medium-3-5"
                 :choices [{:delta {:role "assistant" :content ""}}]}
                {:choices [{:delta {:content ""}}]}
                {:choices [{:delta {:content [{:type "thinking"
                                               :thinking [{:type "text" :text "Let me calculate "}]}]}}]}
                {:choices [{:delta {:content [{:type "thinking" :closed true
                                               :thinking [{:type "text" :text "17 times 23."}]}]}}]}
                {:choices [{:delta {:content [{:type "thinking" :closed true
                                               :thinking [{:type "text" :text "1."}]}
                                              {:type "text" :text "3"}]}}]}
                {:choices [{:delta {:content "91"}}]}
                {:choices [{:delta {} :finish_reason "stop"}]
                 :usage   {:prompt_tokens 30 :completion_tokens 262 :total_tokens 292}}]]
    (testing ":start precedes every reasoning chunk, and one reasoning block precedes the text"
      (is (=? [{:type :start}
               {:type :reasoning-start}
               {:type :reasoning-delta :delta "Let me calculate "}
               {:type :reasoning-delta :delta "17 times 23."}
               {:type :reasoning-delta :delta "1."}
               {:type :reasoning-end}
               {:type :text-start}
               {:type :text-delta :delta "3"}
               {:type :text-delta :delta "91"}
               {:type :text-end}
               {:type :usage}]
              (into [] (mistral/mistral->aisdk-chunks-xf) chunks))))
    (testing "through the full pipeline: coalesced reasoning, then the answer, then usage"
      (is (=? [{:type :start}
               {:type :reasoning :text "Let me calculate 17 times 23.1."}
               {:type :text :text "391"}
               {:type  :usage :model "mistral-medium-3-5"
                :usage {:promptTokens 30 :completionTokens 262}}]
              (into [] (comp (mistral/mistral->aisdk-chunks-xf)
                             (self.core/aisdk-xf))
                    chunks))))))

(deftest ^:parallel mistral-signature-capture-conv-test
  (testing "a streamed think-chunk signature lands in the reasoning part's provider metadata,
           including when it arrives on a signature-only closing chunk"
    (is (=? [{:type :start}
             {:type :reasoning :text "hmm"}
             {:type :reasoning :text "" :provider-metadata {:mistral {:signature "sig-abc"}}}
             {:type :text :text "done"}]
            (into [] (comp (mistral/mistral->aisdk-chunks-xf)
                           (self.core/lite-aisdk-xf))
                  [{:id      "20260901-2"
                    :model   "mistral-medium-3-5"
                    :choices [{:delta {:role "assistant" :content ""}}]}
                   {:choices [{:delta {:content [{:type "thinking"
                                                  :thinking [{:type "text" :text "hmm"}]}]}}]}
                   ;; the signature alone on the block's closing chunk
                   {:choices [{:delta {:content [{:type "thinking" :signature "sig-abc"
                                                  :thinking []}]}}]}
                   {:choices [{:delta {:content "done"}}]}
                   {:choices [{:delta {} :finish_reason "stop"}]}]))))
  (testing "and the coalescing replay fold reunites the carrier with its block's text"
    (is (= [{:type "thinking" :thinking [{:type "text" :text "hmm"}]}]
           (-> (mistral/mistral-request-body
                {:model "mistral-medium-3-5"
                 :input [{:role :user :content "q"}
                         {:type :reasoning :id "r1" :text "hmm"}
                         {:type :reasoning :id "r1" :text ""
                          :provider-metadata {:mistral {:signature "sig-abc"}}}]})
               :messages (nth 1) :content)))))

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
      (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url "https://proxy.example"]
        (testing "Uses the connection's own credentials"
          (with-redefs [self.core/sse-reducible identity
                        debug/capture-stream    (fn [r _] r)
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.mistral.ai/v1/chat/completions"
                     :headers {"Authorization" "Bearer mistral-key-byok"}
                     :body    string?}
                    (mistral/mistral-raw {:input       [{:role :user :content "hi"}]
                                          :credentials byok-credentials})))))
        (testing "Does not fall back to ai proxy when the connection carries no key"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"No Mistral API key is set"
               (mistral/mistral-raw {:input [{:role :user :content "hi"}]}))))
        (testing "Does not borrow the single-provider setting when the connection carries no key"
          (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-elsewhere"]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Mistral API key is set"
                 (mistral/mistral-raw {:input       [{:role :user :content "hi"}]
                                       :credentials {:api-key ""}})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url nil]
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

(deftest mistral-raw-explicit-credentials-test
  (testing "a passed-in api-key and base-url are used over the configured ones"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key      "mistral-key-setting"
                                       llm.settings/llm-mistral-api-base-url "https://configured.example"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:url     "https://explicit.example/chat/completions"
                                                          :headers {"Authorization" "Bearer mistral-key-explicit"}}
                                                         req))
                                                 (throw (ex-info "stop" {::stop true})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"stop"
             (mistral/mistral-raw {:input       [{:role :user :content "hi"}]
                                   :credentials {:api-key  "mistral-key-explicit"
                                                 :base-url "https://explicit.example"}})))))))

(deftest mistral-raw-blank-credentials-do-not-borrow-the-setting-test
  (testing "a blank api-key does not fall back to the single-provider setting"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-elsewhere"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Mistral API key is set"
           (mistral/mistral-raw {:input       [{:role :user :content "hi"}]
                                 :credentials {:api-key ""}}))))))

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
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (=? {:method  :get
                                                        :url     "https://api.mistral.ai/v1/models"
                                                        :headers {"Authorization" "Bearer mistral-key-byok"}}
                                                       req))
                                               {:status 200 :body {:data [{:id "mistral-large-2512"}
                                                                          {:id "mistral-medium-3-5"}
                                                                          {:id "codestral-2508"}]}})]
      (is (= {:models [{:id "mistral-medium-3-5" :display_name "Mistral Medium 3.5"}]}
             (mistral/list-models {:credentials byok-credentials}))))))

(deftest list-models-matches-aliases-and-dedupes-test
  (testing "a catalog entry whose alias is whitelisted resolves to the whitelisted id, deduped across entries"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               {:status 200
                                                :body   {:data [{:id      "mistral-medium-latest"
                                                                 :aliases ["mistral-medium-3-5"]}
                                                                {:id      "mistral-medium-3-5"
                                                                 :aliases ["mistral-medium-latest"]}]}})]
      (is (= {:models [{:id "mistral-medium-3-5" :display_name "Mistral Medium 3.5"}]}
             (mistral/list-models {:credentials byok-credentials}))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"Authorization" "Bearer mistral-key-explicit"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (mistral/list-models {:credentials {:api-key "mistral-key-explicit"}})))))))

(deftest list-models-blank-credentials-do-not-borrow-the-setting-test
  (testing "a blank api-key does not fall back to the single-provider setting"
    (mt/with-temporary-setting-values [llm.settings/llm-mistral-api-key "mistral-key-elsewhere"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Mistral API key is set"
           (mistral/list-models {:credentials {:api-key ""}}))))))

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
             (mistral/list-models {:credentials byok-credentials})))))))

(deftest list-models-malformed-catalog-throws-test
  (testing "a 2xx whose body carries no model list throws instead of reporting an empty catalog"
    ;; Failing open here would let admin Connect succeed against a base URL we never reached,
    ;; leaving an empty model picker with no diagnostic.
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:object "list"}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Mistral returned an unexpected model list response"
           (mistral/list-models {:credentials byok-credentials}))))))
