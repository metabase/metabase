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
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- usage->aisdk-usage
  "Convert a Chat Completions `usage` block into the AISDK `:usage` shape.

  `prompt_tokens` is the total input count, and the cache buckets are a subset
  breakdown of it under `prompt_tokens_details`:

      cached_tokens      — input tokens read from the provider cache
      cache_write_tokens — input tokens written to the provider cache;
                           undocumented but reported by both OpenRouter
                           (Anthropic models) and newer OpenAI models.
                           Providers without it (e.g. Z.AI) omit it."
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

(defn- delta-reasoning
  "Reasoning text carried by a Chat Completions delta or message, under either spelling. vLLM 0.26
  emits `reasoning` and treats `reasoning_content` as its deprecated name; older builds, Z.AI, and
  other OpenAI-compatible servers still emit the latter, and a self-hosted server's version is the
  customer's choice."
  [m]
  (or (not-empty (:reasoning m))
      (not-empty (:reasoning_content m))))

(defn- conj-tool-call-delta
  "Fold one `delta.tool_calls` entry into `state`, the tool calls a response has streamed so far:
  `:calls`, a vector of `{:id :name :args}` in arrival order, `:args` holding the argument fragments;
  `:by-key`, the position of the call each `index` and each `id` last addressed; and
  `:previous`, the position the previous entry addressed.

  An entry joins the call its `index` addresses, falling back to its `id`, then to the previous entry's
  call. A blank `id` counts as no `id`. It opens a new call when nothing is addressed yet, or when it
  carries an `id` that differs from the addressed call's — a server reusing one `index` for several
  calls. A call adopts the first `id` and `name` any of its entries carry. The `index` outranks the `id`, so
  two calls that have the same `id` at different indexes stay two calls, and [[with-ids]] rejects them."
  [{:keys [calls by-key previous] :as _state} {:keys [index id function] :as _tool-call}]
  (let [id       (when-not (str/blank? id) id)
        pos      (cond
                   (some? index) (get by-key index)
                   id            (get by-key id)
                   :else         previous)
        existing (some->> pos (nth calls))
        new?     (or (nil? existing)
                     (and id (:id existing) (not= id (:id existing))))
        pos      (if new? (count calls) pos)
        base     (if new? {:args []} existing)
        call     (cond-> base
                   (and id (nil? (:id base)))          (assoc :id id)
                   (and (not-empty (:name function))
                        (nil? (:name base)))           (assoc :name (:name function))
                   (not-empty (:arguments function))   (update :args conj (:arguments function)))]
    {:calls    (assoc calls pos call)
     :by-key   (cond-> by-key
                 (some? index) (assoc index pos)
                 id            (assoc id pos))
     :previous pos}))

(defn- with-ids
  "Give each call in `calls` that has no `id` a minted one. Downstream, chunks and tool results join by
  `toolCallId`, so the server must send a different `id` for each call. If two calls have the same `id`, this
  throws: no known server does this, so we do not guess how to separate them."
  [calls]
  (doseq [[id same-id-calls] (group-by :id (filter :id calls))
          :when (> (count same-id-calls) 1)]
    (throw (ex-info (format "Model stream sent the tool call id %s for %d different calls"
                            (pr-str id) (count same-id-calls))
                    {:id         id
                     :tool-names (mapv :name same-id-calls)})))
  (mapv #(update % :id (fn [id] (or id (core/mkid)))) calls))

(defn- tool-call-chunks
  "The AI SDK chunks for one assembled tool call: its start, one delta that holds all its arguments, and
  its availability. The call is emitted whole, so one delta is sufficient. A call that never received a
  `name` cannot be run and yields no chunks."
  [{:keys [id name args]}]
  (if (str/blank? name)
    (do (log/warnf "Dropping a streamed tool call that carried no function name (id %s)" (pr-str id))
        [])
    (let [arguments (str/join args)]
      (cond-> [{:type :tool-input-start :toolCallId id :toolName name}]
        (not-empty arguments) (conj {:type :tool-input-delta :toolCallId id :inputTextDelta arguments})
        true                  (conj {:type :tool-input-available :toolCallId id :toolName name})))))

(defn chat-completions->aisdk-chunks-xf
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
    :usage, :error

  Chat Completions has no explicit start/stop events per content block like
  Claude or OpenAI Responses do — we infer transitions from the delta shape.

  Tool calls are assembled per call — keyed by `index`, falling back to `id` (see
  [[conj-tool-call-delta]]) — and emitted once the response finishes, each call's
  chunks contiguous and in arrival order. That tolerates servers that send a call's
  `id` late, repeat it on every chunk, put several calls in one delta, or interleave
  the deltas of parallel calls; the cost is that no tool call is emitted before the
  response's `finish_reason` (or the end of the stream).

  Takes the dialect's `finish_reason` table, defaulting to OpenAI's [[stop-reasons]]. A reason the table maps to
  \"error\" (Mistral's `error`, Z.AI's `network_error`) fails the response the same way an error object does.

  `opts` may carry `:forward-reasoning?`, which additionally translates reasoning
  deltas (see [[delta-reasoning]]) into :reasoning-start / :reasoning-delta /
  :reasoning-end. Opt-in, because whether a provider's reasoning renders at all is
  a separate question (see `metabot.settings/llm-metabot-supports-reasoning?`) and
  chunks nothing consumes only add stream volume."
  ([]
   (chat-completions->aisdk-chunks-xf stop-reasons nil))
  ([stop-reasons]
   (chat-completions->aisdk-chunks-xf stop-reasons nil))
  ([stop-reasons {:keys [forward-reasoning?]}]
   (fn [rf]
     (let [current-type (volatile! nil) ;; :text | :reasoning | nil
           message-id   (volatile! nil)
           model-name   (volatile! nil)
           payload      (volatile! {})  ;; carried across start/delta/end, same as openai.clj; :id is the open block's id
           stop-reason  (volatile! nil)
           no-calls     {:calls [] :by-key {} :previous nil}
           tool-calls   (volatile! no-calls)
           ;; Close the open text or reasoning block, if there is one
           close!       (fn [result]
                          (if-let [block-type @current-type]
                            (u/prog1 (rf result (merge {:type (case block-type
                                                                :text      :text-end
                                                                :reasoning :reasoning-end)}
                                                       @payload))
                              (vreset! current-type nil)
                              (vreset! payload {}))
                            result))
           ;; Close the open block, then emit the assembled tool calls. A `reduced` result stops the
           ;; emission and stays wrapped, so the consumer's early termination reaches the caller.
           finish!      (fn [result]
                          (u/prog1 (u/reduce-preserving-reduced
                                    rf
                                    (close! result)
                                    (mapcat tool-call-chunks (with-ids (:calls @tool-calls))))
                            (vreset! tool-calls no-calls)))]
       (fn
         ([result]
          (rf (unreduced (finish! result))))

         ([result {:keys [id model choices usage error] :as _chunk}]
          (let [choice        (first choices)
                delta         (:delta choice)
                finish-reason (:finish_reason choice)
                error-text    (when (or (some? error)
                                        (= "error" (core/stop-reason->finish-reason stop-reasons finish-reason)))
                                (or (:message error)
                                    (some-> error pr-str)
                                    (tru "The model provider failed to complete the response")))
                call-deltas   (:tool_calls delta)
                reasoning-md  (:reasoning_metadata delta)
                ;; Determine what kind of content this chunk carries.
                ;; Empty-string content (common between tool calls) is ignored
                ;; to avoid spurious text blocks.
                chunk-type    (cond
                                (not-empty (:content delta))  :text
                                ;; tool_calls outrank reasoning, so a delta carrying both loses its
                                ;; reasoning fragment: display text, recoverable. No probed provider
                                ;; combines the two in one delta today.
                                (seq call-deltas)             :function_call
                                (and forward-reasoning?
                                     (delta-reasoning delta)) :reasoning
                                :else                         nil)]
            (cond-> result
              ;; Emit :start on first chunk
              (and id (not @message-id))                       (-> (rf {:type :start :messageId id})
                                                                   (u/prog1
                                                                     (vreset! message-id id)
                                                                     (vreset! model-name model)))
              ;; Close the open text or reasoning block when the content type changes
              (and @current-type
                   chunk-type
                   (not= chunk-type @current-type))            (close!)
              ;; Start a new text block
              (and (= chunk-type :text)
                   (not= @current-type :text))                 (-> (u/prog1
                                                                     (let [tid (core/mkid)]
                                                                       (vreset! current-type :text)
                                                                       (vreset! payload {:id tid})))
                                                                   (rf (merge {:type :text-start} @payload)))
              ;; Text delta
              (and (= chunk-type :text)
                   (some? (:content delta)))                   (rf {:type  :text-delta
                                                                    :id    (:id @payload)
                                                                    :delta (:content delta)})
              ;; Start a new reasoning block
              (and (= chunk-type :reasoning)
                   (not= @current-type :reasoning))            (-> (u/prog1
                                                                     (let [rid (core/mkid)]
                                                                       (vreset! current-type :reasoning)
                                                                       (vreset! payload {:id rid})))
                                                                   (rf (merge {:type :reasoning-start} @payload)))
              ;; Reasoning delta
              (= chunk-type :reasoning)                        (rf {:type  :reasoning-delta
                                                                    :id    (:id @payload)
                                                                    :delta (delta-reasoning delta)})
              ;; A delta may carry ready-namespaced provider metadata for the
              ;; open reasoning block, ridden out on its end chunk the way
              ;; openai.clj rides out encrypted_content. :reasoning_metadata is
              ;; not a wire key — no Chat Completions server emits it; only a
              ;; dialect's own pre-transform mints it (today Mistral's
              ;; flatten-content-chunks, carrying a think-chunk signature) — so
              ;; this clause never fires for any other dialect. It is carried
              ;; opaquely: the minting side owns the namespace inside it.
              (and reasoning-md
                   (= @current-type :reasoning))               (u/prog1
                                                                 (vswap! payload assoc
                                                                         :providerMetadata reasoning-md))
              ;; Every tool_calls entry joins its call, whatever the delta's content type
              (seq call-deltas)                                (u/prog1
                                                                 (vswap! tool-calls #(reduce conj-tool-call-delta % call-deltas)))
              ;; Emitting a tool call runs it, so drop the calls an error cuts off
              error-text                                       (u/prog1
                                                                 (vreset! tool-calls no-calls))
              ;; Finish reason — close whatever is open, then emit the assembled tool calls
              (some? finish-reason)                            (-> (u/prog1
                                                                     (vreset! stop-reason finish-reason))
                                                                   (finish!))
              ;; Usage (often on a separate final chunk with empty choices)
              (some? usage)                                    (rf (cond-> {:type  :usage
                                                                            :usage (usage->aisdk-usage usage)
                                                                            :id    @message-id
                                                                            :model @model-name}
                                                                     @stop-reason
                                                                     (assoc :finish-reason     (core/stop-reason->finish-reason stop-reasons @stop-reason)
                                                                            :raw-finish-reason @stop-reason)))
              ;; An error in the stream, e.g. a failure partway through generation
              error-text                                       (-> (close!)
                                                                   (rf {:type :error :errorText error-text}))))))))))

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
