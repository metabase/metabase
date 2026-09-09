(ns metabase.metabot.self.claude
  (:require
   [clojure.string :as str]
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

(defn- claude-usage->aisdk-usage
  "Convert an Anthropic `usage` block into the AISDK `:usage` shape.

  Anthropic reports three disjoint input-token buckets; the total input sent to
  the model is the sum of all three:

      input_tokens                 — fresh (non-cached) input
      cache_creation_input_tokens  — input written to the provider cache
      cache_read_input_tokens      — input served from the provider cache

  We pre-sum these into :promptTokens so downstream analytics and ai_usage_log
  see a provider-neutral total-input count, matching OpenAI's prompt_tokens
  semantic (where cache counts are a subset breakdown of the total).

  ai_usage_log column mapping:

    without Anthropic prompt caching:
      prompt_tokens     := input_tokens
      completion_tokens := output_tokens
      total_tokens      := input_tokens + output_tokens

    with Anthropic prompt caching:
      prompt_tokens     := input_tokens + cache_creation_input_tokens + cache_read_input_tokens
      completion_tokens := output_tokens
      total_tokens      := prompt_tokens + completion_tokens

  The two are equivalent when caching is inactive (both cache buckets are 0),
  so one unified formula is used in code; the split above is purely for reader
  clarity."
  [u]
  {:promptTokens        (+ (:input_tokens u 0)
                           (:cache_creation_input_tokens u 0)
                           (:cache_read_input_tokens u 0))
   :completionTokens    (:output_tokens u 0)
   :cacheCreationTokens (:cache_creation_input_tokens u 0)
   :cacheReadTokens     (:cache_read_input_tokens u 0)})

(def ^:private translated-chunk-type?
  "Claude content-block types we translate into AI SDK chunks."
  #{:text :tool_use :thinking :redacted_thinking})

(def ^:private stop-reasons
  "Anthropic `stop_reason` → AI SDK v5 `FinishReason`."
  {"end_turn"                      "stop"
   "stop_sequence"                 "stop"
   "max_tokens"                    "length"
   "model_context_window_exceeded" "length"
   "tool_use"                      "tool-calls"
   "refusal"                       "content-filter"
   "pause_turn"                    "stop"})

(defn claude->aisdk-chunks-xf
  "Translates Claude /v1/messages streaming events into AI SDK v5 protocol chunks.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   Claude Streaming Format:
   - Each event: {:type \"message_start\" :message {...}}
                 {:type \"content_block_start\" :index 0 :content_block {:type \"text\"}}
                 {:type \"content_block_delta\" :index 0 :delta {:type \"text_delta\" :text \"...\"}}
                 {:type \"content_block_stop\" :index 0}
                 {:type \"message_delta\" :delta {:stop_reason \"end_turn\"}}
                 {:type \"message_stop\"}

   AI SDK v5 Format (SSE protocol):
   - Message parts: {:type :start, :messageId ...}
   - Part types: start, text-start, text-delta, text-end, finish-step, finish
   - Ends with: 'data: [DONE]\\n'"
  []
  (fn [rf]
    (let [current-type (volatile! nil)
          current-id   (volatile! nil)
          message-id   (volatile! nil)
          model-name   (volatile! nil)
          payload      (volatile! {})
          ;; Track the latest usage we've seen (from any event) and whether we
          ;; already emitted it. Claude reports usage at message_start and
          ;; message_delta with cumulative values — we only emit at message_delta
          ;; normally, but if the stream is interrupted we flush the last known
          ;; usage in the completion arity so we don't lose data entirely.
          last-usage   (volatile! nil)
          stop-reason  (volatile! nil)
          close!       (fn [result]
                         (u/prog1 (if-let [end-type (case @current-type
                                                      :text              :text-end
                                                      :tool_use          :tool-input-available
                                                      :thinking          :reasoning-end
                                                      :redacted_thinking :reasoning-end
                                                      nil)]
                                    (rf result (merge {:type end-type} @payload))
                                    result)
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))]
      (fn
        ([result]
         (cond-> result
           ;; close up latest type if incomplete
           @current-type (close!)
           ;; flush last-known usage if stream ended before message_delta.
           @last-usage   (rf (cond-> {:type  :usage
                                      :usage (claude-usage->aisdk-usage @last-usage)
                                      :id    @message-id
                                      :model @model-name}
                               @stop-reason (assoc :finish-reason     (core/stop-reason->finish-reason stop-reasons @stop-reason)
                                                   :raw-finish-reason @stop-reason)))
           true          (rf)))
        ([result {t :type :keys [message content_block delta error index] :as chunk}]
         (let [block-type (when content_block
                            (keyword (:type content_block)))
               chunk-id   (or (:id content_block) @current-id (some-> index str) (core/mkid))]
           (cond-> result
             ;; start of message
             (= t "message_start")       (-> (rf {:type :start :messageId (:id message)})
                                             (u/prog1
                                               (vreset! message-id (:id message))
                                               (vreset! model-name (:model message))
                                               (vreset! last-usage (:usage message))))
             ;; start of new content block
             (= t "content_block_start") (-> (u/prog1
                                               (vreset! current-type block-type)
                                               (vreset! current-id chunk-id)
                                               (vreset! payload
                                                        (case block-type
                                                          :text              {:id chunk-id}
                                                          :tool_use          {:toolCallId chunk-id
                                                                              :toolName   (:name content_block)}
                                                          :thinking          {:id chunk-id}
                                                          ;; redactedData rides the reasoning-end (via @payload,
                                                          ;; kept off the start); redacted blocks stream no deltas.
                                                          :redacted_thinking {:id chunk-id
                                                                              :providerMetadata {:anthropic {:redactedData (:data content_block)}}}
                                                          nil)))
                                             (cond->
                                              (translated-chunk-type? block-type)
                                               (rf (case block-type
                                                     :text                          (merge {:type :text-start} @payload)
                                                     :tool_use                      (merge {:type :tool-input-start} @payload)
                                                     (:thinking :redacted_thinking) {:type :reasoning-start :id chunk-id}))))

             ;; content block delta
             (and (= t "content_block_delta")
                  (contains? #{"text_delta" "input_json_delta" "thinking_delta"} (:type delta)))
             (rf (case (:type delta)
                   "text_delta"       {:type  :text-delta
                                       :id    (:id @payload)
                                       :delta (:text delta)}
                   "thinking_delta"   {:type  :reasoning-delta
                                       :id    (:id @payload)
                                       :delta (:thinking delta)}
                   "input_json_delta" {:type           :tool-input-delta
                                       :toolCallId     (:toolCallId @payload)
                                       :inputTextDelta (:partial_json delta)}))

             ;; the signature rides the reasoning-end via @payload (needed to replay
             ;; the block within the turn); nothing is emitted to the client
             (and (= t "content_block_delta") (= "signature_delta" (:type delta)))
             (u/prog1
               (vswap! payload update-in [:providerMetadata :anthropic :signature] (fnil str "") (:signature delta)))

             ;; end of content block
             (= t "content_block_stop") (close!)
             ;; Claude reports usage at both message_start and message_delta,
             ;; but message_delta values are cumulative and include the earlier
             ;; counts.
             ;; https://platform.claude.com/docs/en/build-with-claude/streaming#event-types
             ;; https://platform.claude.com/docs/en/api/cli/messages#message_delta_usage
             (= t "message_delta")      (u/prog1
                                          (vreset! last-usage (:usage chunk))
                                          (vreset! stop-reason (:stop_reason delta)))
             ;; end of message
             (= t "message_stop")       identity
             ;; catch errors if any
             (= t "error")              (rf {:type      :error
                                             :errorText (:message error)}))))))))

;;; AISDK parts → Claude messages

(defn- ->content-blocks
  "Coerce content into a sequence of Claude content blocks."
  [content]
  (cond
    (and (string? content) (str/blank? content)) []
    (string? content) [{:type "text" :text content}]
    :else content))

(defn- merge-consecutive
  "Merge consecutive assistant messages into a single message with combined content.
  Claude API doesn't allow consecutive messages with the same role."
  [messages]
  (into [] (comp (partition-by :role)
                 (mapcat (fn [group]
                           [{:role    (:role (first group))
                             :content (into [] (mapcat (comp ->content-blocks :content)) group)}])))
        messages))

(defn- merge-reasoning
  "Join consecutive same-id `:reasoning` parts (streamed as small parts plus a
  metadata carrier) into one block, keeping its provider metadata."
  [parts]
  (->> parts
       (partition-by (fn [p] (if (= :reasoning (:type p)) [:reasoning (:id p)] :other)))
       (mapcat (fn [group]
                 (if (= :reasoning (:type (first group)))
                   [{:type              :reasoning
                     :id                (:id (first group))
                     :text              (->> group (map :text) (str/join ""))
                     :provider-metadata (some :provider-metadata group)}]
                   group)))))

(defn parts->claude-messages
  "Convert a sequence of AISDK parts into Claude API messages.

  Input: flat sequence of AISDK parts and user messages:
    {:role :user, :content \"...\"}
    {:type :reasoning, :text \"...\", :provider-metadata {...}}
    {:type :text, :text \"...\"}
    {:type :tool-input, :id ..., :function ..., :arguments ...}
    {:type :tool-output, :id ..., :result ...}

  Reasoning becomes `thinking`/`redacted_thinking` blocks — Claude 400s unless they
  are echoed back verbatim (signed) ahead of the tool_use they preceded. Unsigned
  reasoning (foreign parts, interrupted blocks) is dropped."
  [parts]
  (->> parts
       merge-reasoning
       (into []
             (keep (fn [part]
                     (case (:type part)
                       :reasoning   (let [pm       (:provider-metadata part)
                                          redacted (get-in pm [:anthropic :redactedData])
                                          sig      (get-in pm [:anthropic :signature])]
                                      (cond
                                        redacted {:role    "assistant"
                                                  :content [{:type "redacted_thinking" :data redacted}]}
                                        sig      {:role    "assistant"
                                                  :content [{:type      "thinking"
                                                             :thinking  (:text part)
                                                             :signature sig}]}
                                        :else    nil))
                       :text        {:role    "assistant"
                                     :content (:text part)}
                       :tool-input  {:role    "assistant"
                                     :content [{:type  "tool_use"
                                                :id    (:id part)
                                                :name  (:function part)
                                                :input (or (:arguments part) {})}]}
                       :tool-output {:role    "user"
                                     :content [{:type        "tool_result"
                                                :tool_use_id (:id part)
                                                :content     (or (get-in part [:result :output])
                                                                 (when-let [err (:error part)]
                                                                   (str "Error: " (:message err)))
                                                                 (pr-str (:result part)))}]}
                       ;; User messages pass through
                       {:role    (name (or (:role part) "user"))
                        :content (:content part)}))))
       merge-consecutive
       vec))

;;; Tool definition format

(defn- tool->claude
  "Convert a tool definition map to Claude API format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [tool]
  (let [{:keys [name description parameters]} (schema/tool-function tool)]
    {:name         (or name "unknown")
     :description  description
     :input_schema parameters}))

(defn- add-tools-cache-breakpoint
  "Attach an ephemeral cache_control marker to the last tool in `tools`.
  Anthropic caches everything in the request up to and including the block with
  `cache_control`, so a single breakpoint on the final tool covers the whole
  tool list."
  [tools]
  (if (seq tools)
    (update tools (dec (count tools)) assoc :cache_control {:type "ephemeral"})
    tools))

(def ^:private system-cache-breakpoint-sentinel
  "Literal marker placed in selmer templates to indicate where the static cacheable
  prefix ends and the dynamic per-request suffix begins. Anthropic-only; ignored
  by other provider adapters."
  "<<<METABOT_CACHE_BREAKPOINT>>>")

(defn system->cached-content-blocks
  "Wrap a rendered system prompt for Anthropic, applying ephemeral cache_control.

  If `system` contains the cache breakpoint sentinel, split it into two content
  blocks: a cached static prefix and an uncached dynamic suffix. The model sees
  the concatenation; the split is purely a wire-protocol device for caching.

  If the sentinel is absent (or nothing but whitespace follows it) fall back to
  a single cached content block covering the whole prompt."
  [system]
  (let [idx    (.indexOf ^String system ^String system-cache-breakpoint-sentinel)
        suffix (when-not (neg? idx)
                 (str/triml (subs system (+ idx (count system-cache-breakpoint-sentinel)))))]
    (if (or (neg? idx) (str/blank? suffix))
      [{:type          "text"
        :text          (if (neg? idx) system (str/trimr (subs system 0 idx)))
        :cache_control {:type "ephemeral"}}]
      [{:type          "text"
        :text          (str/trimr (subs system 0 idx))
        :cache_control {:type "ephemeral"}}
       {:type "text"
        :text suffix}])))

(defn- anthropic-error-msg
  "Canonical, status-specific Anthropic error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "Anthropic API key expired or invalid")
      403 (tru "Anthropic API key has insufficient permissions")
      404 (tru "Anthropic API endpoint is unavailable or the model was not found")
      413 (tru "Anthropic API rejected our request because it was too large")
      429 (tru "Anthropic API has rate limited us")
      500 (tru "Anthropic API is not working but not saying why")
      529 (tru "Anthropic API is overloaded and is asking us to wait")
      (tru "Anthropic API error (HTTP {0})" status))))

(def supported-models
  "Anthropic chat models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the account's `/v1/models` catalog."
  {"claude-fable-5"             {:display-name "Claude Fable 5"    :max-tokens 128000 :context-window 1000000}
   "claude-opus-5"              {:display-name "Claude Opus 5"     :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-8"            {:display-name "Claude Opus 4.8"   :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-7"            {:display-name "Claude Opus 4.7"   :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-6"            {:display-name "Claude Opus 4.6"   :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-5-20251101"   {:display-name "Claude Opus 4.5"   :max-tokens  64000 :context-window  200000}
   "claude-opus-4-1-20250805"   {:display-name "Claude Opus 4.1"   :max-tokens  32000 :context-window  200000}
   "claude-sonnet-5"            {:display-name "Claude Sonnet 5"   :max-tokens 128000 :context-window 1000000}
   "claude-sonnet-4-6"          {:display-name "Claude Sonnet 4.6" :max-tokens 128000 :context-window 1000000}
   "claude-sonnet-4-5-20250929" {:display-name "Claude Sonnet 4.5" :max-tokens  64000 :context-window  200000}
   "claude-haiku-4-5-20251001"  {:display-name "Claude Haiku 4.5"  :max-tokens  64000 :context-window  200000}})

(def ^:private default-max-tokens
  "`max_tokens` for an unresolved model — low enough to be safe on any of them."
  64000)

(defn- supported-model?
  "Whether a `/v1/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full Anthropic model catalog (`GET /v1/models`).
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request,
  and throws when they are missing. Also supports `:ai-proxy?`."
  [{:keys [credentials ai-proxy?]}]
  (try
    (let [auth (core/resolve-auth "anthropic" "Anthropic"
                                  (when-let [k (not-empty (:api-key credentials))]
                                    {:url     (:base-url credentials)
                                     :headers {"x-api-key" k}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/v1/models"
                                   :headers {"anthropic-version" "2023-06-01"}})]
      (:data (json/decode+kw (:body res))))
    (catch Exception e
      (core/rethrow-api-error! "anthropic" anthropic-error-msg e))))

(defn list-models
  "List the Anthropic chat models supported by this adapter (see [[supported-models]]).
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request,
  and throws when they are missing. Also supports `:ai-proxy?`."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id display_name]}]
                         {:id id :display_name (or display_name (get-in supported-models [id :display-name]))})))}))

(defn- strip-vendor-prefix
  "`model` without an optional vendor prefix (e.g. Bedrock's `anthropic.`)."
  [model]
  (str/replace-first (str model) #"^anthropic\." ""))

(defn- model-max-tokens
  "The `max_tokens` ceiling for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [(strip-vendor-prefix model) :max-tokens]))

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [(strip-vendor-prefix model) :context-window]))

(defn- claude-model-version
  "`[family major minor]` for a Claude opus/sonnet model id, or nil."
  [model]
  (when-let [[_ family major minor] (re-find #"^claude-(opus|sonnet)-(\d+)(?:-(\d+))?"
                                             (strip-vendor-prefix model))]
    [family (parse-long major) (or (some-> minor parse-long) 0)]))

(defn- model-current-gen?
  "Current-generation Claude (Fable, Opus >=4.7, Sonnet >=5): no sampling params;
  thinking streams via `display: summarized`."
  [model]
  (or (str/starts-with? (strip-vendor-prefix model) "claude-fable")
      (when-let [[family major minor] (claude-model-version model)]
        (case family
          "opus"   (or (> major 4) (and (= major 4) (>= minor 7)))
          "sonnet" (>= major 5)))))

(defn- model-supports-temperature?
  "Whether `model` accepts an explicit `temperature` parameter. Sampling params
  were removed starting with Claude Opus 4.7 and Sonnet 5."
  [model]
  (not (model-current-gen? model)))

(defn- model-thinking-config
  "Thinking config that streams reasoning for `model`, or nil where we don't enable
  it (older budget-token models — off in v1)."
  [model]
  (let [[_ major minor] (claude-model-version model)]
    (cond
      (model-current-gen? model)          {:type "adaptive" :display "summarized"}
      (and major (= major 4) (= minor 6)) {:type "adaptive" :display "summarized"})))

(defn reasoning-model?
  "Whether `model` streams reasoning back to us."
  [model]
  (some? (model-thinking-config model)))

(def ^:private fast-mode-models
  "The models Anthropic documents fast mode for: https://code.claude.com/docs/en/fast-mode"
  #{"claude-opus-4-8" "claude-opus-5"})

(defn fast-mode-model?
  "Whether `model` supports Anthropic fast mode. Never through the AI proxy: fast mode is premium-priced,
  and proxied requests bill through Metabase Cloud rather than the instance's own key."
  [model ai-proxy?]
  (and (not ai-proxy?)
       (contains? fast-mode-models (strip-vendor-prefix model))))

(mu/defn claude-request-body
  "Build the Anthropic Messages API request body for an LLM request.

  A caller-supplied `:reasoning-config` is this dialect's `thinking` block and wins outright: an
  adapter re-hosting a non-Claude model here knows its own provider's thinking shape and
  restrictions, which the model-id-derived config and the suppression rules below cannot describe."
  [{:keys [model system input tools schema tool_choice temperature max-tokens reasoning? reasoning-config fast? ai-proxy?]
    :or   {model "claude-haiku-4-5" reasoning? true}} :- core/LLMRequestOpts]
  (let [;; forced tool choice (structured output, or "required") is incompatible
        ;; with thinking — suppress it there.
        thinking  (or reasoning-config
                      (when-not (or (not reasoning?) schema (= "required" (some-> tool_choice name)))
                        (model-thinking-config model)))
        fast?     (and fast? (fast-mode-model? model ai-proxy?))
        input     (cond->> input
                    (nil? thinking) (remove #(= :reasoning (:type %))))
        messages  (parts->claude-messages input)
        all-tools (when (seq tools) (mapv tool->claude tools))
        all-tools (if (and all-tools (not schema))
                    (add-tools-cache-breakpoint all-tools)
                    all-tools)]
    (cond-> {:model         model
             :max_tokens    (or max-tokens (model-max-tokens model) default-max-tokens)
             :stream        true
             :cache_control {:type "ephemeral"}
             :messages      messages}
      system            (assoc :system (system->cached-content-blocks system))
      all-tools         (assoc :tools all-tools)
      schema            (assoc :tool_choice {:type "tool"
                                             :name "structured_output"}
                               :tools [{:name         "structured_output"
                                        :description  "Output structured data"
                                        :input_schema schema}])

      (and all-tools tool_choice)
      (assoc :tool_choice (case (name tool_choice)
                            "auto"     {:type "auto"}
                            "required" {:type "any"}))

      thinking          (assoc :thinking thinking)

      fast?             (assoc :speed "fast")

      ;; sampling params are rejected alongside thinking
      (and temperature (not thinking) (model-supports-temperature? model))
      (assoc :temperature temperature))))

(defn- fast-mode-rejection?
  "Whether a decoded 400 reads as Anthropic rejecting fast mode itself (account not in the
  research preview, beta header not recognized) rather than some unrelated malformed request."
  [res]
  (boolean (re-find #"(?i)fast[ _-]?mode|\bspeed\b"
                    (str (get-in res [:body :error :message])))))

(def ^:private fast-mode-cooldown-ms
  "How long to stop requesting fast mode after Anthropic rejects a fast-mode request.
  Fast and standard speed don't share prompt-cache prefixes, so flapping between them
  rewrites the conversation cache on every flip; holding standard for a window keeps
  the speed (and the cache) stable, and spares doomed fast attempts while the account
  is over its fast-mode limits or not enrolled at all."
  (* 5 60 1000))

(def ^:private fast-mode-cooldown-until
  "Epoch millis until which fast mode is skipped. Process-local, resets on restart."
  (atom 0))

(defn- fast-mode-cooling-down?
  []
  (< (System/currentTimeMillis) @fast-mode-cooldown-until))

(mu/defn claude-raw
  "Perform a streaming request to Claude API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing."
  [{:keys [model input tools credentials ai-proxy?] :as opts
    :or   {model "claude-haiku-4-5"}} :- core/LLMRequestOpts]
  (let [opts (cond-> opts (fast-mode-cooling-down?) (assoc :fast? false))
        req  (claude-request-body opts)]
    (with-span :info {:name       :metabot.claude/request
                      :model      model
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [api-key  (not-empty (:api-key credentials))
              auth     (core/resolve-auth "anthropic" "Anthropic"
                                          (when api-key
                                            {:url     (:base-url credentials)
                                             :headers {"x-api-key" api-key}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/v1/messages"
                                      :as      :stream
                                      :headers (cond-> {"anthropic-version" "2023-06-01"
                                                        "content-type"      "application/json"}
                                                 (:speed req) (assoc "anthropic-beta" "fast-mode-2026-02-01"))
                                      :body    (json/encode req)})]
          ;; The SSE body is consumed lazily, after this `try` has exited — wrap
          ;; the reducible so mid-stream IO/timeout failures get the same
          ;; provider-friendly translation as request-time errors.
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "anthropic"
                                     :model    model
                                     :url      "/v1/messages"
                                     :request  req})
              (core/reducible-with-api-errors "anthropic" anthropic-error-msg)))
        (catch Exception e
          ;; decoding the error body also closes the streamed response, so the connection is
          ;; not leaked when the exception is swallowed by the retry below. Fast mode has its
          ;; own rate-limit pool, so a 429 here doesn't imply standard speed is limited;
          ;; a 400 needs its message checked to keep unrelated malformed requests failing fast.
          (let [status    (:status (ex-data e))
                res       (when (and (:speed req) (contains? #{400 429 529} status))
                            (core/decode-error-body e))
                rejected? (and res (or (not= 400 status) (fast-mode-rejection? res)))]
            (when rejected?
              (reset! fast-mode-cooldown-until (+ (System/currentTimeMillis) fast-mode-cooldown-ms))
              (log/warn "Anthropic rejected the fast-mode request; falling back to standard speed"
                        {:status status}))
            ;; 529 means the API itself is overloaded, so no immediate retry: surface it and
            ;; let the caller's retry loop pace the next attempt, which the armed cooldown
            ;; keeps at standard speed.
            (if (and rejected? (not= 529 status))
              (claude-raw (assoc opts :fast? false))
              (core/rethrow-api-error! "anthropic" anthropic-error-msg
                                       (if res (ex-info (str (ex-message e)) res e) e)))))))))

(defn claude
  "Call Claude API, return AISDK stream"
  [& args]
  (let [raw (apply claude-raw args)]
    (eduction (claude->aisdk-chunks-xf) raw)))

(comment
  ;; Now just use standard `into` - no core.async needed!
  (def q (into [] (claude-raw {:input [{:role "user" :content "How are you feeling today?"}]})))

  (into [] (comp (claude->aisdk-chunks-xf) core/aisdk-xf) q))
