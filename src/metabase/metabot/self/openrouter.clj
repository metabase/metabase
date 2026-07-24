(ns metabase.metabot.self.openrouter
  "OpenRouter / Chat Completions adapter.

  OpenRouter exposes an OpenAI-compatible Chat Completions API (`/v1/chat/completions`)
  which is different from the newer OpenAI Responses API (`/v1/responses`) that our
  `openai.clj` adapter speaks.

  The agent loop produces AISDK parts as its canonical message format. This
  adapter converts those directly to Chat Completions messages."
  (:require
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defn- openrouter-usage->aisdk-usage
  "Convert an OpenRouter Chat Completions `usage` block into the AISDK `:usage` shape.

  OpenRouter normalizes usage to the OpenAI shape regardless of the upstream
  provider: `prompt_tokens` is the total input count, and the cache buckets are
  a subset breakdown of it under `prompt_tokens_details`:

      cached_tokens      — input tokens read from the provider cache
      cache_write_tokens — input tokens written to the provider cache;
                           Anthropic models only. OpenAI caching is
                           automatic, its writes are free and reported
                           as 0 (or omitted entirely)."
  [u]
  (let [details (:prompt_tokens_details u)]
    {:promptTokens        (:prompt_tokens u 0)
     :completionTokens    (:completion_tokens u 0)
     :cacheCreationTokens (or (:cache_write_tokens details) 0)
     :cacheReadTokens     (or (:cached_tokens details) 0)}))

;;; AISDK parts → Chat Completions messages

(defn- merge-consecutive-assistant-messages
  "Merge consecutive assistant messages.

  Chat Completions allows text + tool_calls on a single assistant message, so
  when we see a :text part followed by :tool-input parts we fold them together."
  [messages]
  (into [] (comp (partition-by :role)
                 (mapcat (fn [group]
                           (if (and (< 1 (count group))
                                    (= "assistant" (:role (first group))))
                             (let [text       (->> group (keep :content) (str/join ""))
                                   tool-calls (into [] (mapcat :tool_calls) group)]
                               ;; :content should be always there, even if empty/nil
                               [(cond-> {:role "assistant" :content text}
                                  (seq tool-calls) (assoc :tool_calls tool-calls))])
                             group))))
        messages))

(defn parts->cc-messages
  "Convert a sequence of AISDK parts into Chat Completions messages.

  Input: flat sequence of AISDK parts and user messages:
    {:role :user, :content \"...\"}
    {:type :text, :text \"...\"}
    {:type :tool-input, :id ..., :function ..., :arguments ...}
    {:type :tool-output, :id ..., :result ...}

  Output: Chat Completions messages (user, assistant with tool_calls, tool)."
  [parts]
  (->> parts
       (keep (fn [part]
               (case (:type part)
                 ;; reasoning is not replayable over Chat Completions
                 :reasoning   nil
                 :text        {:role "assistant" :content (:text part)}
                 :tool-input  {:role       "assistant"
                               :content    nil
                               :tool_calls [{:id       (:id part)
                                             :type     "function"
                                             :function {:name      (:function part)
                                                        :arguments (let [args (:arguments part)]
                                                                     (if (string? args) args (json/encode (or args {}))))}}]}
                 :tool-output {:role         "tool"
                               :tool_call_id (:id part)
                               :content      (or (get-in part [:result :output])
                                                 (when-let [err (:error part)]
                                                   (str "Error: " (:message err)))
                                                 (pr-str (:result part)))}
                 ;; User messages pass through
                 {:role    (name (or (:role part) "user"))
                  :content (or (:content part) "")})))
       merge-consecutive-assistant-messages))

;;; Tool definition format

(defn- tool->openai-chat
  "Convert a tool definition map to Chat Completions tool format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params     (schema/filter-schema-by-features params)
        doc        (if (str/starts-with? (or doc "") "Inputs: ")
                     (second (str/split doc #"\n\n  " 2))
                     doc)]
    {:type     "function"
     :function {:name        tool-name
                :description doc
                :parameters  (mjs/transform params {:additionalProperties false})}}))

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for OpenRouter")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- openrouter-error-msg
  "Canonical, status-specific OpenRouter error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "OpenRouter API key expired or invalid")
      402 (tru "OpenRouter has insufficient credits")
      403 (tru "OpenRouter API key has insufficient permissions")
      404 (tru "OpenRouter model listing endpoint is unavailable")
      429 (tru "OpenRouter has rate limited us")
      500 (tru "OpenRouter returned an internal server error")
      502 (tru "OpenRouter upstream provider returned an error")
      503 (tru "OpenRouter service is unavailable")
      (tru "OpenRouter API error (HTTP {0})" status))))

(def ^:private supported-models
  "OpenRouter models offered in the Metabot model picker, as a map of model id -> display name.
  `list-models` returns the intersection of this map with the `/v1/models` catalog.
  Mirrors the models whitelisted for the direct anthropic and openai providers; note that
  OpenRouter model IDs use dots in version numbers (`claude-haiku-4.5`), unlike the
  Anthropic API's hyphenated IDs (`claude-haiku-4-5`)."
  {"anthropic/claude-fable-5"    "Claude Fable 5"
   "anthropic/claude-opus-4.8"   "Claude Opus 4.8"
   "anthropic/claude-opus-4.7"   "Claude Opus 4.7"
   "anthropic/claude-opus-4.6"   "Claude Opus 4.6"
   "anthropic/claude-opus-4.5"   "Claude Opus 4.5"
   "anthropic/claude-opus-4.1"   "Claude Opus 4.1"
   "anthropic/claude-sonnet-5"   "Claude Sonnet 5"
   "anthropic/claude-sonnet-4.6" "Claude Sonnet 4.6"
   "anthropic/claude-sonnet-4.5" "Claude Sonnet 4.5"
   "anthropic/claude-haiku-4.5"  "Claude Haiku 4.5"
   "openai/gpt-5.6-sol"          "GPT-5.6 Sol"
   "openai/gpt-5.6-terra"        "GPT-5.6 Terra"
   "openai/gpt-5.6-luna"         "GPT-5.6 Luna"
   "openai/gpt-5.5"              "GPT-5.5"
   "openai/gpt-5.5-pro"          "GPT-5.5 Pro"
   "openai/gpt-5.4"              "GPT-5.4"
   "openai/gpt-5.4-pro"          "GPT-5.4 Pro"
   "openai/gpt-5.4-mini"         "GPT-5.4 Mini"})

(defn- supported-model?
  "Whether a `/v1/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full OpenRouter model catalog (`GET /v1/models`).
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "openrouter" "OpenRouter"
                                  (when-let [k (or (not-empty (:api-key credentials))
                                                   (not-empty (llm/llm-openrouter-api-key)))]
                                    {:url     (llm/llm-openrouter-api-base-url)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/v1/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"
                                             "HTTP-Referer" "https://metabase.com"
                                             "X-Title"      "Metabase"}})]
      (get-in res [:body :data]))
    (catch Exception e
      (core/rethrow-api-error! "openrouter" openrouter-error-msg e))))

(defn list-models
  "List the OpenRouter models supported by this adapter (see [[supported-models]]).
  No-arg uses the configured API key. Opts map supports `:credentials` (`{:api-key ...}`) and `:ai-proxy?`.
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id] :as model}]
                         {:id id :display_name (or (:name model) (supported-models id))})))}))

;;; Streaming response → AISDK v5 chunks

(defn openrouter->aisdk-chunks-xf
  "Translates Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  Chat Completions streaming format:
    {\"id\":\"chatcmpl-xxx\",
     \"object\":\"chat.completion.chunk\",
     \"model\":\"...\",
     \"choices\":[{\"index\":0,
                   \"delta\":{\"role\":\"assistant\",\"content\":\"Hello\"},
                   \"finish_reason\":null}],
     \"usage\":{...}}

  Emits the same internal chunk types as claude.clj and openai.clj:
    :start, :text-start, :text-delta, :text-end,
    :tool-input-start, :tool-input-delta, :tool-input-available,
    :usage

  Chat Completions has no explicit start/stop events per content block like
  Claude or OpenAI Responses do — we infer transitions from the delta shape.
  Parallel tool calls arrive with different `index` values; when a new index
  appears the previous tool is complete."
  []
  (fn [rf]
    (let [current-type (volatile! nil) ;; :text | :function_call | nil
          current-id   (volatile! nil) ;; active chunk id (text-id or tool call_id)
          message-id   (volatile! nil)
          model-name   (volatile! nil)
          payload      (volatile! {})  ;; carried across start/delta/end, same as openai.clj
          close!       (fn [result]
                         (u/prog1 (rf result (merge {:type (case @current-type
                                                             :text          :text-end
                                                             :function_call :tool-input-available)}
                                                    @payload))
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))]
      (fn
        ([result]
         (cond-> result
           @current-type (close!)
           true          (rf)))

        ([result {:keys [id model choices usage] :as _chunk}]
         (let [choice        (first choices)
               delta         (:delta choice)
               finish-reason (:finish_reason choice)
               tool-call     (first (:tool_calls delta))
               ;; Determine what kind of content this chunk carries.
               ;; Empty-string content (common between tool calls) is ignored
               ;; to avoid spurious text blocks that would close open tools.
               chunk-type    (cond
                               (not-empty (:content delta)) :text
                               (some? tool-call)            :function_call
                               :else                        nil)
               ;; For new tool calls, the id comes from the chunk; for deltas
               ;; on the same tool, we keep current-id.
               chunk-id      (or (:id tool-call) @current-id (core/mkid))]
           (cond-> result
             ;; Emit :start on first chunk
             (and id (not @message-id))                       (-> (rf {:type :start :messageId id})
                                                                  (u/prog1
                                                                    (vreset! message-id id)
                                                                    (vreset! model-name model)))
             ;; Close previous block when type changes, or when a new tool
             ;; call arrives (different id = different tool in parallel)
             (and @current-type
                  (or (and chunk-type
                           (not= chunk-type @current-type))
                      (and (= chunk-type :function_call)
                           (not= chunk-id @current-id))))     (close!)
             ;; Start a new text block
             (and (= chunk-type :text)
                  (not= @current-type :text))                 (-> (u/prog1
                                                                    (let [tid (core/mkid)]
                                                                      (vreset! current-type :text)
                                                                      (vreset! current-id tid)
                                                                      (vreset! payload {:id tid})))
                                                                  (rf (merge {:type :text-start} @payload)))
             ;; Text delta
             (and (= chunk-type :text)
                  (some? (:content delta)))                   (rf {:type  :text-delta
                                                                   :id    @current-id
                                                                   :delta (:content delta)})
             ;; Start a new tool call block
             (and (= chunk-type :function_call)
                  (:id tool-call)
                  (:name (:function tool-call)))              (-> (u/prog1
                                                                    (vreset! current-type :function_call)
                                                                    (vreset! current-id (:id tool-call))
                                                                    (vreset! payload {:toolCallId (:id tool-call)
                                                                                      :toolName   (:name (:function tool-call))}))
                                                                  (rf (merge {:type :tool-input-start} @payload))
                                                                  ;; Emit initial arguments if present
                                                                  (cond-> (not (str/blank? (:arguments (:function tool-call))))
                                                                    (rf {:type           :tool-input-delta
                                                                         :toolCallId     (:id tool-call)
                                                                         :inputTextDelta (:arguments (:function tool-call))})))
             ;; Tool argument delta (continuation of existing tool call)
             (and (= chunk-type :function_call)
                  (not (:id tool-call))
                  (some? (:arguments (:function tool-call)))) (rf {:type           :tool-input-delta
                                                                   :toolCallId     (:toolCallId @payload)
                                                                   :inputTextDelta (:arguments (:function tool-call))})
             ;; Finish reason — close whatever is open
             (some? finish-reason)                            (cond->
                                                               @current-type (close!))
             ;; Usage (often on a separate final chunk with empty choices)
             (some? usage)                                    (rf {:type  :usage
                                                                   :usage (openrouter-usage->aisdk-usage usage)
                                                                   :id    @message-id
                                                                   :model @model-name}))))))))

;;; HTTP request

(defn- anthropic-model?
  "Whether an OpenRouter model id routes to Anthropic (e.g. `anthropic/claude-haiku-4.5`)."
  [model]
  (str/starts-with? (str model) "anthropic/"))

(defn- system->cc-message
  "Build the Chat Completions system message for `system`.

  Anthropic models get explicit prompt-cache breakpoints: the content becomes
  Anthropic-style text blocks with `cache_control` markers (see
  [[claude/system->cached-content-blocks]]), which OpenRouter passes through to
  Anthropic unchanged. Anthropic's cache prefix orders tools before system, so a
  breakpoint on the system blocks caches the tool definitions too; OpenRouter
  doesn't document `cache_control` on tool definitions, so unlike claude.clj we
  don't put a separate breakpoint there.

  Other models (OpenAI) get a plain string system message: OpenAI prompt caching
  is automatic server-side and takes no request markup."
  [system model]
  {:role    "system"
   :content (cond-> system
              (anthropic-model? model) claude/system->cached-content-blocks)})

(mu/defn openrouter-request-body
  "Build the Chat Completions request body for an LLM request."
  [{:keys [model system input tools temperature max-tokens tool_choice schema]
    :or   {model "anthropic/claude-haiku-4.5"}} :- core/LLMRequestOpts]
  (let [messages  (cond-> (parts->cc-messages input)
                    system (as-> msgs (into [(system->cc-message system model)] msgs)))
        all-tools (or (when schema
                        ;; Structured output: force a tool call with the given JSON schema
                        [{:type     "function"
                          :function {:name        "structured_output"
                                     :description "Output structured data"
                                     :parameters  schema}}])
                      (seq (mapv tool->openai-chat tools)))]
    (cond-> {:model             model
             :stream            true
             :stream_options    {:include_usage true}
             :messages          messages}
      all-tools   (assoc :tools       (vec all-tools)
                         :tool_choice (cond
                                        schema      "required"
                                        tool_choice tool_choice
                                        :else       "auto"))
      temperature (assoc :temperature temperature)
      max-tokens  (assoc :max_tokens max-tokens))))

(mu/defn openrouter-raw
  "Perform a streaming request to the Chat Completions API.

  Works with OpenRouter, or any OpenAI-compatible endpoint that supports
  `/v1/chat/completions` (e.g. vLLM, Ollama, Together, etc.).
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  [{:keys [model tools ai-proxy?] :as opts
    :or   {model "anthropic/claude-haiku-4.5"}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (openrouter-request-body opts)]
    (log/debug "OpenRouter request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.openrouter/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (llm/llm-openrouter-api-key))
              auth     (core/resolve-auth "openrouter" "OpenRouter"
                                          (when api-key
                                            {:url     (llm/llm-openrouter-api-base-url)
                                             :headers {"Authorization" (str "Bearer " api-key)}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/v1/chat/completions"
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"
                                                "HTTP-Referer" "https://metabase.com"
                                                "X-Title"      "Metabase"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "openrouter"
                                     :model    model
                                     :url      "/v1/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "openrouter" openrouter-error-msg e))))))

(defn openrouter
  "Call OpenRouter Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply openrouter-raw args)]
    (eduction (openrouter->aisdk-chunks-xf) raw)))
