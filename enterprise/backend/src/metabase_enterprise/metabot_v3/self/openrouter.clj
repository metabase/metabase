(ns metabase-enterprise.metabot-v3.self.openrouter
  "OpenRouter / Chat Completions adapter.

  OpenRouter exposes an OpenAI-compatible Chat Completions API (`/v1/chat/completions`)
  which is different from the newer OpenAI Responses API (`/v1/responses`) that our
  `openai.clj` adapter speaks.

  The agent loop produces AISDK parts as its canonical message format. This
  adapter converts those directly to Chat Completions messages."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase-enterprise.llm.settings :as llm]
   [metabase-enterprise.metabot-v3.self.core :as core]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

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
                                                                    (if (string? args) args (json/encode args)))}}]}
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
  "Convert a tool (name + var/map pair) to Chat Completions tool format.

  Accepts [name, var] or [name, {:doc :schema :fn}] pairs — the same format
  that the agent loop provides."
  [tool-or-pair]
  (let [[tool-name tool] (if (vector? tool-or-pair)
                           tool-or-pair
                           [nil tool-or-pair])
        {:keys [doc schema]} (if (map? tool) tool (meta tool))
        [_:=> [_:cat params] _out] schema
        doc        (if (str/starts-with? (or doc "") "Inputs: ")
                     (second (str/split doc #"\n\n  " 2))
                     doc)
        final-name (or tool-name
                       (when (var? tool) (name (:name (meta tool))))
                       "unknown")]
    {:type     "function"
     :function {:name        final-name
                :description doc
                :parameters  (mjs/transform params {:additionalProperties false})}}))

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
                                                                   :usage {:promptTokens     (:prompt_tokens usage 0)
                                                                           :completionTokens (:completion_tokens usage 0)}
                                                                   :id    @message-id
                                                                   :model @model-name}))))))))

;;; HTTP request

(mu/defn openrouter-raw
  "Perform a streaming request to the Chat Completions API.

  Works with OpenRouter, or any OpenAI-compatible endpoint that supports
  `/v1/chat/completions` (e.g. vLLM, Ollama, Together, etc.).

  Accepts the same opts shape as `claude-raw` / `openai-raw`:
    :model, :system, :input (AISDK parts), :tools

  Additional options:
    :temperature - Sampling temperature (omitted by default, uses provider default)
    :max-tokens  - Maximum tokens in the response (omitted by default)
    :tool_choice - Override tool_choice (default: \"auto\" when tools present)
    :raw-tools   - Pre-formatted tool definitions (Chat Completions format),
                   used instead of converting :tools via [[tool->openai-chat]]

  Converts parts to Chat Completions messages via [[parts->cc-messages]]."
  [{:keys [model system input tools temperature max-tokens tool_choice raw-tools]
    :or   {model "anthropic/claude-haiku-4-5"}}
   :- [:map
       [:model {:optional true} :string]
       [:system {:optional true} :string]
       [:input {:optional true} [:sequential :map]]
       [:tools {:optional true} [:sequential [:or
                                              [:fn var?]
                                              [:tuple :string [:fn var?]]
                                              [:tuple :string [:map
                                                               [:doc {:optional true} [:maybe :string]]
                                                               [:schema :any]
                                                               [:fn [:fn fn?]]]]]]]
       [:temperature {:optional true} [:maybe number?]]
       [:max-tokens {:optional true} [:maybe :int]]
       [:tool_choice {:optional true} :any]
       [:raw-tools {:optional true} [:maybe [:sequential :map]]]]]
  (when-not (llm/ee-openrouter-api-key)
    (throw (ex-info "No OpenRouter API key is set" {:api-error true})))
  (let [messages   (cond-> (parts->cc-messages input)
                     system (as-> msgs (into [{:role "system" :content system}] msgs)))
        all-tools  (or (seq raw-tools)
                       (seq (mapv tool->openai-chat tools)))
        req        (cond-> {:model             model
                            :stream            true
                            :stream_options    {:include_usage true}
                            :messages          messages}
                     all-tools   (assoc :tools      (vec all-tools)
                                        :tool_choice (or tool_choice "auto"))
                     temperature (assoc :temperature temperature)
                     max-tokens  (assoc :max_tokens max-tokens))]
    (log/debug "OpenRouter request" {:model model :msg-count (count messages) :tools (count (or tools []))})
    (with-span :info {:name       :metabot-v3.openrouter/request
                      :model      model
                      :msg-count  (count messages)
                      :tool-count (count (or tools []))}
      (try
        (let [res (http/post (str (llm/ee-openrouter-api-base-url) "/v1/chat/completions")
                             {:as      :stream
                              :headers {"Authorization" (str "Bearer " (llm/ee-openrouter-api-key))
                                        "Content-Type"  "application/json"
                                        "HTTP-Referer"  "https://metabase.com"
                                        "X-Title"       "Metabase"}
                              :body    (json/encode req)})]
          (core/sse-reducible (:body res)))
        (catch Exception e
          (if-let [res (some-> (ex-data e) json/decode-body)]
            (let [status (:status res)
                  msg    (case (int status)
                           401 "OpenRouter API key expired or invalid"
                           402 "OpenRouter: insufficient credits"
                           403 "OpenRouter API key has insufficient permissions"
                           404 "OpenRouter: model not found or endpoint unavailable"
                           429 "OpenRouter: rate limited"
                           500 "OpenRouter: internal server error"
                           502 "OpenRouter: upstream provider error"
                           503 "OpenRouter: service unavailable"
                           "Unhandled error accessing OpenRouter API")]
              (throw (ex-info msg (assoc res :api-error true) e)))
            (throw e)))))))

(defn openrouter
  "Call OpenRouter Chat Completions API, return AISDK stream."
  [& args]
  (eduction (openrouter->aisdk-chunks-xf) (apply openrouter-raw args)))
