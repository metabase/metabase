(ns metabase.metabot.self.openai.chat-completions
  "Generic, provider-agnostic OpenAI Chat Completions adapter.

  Speaks the OpenAI-compatible Chat Completions API against any endpoint the admin points
  us at — vLLM, Ollama, LiteLLM, Together, Fireworks, Groq, a self-hosted gateway, etc.
  Both the base URL and the model are admin-supplied (see `llm-chat-completions-*` settings);
  there is no model whitelist and no provider-specific behavior.

  Following the universal OpenAI-SDK convention, the configured base URL includes the API
  version segment (e.g. `https://api.example.com/v1`); this adapter appends `/chat/completions`
  and `/models` to it.

  This deliberately carries *no* vendor-specific concerns: unlike
  [[metabase.metabot.self.openrouter]] it never detects Anthropic models, never adds
  `cache_control` breakpoints, and sends no OpenRouter routing headers. It is meant to
  be the reusable core that the OpenRouter adapter can later be ported onto.

  The agent loop produces AISDK parts as its canonical message format; this adapter
  converts those directly to Chat Completions messages."
  (:require
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase.llm.settings :as llm]
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

(defn- usage->aisdk-usage
  "Convert a Chat Completions `usage` block into the AISDK `:usage` shape.

  The OpenAI-compatible `usage` reports `prompt_tokens` as the total input count, with
  the cache buckets a subset breakdown of it under `prompt_tokens_details`. Endpoints
  that don't report caching simply omit these, so they default to 0."
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
       (map (fn [part]
              (case (:type part)
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

(defn- tool->cc
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

;;; Auth / HTTP plumbing

(defn- settings-credentials
  "Chat Completions credentials from the `llm-chat-completions-*` settings."
  []
  {:api-key  (not-empty (llm/llm-chat-completions-api-key))
   :base-url (not-empty (llm/llm-chat-completions-api-base-url))})

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for the Chat Completions provider")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- resolve-cc-auth
  "Resolve the `{:url ... :headers ...}` auth map for a Chat Completions request.

  Falls back to [[settings-credentials]] when `credentials` is nil. Throws when the base URL
  or API key is missing. `:ai-proxy?` is not supported and throws when true (it is accepted
  only for parity with the other adapters)."
  [credentials ai-proxy?]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [{:keys [api-key base-url]} (or credentials (settings-credentials))]
    (when (str/blank? base-url)
      (throw (ex-info (tru "No Chat Completions base URL is set")
                      {:api-error  true
                       :error-code :api-key-missing})))
    (core/resolve-auth "chat-completions" "Chat Completions"
                       (when-not (str/blank? api-key)
                         {:url     base-url
                          :headers {"Authorization" (str "Bearer " api-key)}})
                       ai-proxy?)))

(defn- error-msg
  "Canonical, status-specific Chat Completions error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "Chat Completions API key expired or invalid")
      403 (tru "Chat Completions API key has insufficient permissions")
      404 (tru "Chat Completions endpoint was not found — check the base URL")
      429 (tru "Chat Completions endpoint has rate limited us")
      500 (tru "Chat Completions endpoint returned an internal server error")
      502 (tru "Chat Completions upstream provider returned an error")
      503 (tru "Chat Completions endpoint is unavailable")
      (tru "Chat Completions API error (HTTP {0})" status))))

(defn list-models
  "List the models advertised by the configured Chat Completions endpoint (`GET /v1/models`).

  Doubles as the connect-time credential check: a successful round trip proves the base URL and
  API key reach an authenticated OpenAI-compatible surface. No-arg uses the configured settings.
  Opts map supports `:credentials` (`{:api-key ... :base-url ...}`) and `:ai-proxy?`;
  `:ai-proxy?` is not supported and throws when true."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy?]}]
   (try
     (let [auth (resolve-cc-auth credentials ai-proxy?)
           res  (core/request auth {:method  :get
                                    :url     "/models"
                                    :as      :json
                                    :headers {"Content-Type" "application/json"}})]
       {:models (->> (get-in res [:body :data])
                     (keep :id)
                     sort
                     (mapv (fn [id] {:id id :display_name id})))})
     (catch Exception e
       (core/rethrow-api-error! "chat-completions" error-msg e)))))

;;; Streaming response → AISDK v5 chunks

(defn cc->aisdk-chunks-xf
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
                                                                   :usage (usage->aisdk-usage usage)
                                                                   :id    @message-id
                                                                   :model @model-name}))))))))

;;; HTTP request

(mu/defn chat-completions-request-body
  "Build the Chat Completions request body for an LLM request."
  [{:keys [model system input tools temperature max-tokens tool_choice schema]} :- core/LLMRequestOpts]
  (let [messages  (cond-> (parts->cc-messages input)
                    system (as-> msgs (into [{:role "system" :content system}] msgs)))
        all-tools (or (when schema
                        ;; Structured output: force a tool call with the given JSON schema
                        [{:type     "function"
                          :function {:name        "structured_output"
                                     :description "Output structured data"
                                     :parameters  schema}}])
                      (seq (mapv tool->cc tools)))]
    (cond-> {:model          model
             :stream         true
             :stream_options {:include_usage true}
             :messages       messages}
      all-tools   (assoc :tools       (vec all-tools)
                         :tool_choice (cond
                                        schema      "required"
                                        tool_choice tool_choice
                                        :else       "auto"))
      temperature (assoc :temperature temperature)
      max-tokens  (assoc :max_tokens max-tokens))))

(mu/defn chat-completions-raw
  "Perform a streaming request to the Chat Completions API.
  `:ai-proxy?` is not supported and throws when true."
  [{:keys [model tools credentials ai-proxy?] :as opts} :- core/LLMRequestOpts]
  (let [req (chat-completions-request-body opts)]
    (log/debug "Chat Completions request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.chat-completions/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [auth     (resolve-cc-auth credentials ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/chat/completions"
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "chat-completions"
                                     :model    model
                                     :url      "/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "chat-completions" error-msg e))))))

(defn chat-completions
  "Call a generic Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply chat-completions-raw args)]
    (eduction (cc->aisdk-chunks-xf) raw)))
