(ns metabase.metabot.self.claude
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
  "Claude content-block types we translate into AI SDK chunks. Other block types
  (e.g. `redacted_thinking` from extended or adaptive thinking) are ignored."
  #{:text :thinking :tool_use})

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
          close!       (fn [result]
                         ;; only emit an end marker for block types we translate;
                         ;; other untranslated blocks are ignored.
                         (u/prog1 (if-let [end-type (case @current-type
                                                      :text     :text-end
                                                      :thinking :reasoning-end
                                                      :tool_use :tool-input-available
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
           @last-usage   (rf {:type  :usage
                              :usage (claude-usage->aisdk-usage @last-usage)
                              :id    @message-id
                              :model @model-name})
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
                                                          :text     {:id chunk-id}
                                                          :thinking {:id chunk-id}
                                                          :tool_use {:toolCallId chunk-id
                                                                     :toolName   (:name content_block)}
                                                          nil)))
                                             (cond->
                                              (translated-chunk-type? block-type)
                                               (rf (merge (case block-type
                                                            :text     {:type :text-start}
                                                            :thinking {:type :reasoning-start}
                                                            :tool_use {:type :tool-input-start})
                                                          @payload))))

             ;; content block delta — ignore deltas we don't translate, e.g.
             ;; signature_delta (a cryptographic seal on the thinking block that
             ;; we don't round-trip).
             (and (= t "content_block_delta")
                  (contains? #{"text_delta" "thinking_delta" "input_json_delta"} (:type delta)))
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

             ;; end of content block
             (= t "content_block_stop") (close!)
             ;; Claude reports usage at both message_start and message_delta,
             ;; but message_delta values are cumulative and include the earlier
             ;; counts.
             ;; https://platform.claude.com/docs/en/build-with-claude/streaming#event-types
             ;; https://platform.claude.com/docs/en/api/cli/messages#message_delta_usage
             (= t "message_delta")      (u/prog1
                                          (vreset! last-usage (:usage chunk)))
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

(defn parts->claude-messages
  "Convert a sequence of AISDK parts into Claude API messages.

  Input: flat sequence of AISDK parts and user messages:
    {:role :user, :content \"...\"}
    {:type :text, :text \"...\"}
    {:type :tool-input, :id ..., :function ..., :arguments ...}
    {:type :tool-output, :id ..., :result ...}

  Output: Claude messages with tool_use/tool_result content blocks, consecutive
  assistant messages merged."
  [parts]
  (->> parts
       (mapv (fn [part]
               (case (:type part)
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
                  :content (:content part)})))
       merge-consecutive
       vec))

;;; Tool definition format

(defn- tool->claude
  "Convert a tool definition map to Claude API format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params                     (schema/filter-schema-by-features params)
        doc                        (if (str/starts-with? (or doc "") "Inputs: ")
                                     ;; strip that stuff we're appending in mu/defn
                                     (second (str/split doc #"\n\n  " 2))
                                     doc)]
    {:name         (or tool-name "unknown")
     :description  doc
     :input_schema (mjs/transform params {:additionalProperties false})}))

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

  If the sentinel is absent, fall back to a single cached content block covering
  the whole prompt.

  Blank blocks are dropped — Anthropic rejects empty text content blocks with an
  HTTP 400 (\"system: text content blocks must be non-empty\"), and a template
  whose entire post-sentinel content is conditional (e.g. explorations.selmer's
  `{% if research_plan %}`) legitimately renders a blank suffix. May return an
  empty vector when the whole prompt is blank; callers must omit `:system`
  entirely in that case."
  [system]
  (let [idx    (.indexOf ^String system ^String system-cache-breakpoint-sentinel)
        blocks (if (neg? idx)
                 [{:type          "text"
                   :text          system
                   :cache_control {:type "ephemeral"}}]
                 (let [prefix (str/trimr (subs system 0 idx))
                       suffix (str/triml (subs system (+ idx (count system-cache-breakpoint-sentinel))))]
                   [{:type          "text"
                     :text          prefix
                     :cache_control {:type "ephemeral"}}
                    {:type "text"
                     :text suffix}]))]
    (filterv #(not (str/blank? (:text %))) blocks)))

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

(def ^:private supported-models
  "Anthropic chat models offered in the Metabot model picker, as a map of model id -> display name.
  `list-models` returns the intersection of this map with the account's `/v1/models` catalog."
  {"claude-fable-5"             "Claude Fable 5"
   "claude-opus-4-8"            "Claude Opus 4.8"
   "claude-opus-4-7"            "Claude Opus 4.7"
   "claude-opus-4-6"            "Claude Opus 4.6"
   "claude-opus-4-5-20251101"   "Claude Opus 4.5"
   "claude-opus-4-1-20250805"   "Claude Opus 4.1"
   "claude-sonnet-5"            "Claude Sonnet 5"
   "claude-sonnet-4-6"          "Claude Sonnet 4.6"
   "claude-sonnet-4-5-20250929" "Claude Sonnet 4.5"
   "claude-haiku-4-5-20251001"  "Claude Haiku 4.5"})

(defn- supported-model?
  "Whether a `/v1/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full Anthropic model catalog (`GET /v1/models`).
  No-arg uses the configured API key. Opts map supports `:credentials` (`{:api-key ...}`) and `:ai-proxy?`."
  [{:keys [credentials ai-proxy?]}]
  (try
    (let [auth (core/resolve-auth "anthropic" "Anthropic"
                                  (when-let [k (or (not-empty (:api-key credentials))
                                                   (not-empty (llm/llm-anthropic-api-key)))]
                                    {:url     (llm/llm-anthropic-api-base-url)
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
  No-arg uses the configured API key. Opts map supports `:credentials` (`{:api-key ...}`) and `:ai-proxy?`."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id display_name]}]
                         {:id id :display_name (or display_name (supported-models id))})))}))

(def ^:private model-capabilities-cache
  "Cache of Models API capability lookups, keyed by model id. Each entry is
   `{:value <capabilities-or-nil>}` plus, for failed lookups, an `:expires-at`
   timestamp. Failures are cached briefly so a broken or
   absent Models API endpoint doesn't add a failing HTTP round trip to every
   LLM call, while still retrying eventually."
  (atom {}))

(def ^:private capabilities-failure-ttl-ms
  "How long to remember a failed capability lookup before retrying it."
  (* 5 60 1000))

(defn- fetch-model-capabilities
  "GET `/v1/models/<model>` and return its `:capabilities` map, or nil when the
   lookup fails (unknown model id, endpoint not available through this
   auth/proxy, network error). Never throws — capability lookups are
   best-effort, and callers fall back to the model-version heuristic."
  [auth model]
  (try
    (let [res (core/request auth {:method  :get
                                  :url     (str "/v1/models/" model)
                                  :headers {"anthropic-version" "2023-06-01"}})]
      (:capabilities (json/decode+kw (:body res))))
    (catch Exception e
      (log/debugf e "Could not fetch Anthropic capabilities for model %s; falling back to the model-version heuristic" model)
      nil)))

(defn- model-capabilities
  "Cached [[fetch-model-capabilities]]. Returns the live capability map for
   `model`, or nil when unavailable."
  [auth model]
  (let [now (System/currentTimeMillis)
        {:keys [value expires-at] :as entry} (get @model-capabilities-cache model)]
    (if (and entry (or (nil? expires-at) (< now expires-at)))
      value
      (let [caps (fetch-model-capabilities auth model)]
        (swap! model-capabilities-cache assoc model
               (cond-> {:value caps}
                 (nil? caps) (assoc :expires-at (+ now capabilities-failure-ttl-ms))))
        caps))))

(defn- model-family+version
  "Parse a Claude model id into `{:family <string> :version [major minor]}`, e.g.
   `claude-sonnet-4-6` → `{:family \"sonnet\" :version [4 6]}`. Strips an optional
   vendor prefix (e.g. Bedrock's `anthropic.`). Returns nil for ids that don't
   follow the `claude-<family>-<major>[-<minor>]` shape (legacy 3.x ids, other
   providers' models) — callers treat those as oldest-generation."
  [model]
  (let [model (str/replace-first (str model) #"^anthropic\." "")]
    (when-let [[_ family major minor] (re-find #"^claude-([a-z]+)-(\d+)(?:-(\d+))?" model)]
      {:family  family
       :version [(parse-long major) (or (some-> minor parse-long) 0)]})))

(defn- adaptive-thinking-only?
  "Whether `model` accepts only adaptive thinking — sending the legacy
  `{:type \"enabled\" :budget_tokens N}` shape returns HTTP 400.

  `capabilities` is the model's live Models API capability map when available
  (see [[model-capabilities]]) and takes precedence: adaptive-only iff the
  `enabled` thinking type is unsupported while `adaptive` is supported."
  [model capabilities]
  (if-let [types (get-in capabilities [:thinking :types])]
    (and (not (get-in types [:enabled :supported]))
         (boolean (get-in types [:adaptive :supported])))
    (let [{:keys [family] [major minor] :version} (model-family+version model)]
      (boolean
       (or (#{"fable" "mythos"} family)
           (and major (>= major 5))
           (and (= family "opus")
                (or (> major 4) (and (= major 4) (>= minor 7)))))))))

(defn- model-supports-temperature?
  "Whether `model` accepts an explicit `temperature` parameter."
  [model capabilities]
  (not (adaptive-thinking-only? model capabilities)))

(defn- normalize-thinking
  "Coerce a caller's `:thinking` config into the wire shape `model` accepts, so
  call sites declare intent once and keep working as the configured model
  changes generation."
  [model capabilities thinking]
  (when thinking
    (if-not (adaptive-thinking-only? model capabilities)
      thinking
      (if (= "disabled" (some-> (:type thinking) name))
        (when-not (#{"fable" "mythos"} (:family (model-family+version model)))
          thinking)
        (-> thinking (assoc :type "adaptive") (dissoc :budget_tokens))))))

(mu/defn claude-request-body
  "Build the Anthropic Messages API request body for an LLM request.

  `:model-capabilities` (optional) is the model's live Models API capability
  map; when present it drives the thinking/temperature wire-format decisions
  instead of the model-version heuristic. [[claude-raw]] populates it via
  [[model-capabilities]]; direct callers (Bedrock/Azure adapters, tests) may
  omit it and get the heuristic."
  [{:keys [model system input tools schema tool_choice temperature max-tokens thinking cache?]
    model-caps :model-capabilities
    :or   {model "claude-haiku-4-5" cache? true}} :- core/LLMRequestOpts]
  (let [messages  (parts->claude-messages input)
        all-tools (when (seq tools) (mapv tool->claude tools))
        all-tools (if (and all-tools (not schema) cache?)
                    (add-tools-cache-breakpoint all-tools)
                    all-tools)
        ;; may be empty when the rendered prompt is blank — omit :system then
        ;; (Anthropic 400s on empty text content blocks). With :cache? false the
        ;; sentinel is still stripped; only the cache markers are dropped.
        system-blocks (when system
                        (cond->> (system->cached-content-blocks system)
                          (not cache?) (mapv #(dissoc % :cache_control))))
        thinking  (normalize-thinking model model-caps thinking)
        ;; Anthropic forbids `tool_choice` forced tool use when extended thinking
        ;; is enabled. When both are requested we fall back to `auto` and rely
        ;; on the caller's prompt + retry logic to ensure the structured-output
        ;; tool is actually invoked.
        schema-tool-choice (if thinking
                             {:type "auto"}
                             {:type "tool" :name "structured_output"})
        effort        (some-> thinking :effort)
        thinking-body (some-> thinking (dissoc :effort))]
    (cond-> {:model         model
             :max_tokens    (or max-tokens 4096)
             :stream        true
             :messages      messages}
      cache?              (assoc :cache_control {:type "ephemeral"})
      (seq system-blocks) (assoc :system system-blocks)
      all-tools         (assoc :tools all-tools)
      schema            (assoc :tool_choice schema-tool-choice
                               :tools [{:name         "structured_output"
                                        :description  "Output structured data"
                                        :input_schema schema}])
      thinking-body     (assoc :thinking thinking-body)
      effort            (assoc :output_config {:effort effort})

      (and all-tools tool_choice)
      (assoc :tool_choice (case (name tool_choice)
                            "auto"     {:type "auto"}
                            ;; Anthropic forbids forced tool use (`{:type "any"}`)
                            ;; when extended thinking is enabled — degrade to
                            ;; `auto`, same as the schema path above.
                            "required" (if thinking
                                         {:type "auto"}
                                         {:type "any"})))

      (and temperature (model-supports-temperature? model model-caps))
      (assoc :temperature temperature))))

(mu/defn claude-raw
  "Perform a streaming request to Claude API.

  `:thinking` accepts either of Anthropic's two extended-thinking shapes:
   - Explicit budget:
       `{:type \"enabled\" :budget_tokens <int>}`
       (rejected by adaptive-only models — see [[adaptive-thinking-only?]])
   - Adaptive (the only shape adaptive-only models such as Opus 4.7+ accept):
       `{:type \"adaptive\" :effort \"high\"|\"medium\"|\"low\"}`
  Either shape is normalized to what the target model actually accepts —
  preferring the model's live Models API capabilities (fetched once per model
  and cached, see [[model-capabilities]]) over a model-version heuristic when
  the lookup is unavailable (see [[normalize-thinking]]) — so callers declare
  intent once and don't break when the configured model changes generation.
  When `:effort` is present it is split out into the top-level `output_config`
  field that the adaptive API expects — callers can keep passing one map and
  not care about the wire format split."
  [{:keys [model input tools temperature thinking ai-proxy?]
    :or   {model "claude-haiku-4-5"}
    :as   opts} :- core/LLMRequestOpts]
  (with-span :info {:name       :metabot.claude/request
                    :model      model
                    :msg-count  (count input)
                    :tool-count (count tools)}
    (try
      (let [api-key  (not-empty (llm/llm-anthropic-api-key))
            auth     (core/resolve-auth "anthropic" "Anthropic"
                                        (when api-key
                                          {:url     (llm/llm-anthropic-api-base-url)
                                           :headers {"x-api-key" api-key}})
                                        ai-proxy?)
            ;; only the thinking + temperature wire formats are capability
            ;; dependent; skip the lookup when neither is requested
            req      (claude-request-body
                      (cond-> opts
                        (or thinking (some? temperature))
                        (assoc :model-capabilities (model-capabilities auth model))))
            response (core/request auth
                                   {:method  :post
                                    :url     "/v1/messages"
                                    :as      :stream
                                    :headers {"anthropic-version" "2023-06-01"
                                              "content-type"      "application/json"}
                                    :body    (json/encode req)})]
        (-> (core/sse-reducible (:body response))
            (debug/capture-stream {:provider "anthropic"
                                   :model    model
                                   :url      "/v1/messages"
                                   :request  req})))
      (catch Exception e
        (core/rethrow-api-error! "anthropic" anthropic-error-msg e)))))

(defn claude
  "Call Claude API, return AISDK stream"
  [& args]
  (let [raw (apply claude-raw args)]
    (eduction (claude->aisdk-chunks-xf) raw)))

(comment
  ;; Now just use standard `into` - no core.async needed!
  (def q (into [] (claude-raw {:input [{:role "user" :content "How are you feeling today?"}]})))

  (into [] (comp (claude->aisdk-chunks-xf) core/aisdk-xf) q))
