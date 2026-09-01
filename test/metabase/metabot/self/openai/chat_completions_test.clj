(ns metabase.metabot.self.openai.chat-completions-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.test-util :as metabot.tu]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; parts->cc-messages tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->cc-messages-plain-text-test
  (testing "plain user and assistant text"
    (is (=? [{:role "user" :content "Hello"}
             {:role "assistant" :content "Hi there!"}]
            (chat-completions/parts->cc-messages
             [{:role :user :content "Hello"}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->cc-messages-drops-reasoning-test
  (testing "reasoning parts are dropped, not turned into empty user messages"
    (is (=? [{:role "user" :content "Hello"}
             {:role "assistant" :content "Hi there!"}]
            (chat-completions/parts->cc-messages
             [{:role :user :content "Hello"}
              {:type :reasoning :id "r1" :text "thinking"}
              {:type :reasoning :id "r1" :text "" :provider-metadata {:anthropic {:signature "abc"}}}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->cc-messages-tool-call-test
  (testing "text + tool call merges into single assistant message"
    (is (=? [{:role       "assistant"
              :content    "Let me check..."
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name "search"}}]}]
            (chat-completions/parts->cc-messages
             [{:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->cc-messages-tool-call-only-test
  (testing "tool call without preceding text"
    (is (=? [{:role       "assistant"
              :content    nil
              :tool_calls [{:id "call-1"}]}]
            (chat-completions/parts->cc-messages
             [{:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->cc-messages-tool-result-test
  (testing "tool output becomes tool role message"
    (is (=? [{:role         "tool"
              :tool_call_id "call-1"
              :content      "Found 42 results"}]
            (chat-completions/parts->cc-messages
             [{:type :tool-output :id "call-1" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->cc-messages-multiple-tool-results-test
  (testing "multiple tool outputs become separate tool messages"
    (is (=? [{:role "tool" :tool_call_id "call-1" :content "Result 1"}
             {:role "tool" :tool_call_id "call-2" :content "Result 2"}]
            (chat-completions/parts->cc-messages
             [{:type :tool-output :id "call-1" :result {:output "Result 1"}}
              {:type :tool-output :id "call-2" :result {:output "Result 2"}}])))))

(deftest ^:parallel parts->cc-messages-nil-arguments-test
  (testing "tool call with nil arguments defaults to empty object JSON string"
    (is (=? [{:role       "assistant"
              :content    nil
              :tool_calls [{:id       "call-1"
                            :type     "function"
                            :function {:name      "todo_read"
                                       :arguments "{}"}}]}]
            (chat-completions/parts->cc-messages
             [{:type :tool-input :id "call-1" :function "todo_read" :arguments nil}])))))

(deftest ^:parallel parts->cc-messages-full-conversation-test
  (testing "full conversation with tool round-trip"
    (is (=? [{:role "user"      :content "What time is it in Kyiv?"}
             {:role "assistant" :tool_calls [{:id "call-1" :function {:name "get-time"}}]}
             {:role "tool"      :tool_call_id "call-1" :content "2025-02-13T14:00:00+02:00"}
             {:role "assistant" :content "It's 2:00 PM in Kyiv."}]
            (chat-completions/parts->cc-messages
             [{:role :user :content "What time is it in Kyiv?"}
              {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
              {:type :tool-output :id "call-1" :result {:output "2025-02-13T14:00:00+02:00"}}
              {:type :text :text "It's 2:00 PM in Kyiv."}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; request-body tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-system-plain-string-test
  (testing "the generic dialect keeps the system prompt a plain string"
    (let [body (chat-completions/request-body
                {:model  "some/model"
                 :system "You are a helpful assistant."
                 :input  [{:role :user :content "hi"}]})]
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first))))))

(deftest ^:parallel request-body-no-system-message-test
  (testing "no system message is added when system is not provided"
    (let [body (chat-completions/request-body
                {:model "some/model"
                 :input [{:role :user :content "hi"}]})]
      (is (= ["user"] (map :role (:messages body)))))))

(deftest ^:parallel request-body-streaming-usage-test
  (testing "requests stream and ask for usage in the final chunk"
    (is (=? {:stream         true
             :stream_options {:include_usage true}}
            (chat-completions/request-body {:model "some/model"
                                            :input [{:role :user :content "hi"}]})))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are sent in OpenAI function format with tool_choice auto"
    (is (=? {:tools       [{:type     "function"
                            :function {:name "get-time"}}]
             :tool_choice "auto"}
            (chat-completions/request-body {:model "some/model"
                                            :input [{:role :user :content "hi"}]
                                            :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-tool-choice-passthrough-test
  (testing "an explicit tool_choice passes through when tools are present"
    (is (=? {:tool_choice "required"}
            (chat-completions/request-body {:model       "some/model"
                                            :input       [{:role :user :content "hi"}]
                                            :tools       [(metabot.tu/get-time-tool)]
                                            :tool_choice "required"})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a schema forces a structured_output tool call"
    (is (=? {:tools       [{:type     "function"
                            :function {:name       "structured_output"
                                       :parameters {:type "object"}}}]
             :tool_choice "required"}
            (chat-completions/request-body {:model  "some/model"
                                            :input  [{:role :user :content "hi"}]
                                            :schema {:type       "object"
                                                     :properties {:title {:type "string"}}}})))))

(deftest ^:parallel request-body-temperature-and-max-tokens-test
  (testing "temperature and max-tokens pass through"
    (is (=? {:temperature 0.2
             :max_tokens  128}
            (chat-completions/request-body {:model       "some/model"
                                            :input       [{:role :user :content "hi"}]
                                            :temperature 0.2
                                            :max-tokens  128})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;;
;;; The chunk shapes below are transcribed from real Moonshot (Kimi)
;;; streams captured on 2026-08-05.
;;; The behaviour they pin is provider-agnostic, but Moonshot is the
;;; provider that exercises every edge at once: usage reported in two
;;; places, cache reads reported both flat and nested, parallel tool
;;; calls serialized on a single choice, and reasoning deltas.
;;; ──────────────────────────────────────────────────────────────────

(def ^:private dual-location-usage
  "A Moonshot usage block. Cache reads are reported both flat (`:cached_tokens`) and nested
  (`:prompt_tokens_details`); reasoning tokens are a subset of `:completion_tokens`."
  {:prompt_tokens             4253
   :completion_tokens         20
   :total_tokens              4273
   :cached_tokens             4096
   :completion_tokens_details {:reasoning_tokens 1}
   :prompt_tokens_details     {:cached_tokens 4096}})

(defn- chunk-types
  [chunks]
  (mapv :type (into [] (chat-completions/chat-completions->aisdk-chunks-xf) chunks)))

(defn- usage-parts
  [chunks]
  (filterv #(= :usage (:type %))
           (into [] (chat-completions/chat-completions->aisdk-chunks-xf) chunks)))

(deftest ^:parallel chunks-xf-usage-in-two-places-yields-one-usage-part-test
  (testing "a stream reporting usage both nested under the finishing choice and on a final top-level chunk emits exactly one :usage part"
    ;; Only the top-level `usage` key is read. `report-token-usage-xf` fires once per :usage part, so a
    ;; second one would double `ai_usage_log` rows, Snowplow/Prometheus token counts, and EE limit accounting.
    (is (= 1 (count (usage-parts
                     [{:id      "chatcmpl-1"
                       :model   "kimi-k2.6"
                       :choices [{:index 0 :delta {:role "assistant" :content ""} :finish_reason nil}]}
                      {:choices [{:index 0
                                  :delta {:tool_calls [{:index    0
                                                        :id       "todo_read_0"
                                                        :type     "function"
                                                        :function {:name "todo_read" :arguments ""}}]}}]}
                      {:choices [{:index 0 :delta {:tool_calls [{:index 0 :function {:arguments "{}"}}]}}]}
                      {:choices [{:index         0
                                  :delta         {}
                                  :finish_reason "tool_calls"
                                  :usage         dual-location-usage}]}
                      {:choices [] :usage dual-location-usage}]))))))

(deftest ^:parallel chunks-xf-cache-reads-come-from-prompt-tokens-details-test
  (testing "cacheReadTokens is read from prompt_tokens_details, and cached tokens are a subset of promptTokens"
    (is (=? {:type  :usage
             :id    "chatcmpl-1"
             :model "kimi-k2.6"
             :usage {:promptTokens        4253
                     :completionTokens    20
                     :cacheCreationTokens 0
                     :cacheReadTokens     4096}}
            (first (usage-parts
                    [{:id      "chatcmpl-1"
                      :model   "kimi-k2.6"
                      :choices [{:index 0 :delta {:role "assistant" :content "hi"}}]}
                     {:choices [] :usage dual-location-usage}]))))))

(deftest ^:parallel chunks-xf-flat-cached-tokens-are-not-read-test
  (testing "a flat cached_tokens with no prompt_tokens_details leaves cacheReadTokens at 0"
    ;; `usage->aisdk-usage` reads the nested bucket only. Providers that report cache reads flat *and*
    ;; nested (Moonshot) are covered by the nested read; one that reported only flat would need a
    ;; deliberate change here, not an incidental one.
    (is (=? {:usage {:promptTokens    100
                     :cacheReadTokens 0}}
            (first (usage-parts
                    [{:id      "chatcmpl-2"
                      :model   "kimi-k2.6"
                      :choices [{:index 0 :delta {:role "assistant" :content "hi"}}]}
                     {:choices []
                      :usage   {:prompt_tokens 100 :completion_tokens 5 :cached_tokens 64}}]))))))

(deftest ^:parallel chunks-xf-provider-cost-passes-through-test
  (testing "a provider-reported charge on the usage block is carried as :costUsd"
    (is (=? {:usage {:promptTokens 100
                     :costUsd     0.0123}}
            (first (usage-parts
                    [{:id      "chatcmpl-3"
                      :model   "anthropic/claude-haiku-4.5"
                      :choices [{:index 0 :delta {:role "assistant" :content "hi"}}]}
                     {:choices []
                      :usage   {:prompt_tokens 100 :completion_tokens 5 :cost 0.0123}}])))))
  (testing "providers that report no cost add no :costUsd key"
    (is (not (contains? (:usage (first (usage-parts
                                        [{:id      "chatcmpl-4"
                                          :model   "kimi-k2.6"
                                          :choices [{:index 0 :delta {:role "assistant" :content "hi"}}]}
                                         {:choices []
                                          :usage   {:prompt_tokens 100 :completion_tokens 5}}])))
                        :costUsd)))))

(deftest ^:parallel chunks-xf-parallel-tool-calls-are-tracked-by-id-test
  (testing "tool calls serialized on one choice are split into separate blocks by tool-call id"
    ;; Both calls arrive on `choices[0]`; only the `tool_calls` entry's `id` distinguishes them.
    ;; The `index` field is present in the wire data and deliberately unread.
    (is (=? [{:type :start}
             {:type      :tool-input
              :id        "get_weather_0"
              :function  "get_weather"
              :arguments {:city "Berlin"}}
             {:type      :tool-input
              :id        "get_population_1"
              :function  "get_population"
              :arguments {:city "Berlin"}}
             {:type :usage}]
            (into [] (comp (chat-completions/chat-completions->aisdk-chunks-xf)
                           (self.core/aisdk-xf))
                  [{:id      "chatcmpl-3"
                    :model   "kimi-k2.6"
                    :choices [{:index 0 :delta {:role "assistant" :content ""} :finish_reason nil}]}
                   {:choices [{:index 0
                               :delta {:tool_calls [{:index    0
                                                     :id       "get_weather_0"
                                                     :type     "function"
                                                     :function {:name "get_weather" :arguments ""}}]}}]}
                   {:choices [{:index 0 :delta {:tool_calls [{:index 0 :function {:arguments "{\"city\":"}}]}}]}
                   {:choices [{:index 0 :delta {:tool_calls [{:index 0 :function {:arguments " \"Berlin\"}"}}]}}]}
                   {:choices [{:index 0
                               :delta {:tool_calls [{:index    1
                                                     :id       "get_population_1"
                                                     :type     "function"
                                                     :function {:name "get_population" :arguments ""}}]}}]}
                   {:choices [{:index 0 :delta {:tool_calls [{:index 1 :function {:arguments "{\"city\":"}}]}}]}
                   {:choices [{:index 0 :delta {:tool_calls [{:index 1 :function {:arguments " \"Berlin\"}"}}]}}]}
                   {:choices [{:index 0 :delta {} :finish_reason "tool_calls"}]}
                   {:choices [] :usage {:prompt_tokens 138 :completion_tokens 36}}])))))

(deftest ^:parallel chunks-xf-reasoning-deltas-open-no-text-block-test
  (testing "reasoning_content deltas and empty-string content produce no chunks"
    ;; Reasoning is not replayable over Chat Completions, so it is dropped rather than surfaced as text.
    ;; An empty-string `content` between blocks must not open a text block either — that would close
    ;; the tool call that follows it.
    (is (= [:start :tool-input-start :tool-input-delta :tool-input-available :usage]
           (chunk-types
            [{:id      "chatcmpl-4"
              :model   "kimi-k2.6"
              :choices [{:index 0 :delta {:role "assistant" :content ""} :finish_reason nil}]}
             {:choices [{:index 0 :delta {:reasoning_content ""} :finish_reason nil}]}
             {:choices [{:index 0 :delta {:reasoning_content "Let me think about that"} :finish_reason nil}]}
             {:choices [{:index 0
                         :delta {:tool_calls [{:index    0
                                               :id       "todo_read_0"
                                               :type     "function"
                                               :function {:name "todo_read" :arguments ""}}]}}]}
             {:choices [{:index 0 :delta {:tool_calls [{:index 0 :function {:arguments "{}"}}]}}]}
             {:choices [{:index 0 :delta {} :finish_reason "tool_calls"}]}
             {:choices [] :usage {:prompt_tokens 127 :completion_tokens 288}}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; models-catalog tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel models-catalog-returns-data-test
  (testing "a well-formed catalog is returned as-is"
    (is (= [{:id "glm-5.2"}]
           (chat-completions/models-catalog "Z.AI" {:status 200 :body {:object "list" :data [{:id "glm-5.2"}]}}))))
  (testing "an empty catalog is a legitimate response, not a malformed one"
    (is (= []
           (chat-completions/models-catalog "Z.AI" {:status 200 :body {:object "list" :data []}})))))

(deftest ^:parallel models-catalog-throws-on-unrecognized-body-test
  (testing "a 2xx whose body carries no model list throws rather than yielding an empty catalog"
    (doseq [body [{:object "list"} "<html>Not Found</html>" nil {:data {:id "not-a-list"}}]]
      (testing (str "body " (pr-str body))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Mistral returned an unexpected model list response"
             (chat-completions/models-catalog "Mistral" {:status 200 :body body})))))))

(deftest ^:parallel models-catalog-appends-a-caller-supplied-detail-test
  (testing "a supplied detail is appended to the message"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"vLLM returned an unexpected model list response\. Check http://vllm\.internal:8000/v1\."
         (chat-completions/models-catalog "vLLM" {:status 200 :body {:object "list"}}
                                          {:detail "Check http://vllm.internal:8000/v1."}))))
  (testing "and a caller that supplies none gets the bare message"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Mistral returned an unexpected model list response$"
         (chat-completions/models-catalog "Mistral" {:status 200 :body {:object "list"}} nil)))))

(deftest ^:parallel models-catalog-error-is-tagged-api-error-without-status-test
  (testing "the thrown error is tagged :api-error so rethrow-api-error! passes it through, and carries no status"
    ;; `metabase.metabot.api/provider-client-error?` renders any 4xx :api-error under the admin API-key
    ;; field. A malformed catalog is not a credentials problem, so it must not claim a 4xx status.
    (let [data (try
                 (chat-completions/models-catalog "Mistral" {:status 200 :body {:object "list"}})
                 (catch clojure.lang.ExceptionInfo e (ex-data e)))]
      (is (= {:api-error true :error-code :malformed-model-catalog} data))
      (is (not (contains? data :status))))))
