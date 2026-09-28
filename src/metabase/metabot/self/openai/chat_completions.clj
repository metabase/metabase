(ns metabase.metabot.self.openai.chat-completions
  "Shared support for OpenAI-compatible Chat Completions (`/chat/completions`) adapters.

  Many providers expose an OpenAI-compatible Chat Completions API, so we include common functions here. The agent loop
  produces AISDK parts as its canonical message format; this namespace converts those to Chat Completions messages,
  builds the request body, and translates Chat Completions streaming chunks back into AI SDK v5 protocol chunks.

  Only the generic Chat Completions dialect lives here. Provider-specific concerns belong in the provider adapters,
  which can post-process the body [[request-body]] returns."
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.schema :as schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (metabase.metabot.providers AiSdkChunk$FinishReason)
   (metabase.metabot.providers.chat ChatCompletionsTranslator)))

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
                             (let [tool-calls (into [] (mapcat :tool_calls) group)
                                   ;; :reasoning_content exists on a member only when the replay
                                   ;; hook of [[parts->cc-messages]] minted it — today only
                                   ;; Moonshot, whose dialect replays reasoning as a top-level
                                   ;; sibling of :content (see
                                   ;; [[metabase.metabot.self.moonshot/reasoning-message]]).
                                   ;; Joined in part order: the wire has a single field per
                                   ;; message, so order is the only fidelity available.
                                   reasoning  (apply str (keep :reasoning_content group))
                                   ;; Vector (chunk-array) content exists only when the reasoning
                                   ;; replay hook of [[parts->cc-messages]] produced it — today
                                   ;; only Mistral's think chunks. Every other provider's members
                                   ;; are strings or nil, so they always take the original string
                                   ;; join below.
                                   content    (if (some (comp vector? :content) group)
                                                (into [] (mapcat (fn [{c :content}]
                                                                   (cond (vector? c)   c
                                                                         (not-empty c) [{:type "text" :text c}])))
                                                      group)
                                                (->> group (keep :content) (str/join "")))]
                               ;; :content should be always there, even if empty/nil
                               [(cond-> {:role "assistant" :content content}
                                  (seq tool-calls)      (assoc :tool_calls tool-calls)
                                  (not-empty reasoning) (assoc :reasoning_content reasoning))])
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
  ([parts] (parts->cc-messages parts nil))
  ([parts {:keys [reasoning-part->message]}]
   ;; coalescing runs only when a dialect passes a replay hook — today Mistral (think chunks)
   ;; and Moonshot (top-level reasoning_content), the two Chat Completions dialects that define
   ;; a reasoning replay channel
   (->> (cond-> parts reasoning-part->message core/merge-reasoning-parts)
        (keep (fn [part]
                (case (:type part)
                  ;; The generic Chat Completions dialect has no replay channel for
                  ;; reasoning, so by default it drops here — this arm returns nil for
                  ;; every provider that doesn't pass a hook. A dialect that defines a
                  ;; channel passes :reasoning-part->message, a fn from a coalesced
                  ;; :reasoning part to a replayed assistant message (or nil); today
                  ;; Mistral (think chunks — see
                  ;; [[metabase.metabot.self.mistral/think-message]]) and Moonshot
                  ;; (top-level reasoning_content — see
                  ;; [[metabase.metabot.self.moonshot/reasoning-message]]) do. Z.AI and
                  ;; vLLM define no such channel yet; when they grow one, each gets its
                  ;; own hook fn here rather than more shared code.
                  :reasoning   (when reasoning-part->message
                                 (reasoning-part->message part))
                  :text        {:role "assistant" :content (:text part)}
                  :tool-input  {:role       "assistant"
                                :content    nil
                                :tool_calls [{:id       (:id part)
                                              :type     "function"
                                              :function {:name      (:function part)
                                                         :arguments (let [args (:arguments part)]
                                                                      (if (string? args)
                                                                        args
                                                                        (json/encode (or args {}))))}}]}
                  :tool-output {:role         "tool"
                                :tool_call_id (:id part)
                                :content      (or (get-in part [:result :output])
                                                  (when-let [err (:error part)]
                                                    (str "Error: " (:message err)))
                                                  (pr-str (:result part)))}
                  ;; User messages pass through
                  {:role    (name (or (:role part) "user"))
                   :content (or (:content part) "")})))
        merge-consecutive-assistant-messages)))

;;; Tool definition format

(defn- tool->cc-tool
  "Convert a tool definition map to Chat Completions tool format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [tool]
  {:type     "function"
   :function (schema/tool-function tool)})

;;; Streaming response → AISDK v5 chunks

(def stop-reasons
  "Chat Completions `finish_reason` → AI SDK v5 `FinishReason`. Adapters whose dialect adds reasons beyond OpenAI's
  extend this and pass the result to [[chat-completions->aisdk-chunks-xf]]."
  {"stop"           "stop"
   "length"         "length"
   "tool_calls"     "tool-calls"
   "function_call"  "tool-calls"
   "content_filter" "content-filter"})

(defn chat-completions->aisdk-chunks-xf
  "Translates Chat Completions streaming chunks into AI SDK v5 protocol chunks; the translation itself is
  [[ChatCompletionsTranslator]].

  Takes the dialect's `finish_reason` table, defaulting to OpenAI's [[stop-reasons]]. `opts` may carry
  `:forward-reasoning?`, which additionally translates reasoning deltas into :reasoning-start / :reasoning-delta /
  :reasoning-end."
  ([]
   (chat-completions->aisdk-chunks-xf stop-reasons nil))
  ([stop-reasons]
   (chat-completions->aisdk-chunks-xf stop-reasons nil))
  ([stop-reasons {:keys [forward-reasoning?]}]
   (let [table (AiSdkChunk$FinishReason/table stop-reasons)]
     (core/translator-xf #(ChatCompletionsTranslator. core/mkid table (boolean forward-reasoning?) core/log-malformed-event)))))

;;; Request body

(def ^:private CCOpts
  "Dialect hooks for [[request-body]] that are not request options."
  [:maybe [:map {:closed true}
           [:reasoning-part->message {:optional true} [:maybe [:fn fn?]]]]])

(mu/defn request-body
  "Build the Chat Completions request body for an LLM request.

  The optional `cc-opts` map holds dialect hooks that are not request options —
  today only `:reasoning-part->message`, threaded to [[parts->cc-messages]]. A
  fn-valued hook stays out of the traced and logged `LLMRequestOpts` on purpose."
  ([opts :- core/LLMRequestOpts] (request-body opts nil))
  ([{:keys [model system input tools temperature max-tokens tool_choice schema]} :- core/LLMRequestOpts
    cc-opts :- CCOpts]
   (let [messages  (cond-> (parts->cc-messages input cc-opts)
                     system (as-> msgs (into [{:role "system" :content system}] msgs)))
         all-tools (or (when schema
                         ;; Structured output: force a tool call with the given JSON schema
                         [{:type     "function"
                           :function {:name        "structured_output"
                                      :description "Output structured data"
                                      :parameters  schema}}])
                       (seq (mapv tool->cc-tool tools)))]
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
       max-tokens  (assoc :max_tokens max-tokens)))))

;;; Model catalog

(defn models-catalog
  "Extract the model list from an OpenAI-compatible `GET /models` response, failing closed.

  `(get-in res [:body :data])` yields nil for any body shape we don't recognize — a base URL pointing at
  something that isn't a model endpoint, an HTML error page, a provider that renamed the key. Returning nil
  leaves the caller's whitelist intersection empty, so the admin Connect flow succeeds against a provider we
  never actually reached and leaves an empty model picker with no diagnostic. Throw instead.

  `provider-name` is the display name, used in the message. The exception is tagged `:api-error` so the
  adapter's surrounding [[metabase.metabot.self.core/rethrow-api-error!]] rethrows it unchanged, and
  `:status-code 400` so it reaches the admin as their misconfiguration. Without it `metabase.llm.api.provider`'s
  `provider-client-error?` does not recognise it, and the Connect path rethrows it as an unhandled 500:
  the admin still sees the sentence, but it bumps the unhandled-error counter and collapses to \"Something
  went wrong\" under `MB_HIDE_STACKTRACES=true`, losing the diagnostic for the operators who enabled that.

  A well-formed but empty `data` is a legitimate response — an account with no accessible models — and passes.

  `:detail` is a sentence appended to the message, for a provider that has something more specific to say."
  ([provider-name res] (models-catalog provider-name res nil))
  ([provider-name res {:keys [detail]}]
   (let [data (get-in res [:body :data])]
     (when-not (sequential? data)
       (throw (ex-info (cond-> (tru "{0} returned an unexpected model list response" provider-name)
                         detail (str ". " detail))
                       {:api-error   true
                        :status-code 400
                        :error-code  :malformed-model-catalog})))
     data)))
