(ns metabase.metabot.self.claude-test
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- fixture
  "Load cached Claude raw chunks, or capture from the API when `*live*` / no cache."
  [fixture-name opts]
  (metabot.tu/raw-fixture fixture-name #(claude/claude-raw (merge {:model "claude-haiku-4-5"} opts))))

;;; ──────────────────────────────────────────────────────────────────
;;; e2e localhost safeguard
;;; ──────────────────────────────────────────────────────────────────

(deftest request-e2e-localhost-safeguard-test
  (testing "during e2e tests, self.core/request refuses a non-localhost URL before hitting the network"
    (with-redefs [config/is-e2e? true
                  http/request  (fn [& _] (throw (ex-info "http/request should not be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"non-localhost"
           (self.core/request {:url "https://api.anthropic.com"} {:method :get :url "/v1/models"})))))
  (testing "outside e2e mode the safeguard is inert (request proceeds to http/request)"
    (with-redefs [config/is-e2e? false
                  http/request  (fn [_] {:status 200 :body "ok"})]
      (is (= {:status 200 :body "ok"}
             (self.core/request {:url "https://api.anthropic.com"} {:method :get :url "/v1/models"}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel claude-text-conv-test
  (let [raw-chunks (fixture "claude-text"
                            {:input [{:role :user :content "Say hello briefly, in under 10 words."}]})]
    (testing "text streaming chunks are mapped correctly"
      (is (=? [{:type :start} {:type :text-start} {:type :text-delta} {:type :text-end} {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + usage"
      (is (=? [{:type :start :id string?}
               {:type :text :id string? :text string?}
               {:type :usage :id string? :model string?
                :usage {:promptTokens pos-int?
                        :completionTokens nat-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens nat-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-text-id-from-content-block-index-test
  (testing "text blocks (no provider id) take their id from the content-block index, matching @ai-sdk/anthropic"
    (let [raw    [{:type "message_start" :message {:id "msg-1" :model "claude-haiku-4-5"}}
                  {:type "content_block_start" :index 0 :content_block {:type "text"}}
                  {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "Hello"}}
                  {:type "content_block_stop" :index 0}
                  {:type "content_block_start" :index 1 :content_block {:type "text"}}
                  {:type "content_block_delta" :index 1 :delta {:type "text_delta" :text "world"}}
                  {:type "content_block_stop" :index 1}
                  {:type "message_stop"}]
          chunks (into [] (claude/claude->aisdk-chunks-xf) raw)]
      (is (= [["text-start" "0"] ["text-delta" "0"] ["text-end" "0"]
              ["text-start" "1"] ["text-delta" "1"] ["text-end" "1"]]
             (->> chunks
                  (filter #(#{:text-start :text-delta :text-end} (:type %)))
                  (mapv (juxt (comp name :type) :id))))))))

(deftest ^:parallel claude-error-event-uses-canonical-error-shape-test
  (testing "an `error` SSE event becomes an :error part keyed by :error (read by the wire serializer + persistence)"
    (let [raw   [{:type "message_start" :message {:id "msg_1" :model "claude-haiku-4-5"}}
                 {:type "error" :error {:type "overloaded_error" :message "Overloaded"}}]
          parts (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw)
          err   (m/find-first #(= :error (:type %)) parts)]
      (is (=? {:message "Overloaded"} (:error err)))
      (is (= (self.core/format-sse-event {:type "error" :errorText "Overloaded"})
             (self.core/format-error-line err))))))

(deftest ^:parallel claude-tool-input-conv-test
  (let [raw-chunks (fixture "claude-tool-input"
                            {:input [{:role :user :content "What time is it in Kyiv?"}]
                             :tools [(metabot.tu/get-time-tool)]})]
    (testing "tool input chunks are mapped correctly"
      (is (=? [{:type :start} {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available} {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces tool-input + usage"
      (is (=? [{:type :start}
               {:type :tool-input :arguments map?}
               {:type :usage :model string?
                :usage {:promptTokens pos-int?
                        :completionTokens nat-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens nat-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-text-and-tool-input-conv-test
  (let [raw-chunks (fixture "claude-text-and-tool-input"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [(metabot.tu/get-time-tool)]})]
    (testing "text + tool input chunks are mapped correctly"
      (is (=? [{:type :start}
               {:type :text-start} {:type :text-delta} {:type :text-end}
               {:type :tool-input-start} {:type :tool-input-delta} {:type :tool-input-available}
               {:type :usage}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (m/distinct-by :type)) raw-chunks))))
    (testing "through full pipeline produces text + tool-input + usage"
      (is (=? [{:type :start}
               {:type :text :text string?}
               {:type :tool-input :function "get-time" :arguments {:tz string?}}
               {:type :usage :model string?
                :usage {:promptTokens pos-int?
                        :completionTokens nat-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens nat-int?}}]
              (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/aisdk-xf)) raw-chunks))))))

(deftest ^:parallel claude-lite-aisdk-xf-test
  (let [raw-chunks (fixture "claude-text-and-tool-input"
                            {:input [{:role :user :content "Tell me what time it is in Kyiv. First explain what you're going to do, then call the tool."}]
                             :tools [(metabot.tu/get-time-tool)]})
        res        (into [] (comp (claude/claude->aisdk-chunks-xf) (self.core/lite-aisdk-xf)) raw-chunks)]
    (testing "lite-aisdk-xf collects tool inputs"
      (is (=? [{:type :start}
               {:type :tool-input :function "get-time" :arguments {:tz string?}}
               {:type :usage :model string?
                :usage {:promptTokens pos-int?
                        :completionTokens nat-int?
                        :cacheCreationTokens nat-int?
                        :cacheReadTokens nat-int?}}]
              (remove #(= :text (:type %)) res))))
    (testing "lite-aisdk-xf streams text deltas"
      (is (< 10 (count (filter #(= :text (:type %)) res)))))))

(deftest ^:parallel claude-usage-chunk-cache-fields-test
  (testing "cache_creation_input_tokens / cache_read_input_tokens from Claude are surfaced on the :usage chunk;
            :promptTokens is the total input (fresh + cache_creation + cache_read)"
    (let [events [{:type "message_start"
                   :message {:id    "msg-1"
                             :model "claude-haiku-4-5"
                             :usage {:input_tokens                100
                                     :output_tokens               0
                                     :cache_creation_input_tokens 250
                                     :cache_read_input_tokens     4200}}}
                  {:type "content_block_start" :index 0 :content_block {:type "text" :id "text-1"}}
                  {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "ok"}}
                  {:type "content_block_stop" :index 0}
                  {:type "message_delta"
                   :delta {:stop_reason "end_turn"}
                   :usage {:input_tokens                100
                           :output_tokens               7
                           :cache_creation_input_tokens 250
                           :cache_read_input_tokens     4200}}
                  {:type "message_stop"}]
          chunks (into [] (claude/claude->aisdk-chunks-xf) events)
          usage  (first (filter #(= :usage (:type %)) chunks))]
      ;; promptTokens = 100 fresh + 250 cache_creation + 4200 cache_read = 4550
      (is (=? {:type  :usage
               :id    "msg-1"
               :model "claude-haiku-4-5"
               :usage {:promptTokens        4550
                       :completionTokens    7
                       :cacheCreationTokens 250
                       :cacheReadTokens     4200}}
              usage))))
  (testing "missing cache fields default to 0"
    (let [events [{:type "message_start"
                   :message {:id    "msg-2"
                             :model "claude-haiku-4-5"
                             :usage {:input_tokens 10 :output_tokens 0}}}
                  {:type "message_delta"
                   :delta {:stop_reason "end_turn"}
                   :usage {:input_tokens 10 :output_tokens 3}}
                  {:type "message_stop"}]
          chunks (into [] (claude/claude->aisdk-chunks-xf) events)
          usage  (first (filter #(= :usage (:type %)) chunks))]
      (is (= {:cacheCreationTokens 0 :cacheReadTokens 0}
             (select-keys (:usage usage) [:cacheCreationTokens :cacheReadTokens]))))))

(deftest ^:parallel claude-thinking-blocks-streamed-test
  (testing "thinking content blocks (extended/adaptive thinking, e.g. Claude Sonnet 5) stream as reasoning parts"
    (let [events [{:type "message_start"
                   :message {:id "msg-1" :model "claude-sonnet-5"
                             :usage {:input_tokens 10 :output_tokens 0}}}
                  ;; a thinking block arrives before the text
                  {:type "content_block_start" :index 0 :content_block {:type "thinking"}}
                  {:type "content_block_delta" :index 0 :delta {:type "thinking_delta" :thinking "let me think"}}
                  {:type "content_block_delta" :index 0 :delta {:type "signature_delta" :signature "abc"}}
                  {:type "content_block_stop" :index 0}
                  {:type "content_block_start" :index 1 :content_block {:type "text" :id "text-1"}}
                  {:type "content_block_delta" :index 1 :delta {:type "text_delta" :text "hi"}}
                  {:type "content_block_stop" :index 1}
                  {:type "message_delta" :delta {:stop_reason "end_turn"}
                   :usage {:input_tokens 10 :output_tokens 5}}
                  {:type "message_stop"}]]
      (testing "reasoning chunks are emitted ahead of the text chunks"
        (is (=? [{:type :start}
                 {:type :reasoning-start} {:type :reasoning-delta} {:type :reasoning-end}
                 {:type :text-start} {:type :text-delta} {:type :text-end}
                 {:type :usage}]
                (into []
                      (comp (claude/claude->aisdk-chunks-xf)
                            (m/distinct-by :type))
                      events))))
      (testing "through the full pipeline produces reasoning + text + usage"
        (is (=? [{:type :start}
                 {:type :reasoning :reasoning "let me think"}
                 {:type :text :text "hi"}
                 {:type :usage}]
                (into []
                      (comp (claude/claude->aisdk-chunks-xf)
                            (self.core/aisdk-xf))
                      events))))))
  (testing "a stream that ends mid-thinking closes the reasoning part and flushes usage"
    (let [events [{:type "message_start"
                   :message {:id "msg-2" :model "claude-sonnet-5"
                             :usage {:input_tokens 10 :output_tokens 0}}}
                  {:type "content_block_start" :index 0 :content_block {:type "thinking"}}
                  {:type "content_block_delta" :index 0 :delta {:type "thinking_delta" :thinking "partial"}}]]
      (is (=? [{:type :start}
               {:type :reasoning-start} {:type :reasoning-delta} {:type :reasoning-end}
               {:type :usage}]
              (into []
                    (comp (claude/claude->aisdk-chunks-xf)
                          (m/distinct-by :type))
                    events))))))

;;; ──────────────────────────────────────────────────────────────────
;;; parts->claude-messages tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->claude-messages-plain-text-test
  (testing "user and assistant text"
    (is (=? [{:role "user" :content [{:type "text" :text "Hello"}]}
             {:role "assistant" :content [{:type "text" :text "Hi there!"}]}]
            (claude/parts->claude-messages
             [{:role :user :content "Hello"}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->claude-messages-tool-call-test
  (testing "text + tool call merge into single assistant message with content blocks"
    (is (=? [{:role    "assistant"
              :content [{:type "text" :text "Let me check..."}
                        {:type  "tool_use"
                         :id    "call-1"
                         :name  "search"
                         :input {:query "revenue"}}]}]
            (claude/parts->claude-messages
             [{:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->claude-messages-tool-result-test
  (testing "tool output becomes user message with tool_result content block"
    (is (=? [{:role    "user"
              :content [{:type        "tool_result"
                         :tool_use_id "call-1"
                         :content     "Found 42 results"}]}]
            (claude/parts->claude-messages
             [{:type :tool-output :id "call-1" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->claude-messages-full-conversation-test
  (testing "full conversation with tool round-trip"
    (is (=? [{:role "user" :content [{:type "text" :text "What time is it?"}]}
             {:role    "assistant"
              :content [{:type "text" :text "Let me check..."}
                        {:type "tool_use" :id "call-1" :name "get-time"}]}
             {:role    "user"
              :content [{:type "tool_result" :tool_use_id "call-1"}]}
             {:role "assistant" :content [{:type "text" :text "It's 2:00 PM in Kyiv."}]}]
            (claude/parts->claude-messages
             [{:role :user :content "What time is it?"}
              {:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
              {:type :tool-output :id "call-1" :result {:output "2025-02-13T14:00:00+02:00"}}
              {:type :text :text "It's 2:00 PM in Kyiv."}])))))

(deftest ^:parallel parts->claude-messages-nil-arguments-test
  (testing "tool call with nil arguments defaults to empty object"
    (is (=? [{:role    "assistant"
              :content [{:type  "tool_use"
                         :id    "call-1"
                         :name  "todo_read"
                         :input {}}]}]
            (claude/parts->claude-messages
             [{:type :tool-input :id "call-1" :function "todo_read" :arguments nil}])))))

(deftest ^:parallel parts->claude-messages-error-result-test
  (testing "tool error is formatted as error string"
    (is (=? [{:role    "user"
              :content [{:type    "tool_result"
                         :content #"Error:.*failed"}]}]
            (claude/parts->claude-messages
             [{:type :tool-output :id "call-1" :error {:message "Tool failed"}}])))))

(deftest ^:parallel parts->claude-messages-blank-content-test
  (testing "blank string content is filtered out during merge"
    ;; When Claude streams tokens, whitespace-only chunks can arrive separately.
    ;; These must not become bare strings in the content array (which would cause
    ;; API errors), so they are dropped during merge-consecutive.
    (is (=? [{:role    "assistant"
              :content [{:type "text" :text "Hello"}
                        {:type "text" :text "world"}]}]
            (claude/parts->claude-messages
             [{:type :text :text "Hello"}
              {:type :text :text " "}
              {:type :text :text "world"}]))))
  (testing "empty string content is also filtered out"
    (is (=? [{:role    "assistant"
              :content [{:type "text" :text "Hello"}]}]
            (claude/parts->claude-messages
             [{:type :text :text ""}
              {:type :text :text "Hello"}
              {:type :text :text ""}])))))

(deftest claude-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-byok"
                                         llm.settings/llm-proxy-base-url    "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (with-redefs [self.core/sse-reducible             identity
                        debug/capture-stream                (fn [r _] r)
                        http/request                        (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.anthropic.com/v1/messages"
                     :headers {"x-api-key" "sk-ant-byok"}
                     :body    string?}
                    (claude/claude-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Uses ai proxy when explicitly requested"
          (with-redefs [llm.settings/llm-anthropic-api-key  (constantly nil)
                        self.core/sse-reducible             identity
                        debug/capture-stream                (fn [r _] r)
                        http/request                        (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://proxy.example/anthropic/v1/messages"
                     :headers {"x-metabase-instance-token" "proxy-token"}
                     :body    string?}
                    (claude/claude-raw {:input [{:role :user :content "hi"}]
                                        :ai-proxy? true})))))
        (testing "Does not fall back to ai proxy when BYOK is missing"
          (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Anthropic API key is set"
                 (claude/claude-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url nil]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"No Anthropic API key is set"
                   (claude/claude-raw {:input [{:role :user :content "hi"}]}))))))))))

(defn- capture-claude-request-body!
  "Invoke `claude-raw` with stubbed HTTP, returning the decoded request body map."
  [opts]
  (let [captured (atom nil)]
    (with-redefs [self.core/sse-reducible identity
                  http/request            (fn [req]
                                            (reset! captured (json/decode+kw (:body req)))
                                            {:body req})]
      (claude/claude-raw opts))
    @captured))

(deftest claude-tools-cache-breakpoint-test
  (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-test"]
    (let [tools [(metabot.tu/get-time-tool) (metabot.tu/convert-currency-tool)]
          input [{:role :user :content "hi"}]]
      (testing "cache_control is attached to the last tool only"
        (let [body    (capture-claude-request-body! {:input input :tools tools})
              [t1 t2] (:tools body)]
          (is (= 2 (count (:tools body))))
          (is (not (contains? t1 :cache_control)))
          (is (= {:type "ephemeral"} (:cache_control t2)))))
      (testing "no :tools key in request when no tools passed"
        (let [body (capture-claude-request-body! {:input input})]
          (is (not (contains? body :tools)))))
      (testing "no cache_control on structured-output path (schema set)"
        (let [body (capture-claude-request-body!
                    {:input  input
                     :schema {:type "object" :properties {:answer {:type "string"}}}})]
          (is (= 1 (count (:tools body))))
          (is (= "structured_output" (-> body :tools first :name)))
          (is (not (contains? (-> body :tools first) :cache_control))))))))

(deftest claude-auto-cache-breakpoint-test
  (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-test"]
    (let [input [{:role :user :content "hi"}]]
      (testing "top-level cache_control is set on every request (enables automatic caching of message history)"
        (is (= {:type "ephemeral"}
               (:cache_control (capture-claude-request-body! {:input input}))))
        (is (= {:type "ephemeral"}
               (:cache_control (capture-claude-request-body!
                                {:input  input
                                 :system "You are a helpful assistant."
                                 :tools  [(metabot.tu/get-time-tool)]})))))
      (testing "top-level cache_control is set on the structured-output path too"
        (is (= {:type "ephemeral"}
               (:cache_control (capture-claude-request-body!
                                {:input  input
                                 :schema {:type "object" :properties {:answer {:type "string"}}}}))))))))

(deftest claude-system-cache-breakpoint-test
  (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-test"]
    (let [input [{:role :user :content "hi"}]]
      (testing "system prompt without sentinel is wrapped as a single cached content block"
        (let [body (capture-claude-request-body!
                    {:input  input
                     :system "You are a helpful assistant."})]
          (is (= [{:type          "text"
                   :text          "You are a helpful assistant."
                   :cache_control {:type "ephemeral"}}]
                 (:system body)))))
      (testing "system prompt with sentinel is split into cached prefix + uncached suffix"
        (let [body (capture-claude-request-body!
                    {:input  input
                     :system "Stable prefix content.\n\n<<<METABOT_CACHE_BREAKPOINT>>>\n\nDynamic suffix content."})]
          (is (= [{:type          "text"
                   :text          "Stable prefix content."
                   :cache_control {:type "ephemeral"}}
                  {:type "text"
                   :text "Dynamic suffix content."}]
                 (:system body)))))
      (testing "a blank suffix after the sentinel is dropped — Anthropic 400s on empty text blocks"
        ;; e.g. explorations.selmer's only post-sentinel content is `{% if research_plan %}...`,
        ;; which renders blank on the first prompt when no plan context is registered yet.
        (let [body (capture-claude-request-body!
                    {:input  input
                     :system "Stable prefix content.\n\n<<<METABOT_CACHE_BREAKPOINT>>>\n\n"})]
          (is (= [{:type          "text"
                   :text          "Stable prefix content."
                   :cache_control {:type "ephemeral"}}]
                 (:system body)))))
      (testing "a blank prefix before the sentinel is dropped too"
        (let [body (capture-claude-request-body!
                    {:input  input
                     :system "<<<METABOT_CACHE_BREAKPOINT>>>\n\nDynamic suffix content."})]
          (is (= [{:type "text"
                   :text "Dynamic suffix content."}]
                 (:system body)))))
      (testing "no :system key when the rendered system prompt is entirely blank"
        (doseq [system ["" "   " "\n\n<<<METABOT_CACHE_BREAKPOINT>>>\n\n"]]
          (let [body (capture-claude-request-body! {:input input :system system})]
            (is (not (contains? body :system))
                (pr-str system)))
          (let [body (capture-claude-request-body! {:input input :system system :cache? false})]
            (is (not (contains? body :system))
                (pr-str system)))))
      (testing "no :system key when system is not provided"
        (let [body (capture-claude-request-body! {:input input})]
          (is (not (contains? body :system))))))))

(deftest claude-system-cache-breakpoint-blank-suffix-test
  (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-test"]
    (testing "a trailing sentinel with nothing after it produces a single cached block, not an empty text block (the API rejects empty text)"
      (let [body (capture-claude-request-body!
                  {:input  [{:role :user :content "hi"}]
                   :system "Stable prefix content.\n\n<<<METABOT_CACHE_BREAKPOINT>>>\n\n"})]
        (is (= [{:type          "text"
                 :text          "Stable prefix content."
                 :cache_control {:type "ephemeral"}}]
               (:system body)))))))

(deftest system-templates-cache-breakpoint-presence-test
  (testing "every selmer template that contains per-request volatile content carries exactly one cache breakpoint sentinel"
    (let [system-dir (io/file (io/resource "metabot/prompts/system"))
          templates  (->> (.listFiles system-dir)
                          (filter #(re-find #"\.selmer$" (.getName ^java.io.File %))))]
      (doseq [^java.io.File f templates]
        (let [body  (slurp f)
              n     (count (re-seq #"<<<METABOT_CACHE_BREAKPOINT>>>" body))
              has-volatile? (some #(re-find % body)
                                  [#"\{\{\s*current_time\s*\}\}"
                                   #"\{%\s*if\s+recent_views\s*%\}"
                                   #"\{%\s*if\s+current_user_info\s*%\}"
                                   #"\{%\s*if\s+viewing_context\s*%\}"
                                   #"\{\{\s*viewing_context"
                                   #"\{\{\s*first_day_of_week\s*\}\}"
                                   #"\{%\s*if\s+research_plan\s*%\}"])]
          (testing (.getName f)
            (if has-volatile?
              (is (= 1 n) "exactly one sentinel expected when template references volatile context vars")
              (is (zero? n) "no sentinel expected when template has no volatile context vars"))))))))

(deftest claude-list-models-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-byok"
                                         llm.settings/llm-proxy-base-url    "https://proxy.example"]
        (testing "Prefers BYOK over ai proxy"
          (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                     (is (=? {:method  :get
                                                              :url     "https://api.anthropic.com/v1/models"
                                                              :headers {"anthropic-version" "2023-06-01"
                                                                        "x-api-key"        "sk-ant-byok"}}
                                                             req))
                                                     {:body "{\"data\":[]}"})]
            (is (= {:models []}
                   (claude/list-models {})))))
        (testing "Uses ai proxy when explicitly requested"
          (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)
                                      http/request                        (fn [req]
                                                                            (is (=? {:method  :get
                                                                                     :url     "https://proxy.example/anthropic/v1/models"
                                                                                     :headers {"anthropic-version"         "2023-06-01"
                                                                                               "x-metabase-instance-token" "proxy-token"}}
                                                                                    req))
                                                                            {:body "{\"data\":[]}"})]
            (is (= {:models []}
                   (claude/list-models {:ai-proxy? true})))))
        (testing "Does not fall back to ai proxy when BYOK is missing"
          (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Anthropic API key is set"
                 (claude/list-models {})))))
        (testing "Throws an error if nothing is defined"
          (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
            (mt/with-temporary-setting-values [llm.settings/llm-proxy-base-url nil]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"No Anthropic API key is set"
                   (claude/list-models {}))))))))))

(deftest list-models-explicit-credentials-test
  (testing "a passed-in api-key is used over the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"x-api-key" "sk-ant-explicit"}}
                                                         req))
                                                 {:body "{\"data\":[]}"})]
        (is (= {:models []}
               (claude/list-models {:credentials {:api-key "sk-ant-explicit"}})))))))

(deftest list-models-blank-credentials-fall-back-to-configured-key-test
  (testing "a blank passed-in api-key falls back to the configured key"
    (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-setting"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:headers {"x-api-key" "sk-ant-setting"}}
                                                         req))
                                                 {:body "{\"data\":[]}"})]
        (is (= {:models []}
               (claude/list-models {:credentials {:api-key ""}})))))))

(deftest list-models-blank-credentials-without-configured-key-test
  (testing "throws when the passed-in api-key is blank and no key is configured"
    (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Anthropic API key is set"
           (claude/list-models {:credentials {:api-key ""}}))))))

(deftest ^:parallel supported-model?-test
  (testing "whitelisted models are supported"
    (doseq [id ["claude-fable-5" "claude-opus-4-8" "claude-sonnet-5" "claude-haiku-4-5-20251001"]]
      (is (true? (#'claude/supported-model? {:id id})) id)))
  (testing "non-whitelisted models are not supported"
    (doseq [id ["claude-3-5-sonnet-20241022" "claude-opus-4-0" "claude-sonnet-4-20250514"]]
      (is (false? (#'claude/supported-model? {:id id})) id))))

(deftest list-models-filters-catalog-to-whitelist-test
  (testing "list-models keeps only whitelisted models sorted by id, preserving display_name"
    (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-byok"]
      (with-redefs [http/request (fn [_]
                                   {:body (json/encode
                                           {:data [{:id "claude-sonnet-5"            :display_name "Claude Sonnet 5"  :created_at "2026-01-01"}
                                                   {:id "claude-opus-4-8"            :display_name "Claude Opus 4.8"  :created_at "2026-02-01"}
                                                   {:id "claude-3-5-sonnet-20241022" :display_name "Claude 3.5"       :created_at "2024-10-22"}
                                                   {:id "claude-fable-5"             :display_name "Claude Fable 5"   :created_at "2026-03-01"}]})})]
        (is (= [{:id "claude-fable-5" :display_name "Claude Fable 5"}
                {:id "claude-opus-4-8" :display_name "Claude Opus 4.8"}
                {:id "claude-sonnet-5" :display_name "Claude Sonnet 5"}]
               (:models (claude/list-models))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; temperature support tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel model-supports-temperature?-test
  (testing "models that accept an explicit temperature"
    (doseq [model ["claude-haiku-4-5" "claude-sonnet-4-6" "claude-sonnet-4-5"
                   "claude-opus-4-5" "claude-opus-4-6" "claude-opus-4-1"]]
      (is (true? (#'claude/model-supports-temperature? model nil))
          model)))
  (testing "sampling parameters were removed starting with Opus 4.7, Sonnet 5, and on Fable models"
    (doseq [model ["claude-opus-4-7" "claude-opus-4-8" "claude-opus-4-8-20260415"
                   "claude-opus-5" "claude-opus-5-0"
                   "claude-sonnet-5" "claude-sonnet-5-0" "claude-sonnet-6"
                   "claude-fable-5"]]
      (is (false? (#'claude/model-supports-temperature? model nil))
          model))))

(deftest ^:parallel model-supports-temperature?-bedrock-prefixed-test
  (testing "Bedrock mantle ids carry an anthropic. vendor prefix that is stripped before the check"
    (doseq [model ["anthropic.claude-opus-4-8" "anthropic.claude-opus-4-7" "anthropic.claude-fable-5"]]
      (is (false? (#'claude/model-supports-temperature? model nil))
          model))
    (is (true? (#'claude/model-supports-temperature? "anthropic.claude-haiku-4-5" nil)))))

(deftest ^:parallel temperature-omitted-for-removed-sampling-models-test
  (let [request-body #(claude/claude-request-body {:model       %
                                                   :input       [{:role :user :content "hi"}]
                                                   :temperature 0.3})]
    (testing "temperature is sent for models that accept it"
      (is (= 0.3 (:temperature (request-body "claude-haiku-4-5")))))
    (testing "temperature is omitted for models that reject sampling parameters"
      (is (not (contains? (request-body "claude-opus-4-8") :temperature)))
      (is (not (contains? (request-body "claude-sonnet-5") :temperature)))
      (is (not (contains? (request-body "anthropic.claude-opus-4-8") :temperature))))))

;;; ──────────────────────────────────────────────────────────────────
;;; thinking-config normalization tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel adaptive-thinking-only?-test
  (testing "models where {:type \"enabled\" :budget_tokens N} still works"
    (doseq [model ["claude-haiku-4-5" "claude-sonnet-4-5" "claude-sonnet-4-6"
                   "claude-opus-4-5" "claude-opus-4-6" "claude-3-haiku-20240307"]]
      (is (false? (#'claude/adaptive-thinking-only? model nil))
          model)))
  (testing "models where budget_tokens returns HTTP 400: Opus 4.7+, any generation 5+, Fable/Mythos"
    (doseq [model ["claude-opus-4-7" "claude-opus-4-8" "claude-opus-4-8-20260415"
                   "claude-sonnet-5" "claude-haiku-5" "claude-opus-5"
                   "claude-fable-5" "claude-mythos-5"
                   "anthropic.claude-sonnet-5"]]
      (is (true? (#'claude/adaptive-thinking-only? model nil))
          model))))

(deftest ^:parallel adaptive-thinking-only?-capabilities-test
  (let [adaptive-only {:thinking {:supported true
                                  :types     {:enabled  {:supported false}
                                              :adaptive {:supported true}}}}
        legacy-ok     {:thinking {:supported true
                                  :types     {:enabled  {:supported true}
                                              :adaptive {:supported true}}}}
        no-thinking   {:thinking {:supported false
                                  :types     {:enabled  {:supported false}
                                              :adaptive {:supported false}}}}]
    (testing "live Models API capabilities take precedence over the version heuristic, in both directions"
      (is (true? (#'claude/adaptive-thinking-only? "claude-sonnet-4-6" adaptive-only)))
      (is (false? (#'claude/adaptive-thinking-only? "claude-sonnet-5" legacy-ok))))
    (testing "a model with no thinking support at all is not adaptive-only"
      (is (false? (#'claude/adaptive-thinking-only? "claude-sonnet-5" no-thinking))))
    (testing "nil capabilities or a map without thinking info falls back to the version heuristic"
      (is (true? (#'claude/adaptive-thinking-only? "claude-sonnet-5" nil)))
      (is (true? (#'claude/adaptive-thinking-only? "claude-sonnet-5" {})))
      (is (false? (#'claude/adaptive-thinking-only? "claude-sonnet-4-6" {}))))))

(deftest ^:parallel thinking-config-uses-model-capabilities-test
  (let [request-body  (fn [model caps]
                        (claude/claude-request-body {:model              model
                                                     :input              [{:role :user :content "hi"}]
                                                     :temperature        0.3
                                                     :thinking           {:type "enabled" :budget_tokens 8000}
                                                     :model-capabilities caps}))
        adaptive-only {:thinking {:supported true
                                  :types     {:enabled  {:supported false}
                                              :adaptive {:supported true}}}}
        legacy-ok     {:thinking {:supported true
                                  :types     {:enabled  {:supported true}
                                              :adaptive {:supported true}}}}]
    (testing "capabilities saying adaptive-only override a heuristic that says legacy"
      (let [body (request-body "claude-sonnet-4-6" adaptive-only)]
        (is (= {:type "adaptive"} (:thinking body)))
        (is (not (contains? body :temperature)))))
    (testing "capabilities saying the legacy shape is supported override a heuristic that says adaptive-only"
      (let [body (request-body "claude-sonnet-5" legacy-ok)]
        (is (= {:type "enabled" :budget_tokens 8000} (:thinking body)))
        (is (= 0.3 (:temperature body)))))))

(deftest claude-raw-capability-lookup-test
  (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-test"]
    (let [caps-json  (fn [enabled? adaptive?]
                       {:body (json/encode
                               {:id           "whatever"
                                :capabilities {:thinking {:supported true
                                                          :types     {:enabled  {:supported enabled?}
                                                                      :adaptive {:supported adaptive?}}}}})})
          run-twice! (fn [opts caps-handler]
                       (reset! @#'claude/model-capabilities-cache {})
                       (let [get-urls (atom [])
                             captured (atom nil)]
                         (with-redefs [self.core/sse-reducible identity
                                       debug/capture-stream    (fn [r _] r)
                                       http/request            (fn [req]
                                                                 (if (= :get (:method req))
                                                                   (do (swap! get-urls conj (:url req))
                                                                       (caps-handler req))
                                                                   (do (reset! captured (json/decode+kw (:body req)))
                                                                       {:body req})))]
                           (dotimes [_ 2]
                             (claude/claude-raw (merge {:model "claude-sonnet-4-6"
                                                        :input [{:role :user :content "hi"}]}
                                                       opts))))
                         {:get-urls @get-urls :thinking (:thinking @captured)}))
          thinking   {:type "enabled" :budget_tokens 1024}]
      (testing "live capabilities override the version heuristic, and the lookup is cached across calls"
        ;; the heuristic says sonnet-4-6 keeps the legacy shape; stubbed live capabilities say adaptive-only
        (is (= {:get-urls ["https://api.anthropic.com/v1/models/claude-sonnet-4-6"]
                :thinking {:type "adaptive"}}
               (run-twice! {:thinking thinking} (fn [_] (caps-json false true))))))
      (testing "a failed lookup falls back to the version heuristic (and the failure is cached too)"
        (is (= {:get-urls ["https://api.anthropic.com/v1/models/claude-sonnet-4-6"]
                :thinking {:type "enabled" :budget_tokens 1024}}
               (run-twice! {:thinking thinking} (fn [_] (throw (ex-info "clj-http: status 404" {:status 404})))))))
      (testing "no capability lookup happens when the request has neither thinking nor temperature"
        (is (= {:get-urls [] :thinking nil}
               (run-twice! {} (fn [_] (throw (ex-info "should not be called" {}))))))))))

(deftest ^:parallel thinking-config-normalized-per-model-test
  (let [request-body (fn [model thinking]
                       (claude/claude-request-body {:model    model
                                                    :input    [{:role :user :content "hi"}]
                                                    :thinking thinking}))]
    (testing "legacy enabled/budget_tokens config passes through unchanged on models that support it"
      (is (= {:type "enabled" :budget_tokens 8000}
             (:thinking (request-body "claude-sonnet-4-6" {:type "enabled" :budget_tokens 8000})))))
    (testing "legacy config is coerced to adaptive on models that reject budget_tokens"
      (doseq [model ["claude-sonnet-5" "claude-opus-4-7" "claude-opus-4-8"
                     "claude-fable-5" "anthropic.claude-sonnet-5"]]
        (is (= {:type "adaptive"}
               (:thinking (request-body model {:type "enabled" :budget_tokens 8000})))
            model)))
    (testing ":effort survives the coercion and is still split out into output_config"
      (let [body (request-body "claude-sonnet-5" {:type "enabled" :budget_tokens 8000 :effort "high"})]
        (is (= {:type "adaptive"} (:thinking body)))
        (is (= {:effort "high"} (:output_config body)))))
    (testing "adaptive config passes through unchanged everywhere it is valid"
      (is (= {:type "adaptive"}
             (:thinking (request-body "claude-sonnet-5" {:type "adaptive"}))))
      (is (= {:type "adaptive"}
             (:thinking (request-body "claude-fable-5" {:type "adaptive"})))))
    (testing "explicit disabled is dropped on Fable/Mythos (rejected there) but kept on other adaptive-only models"
      (is (not (contains? (request-body "claude-fable-5" {:type "disabled"}) :thinking)))
      (is (not (contains? (request-body "claude-mythos-5" {:type "disabled"}) :thinking)))
      (is (= {:type "disabled"}
             (:thinking (request-body "claude-sonnet-5" {:type "disabled"})))))
    (testing "no thinking config means no :thinking key, on any model"
      (is (not (contains? (request-body "claude-sonnet-5" nil) :thinking)))
      (is (not (contains? (request-body "claude-sonnet-4-6" nil) :thinking))))))
