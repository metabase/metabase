(ns metabase.metabot.tracing
  "OpenTelemetry-style span recording for a Metabot turn, stored in the app DB
  (the `metabot_trace_span` table) for later review in the usage-analytics
  conversation viewer.

  This is a small, purpose-built recorder modeled on the OTel data model — it is
  intentionally separate from [[metabase.tracing]] / [[metabase.util.o11y]],
  which export to an external OTLP collector for ops debugging. Here we want an
  always-available, per-conversation product record keyed to a turn.

  Lifecycle:
  - [[with-trace]] binds a fresh per-turn accumulator (a trace id + an atom of
    finished spans). It is a no-op when [[metabase.metabot.settings/metabot-trace-spans-enabled]]
    is off, so nested span ops elide cheaply.
  - [[with-span]] records one span around its body, parented to the enclosing
    span. [[add-attrs!]], [[add-event!]] and [[set-status!]] enrich the active span.
  - [[persist-spans!]] bulk-inserts the accumulated spans once the turn's
    assistant message id is known.

  Thread propagation: spans are collected into a shared atom and the active
  span id rides on a dynamic var, so work spawned via `bound-fn*` (e.g. tool
  execution on virtual threads) records spans correctly parented to the span
  that was active when the work was submitted."
  (:require
   [clojure.string :as str]
   [metabase.metabot.models.metabot-trace-span]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tracing.semconv :as semconv]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *trace*
  "When bound by [[with-trace]], `{:trace-id <32-hex> :spans <atom of vector>}`.
  `nil` means span capture is disabled and every span op is a no-op."
  nil)

(def ^:dynamic *current-span-id*
  "The id of the enclosing span. Used as `parent_span_id` for spans opened inside it."
  nil)

(def ^:dynamic *current-span*
  "Atom holding the mutable state (`:attrs`, `:events`, `:status`, `:status-message`)
  of the innermost active span, so [[add-attrs!]] / [[add-event!]] / [[set-status!]]
  can enrich it. `nil` outside any span."
  nil)

(def ^:dynamic *llm-request-timing*
  "When bound to an atom by the agent loop, the streaming layer resets it to
  `{:started-unix-nano <long> :duration-nanos <long>}` capturing the actual
  provider API request (request start → provider stream exhausted), excluding
  downstream tool execution that completes later in the same reduction. The loop
  then records a [[record-timed-span!]] `chat` span from it."
  nil)

;;; ------------------------------------------------------------------ ids / time

;; These three are public because [[with-span]] / [[with-trace]] expand to
;; fully-qualified references to them at their call sites.
(defn gen-trace-id
  "Generate a 32-hex-char OpenTelemetry trace id."
  []
  (str/replace (str (random-uuid)) "-" ""))

(defn gen-span-id
  "Generate a 16-hex-char OpenTelemetry span id."
  []
  (subs (str/replace (str (random-uuid)) "-" "") 0 16))

(defn now-unix-nano
  "Current wall-clock time as nanoseconds since the Unix epoch."
  ^long []
  (* (System/currentTimeMillis) 1000000))

;;; -------------------------------------------------------------- active-span ops

(defn add-attrs!
  "Merge `attrs` (a map of semconv key → value) into the active span. No-op when
  there is no active span."
  [attrs]
  (when (and *current-span* (seq attrs))
    (swap! *current-span* update :attrs merge attrs))
  nil)

(defn add-event!
  "Append a timestamped event to the active span (an OTel span event). No-op when
  there is no active span."
  ([event-name] (add-event! event-name nil))
  ([event-name attrs]
   (when *current-span*
     (swap! *current-span* update :events conj
            {:name           event-name
             :time_unix_nano (now-unix-nano)
             :attributes     (or attrs {})}))
   nil))

(defn set-status!
  "Set the active span's status (`:ok` / `:error` / `:unset`) and optional message."
  ([status] (set-status! status nil))
  ([status message]
   (when *current-span*
     (swap! *current-span* assoc :status status :status-message message))
   nil))

;;; ------------------------------------------------------------------- recording

(defn record-span!
  "Conj a finished span map onto the trace. Used by [[with-span]]; rarely called
  directly. No-op when tracing is disabled."
  [span]
  (when *trace*
    (swap! (:spans *trace*) conj (assoc span :trace_id (:trace-id *trace*))))
  nil)

(defn record-timed-span!
  "Record a fully-formed span whose duration was measured out-of-band, parented to
  the active span. Use this (instead of [[with-span]]) when a span's wall-clock is
  known from elsewhere rather than from wrapping a dynamic body — e.g. the LLM
  `chat` span, whose request timing is captured deep in the streaming layer while
  tool execution runs in the same reduction. No-op when tracing is disabled or
  timing is missing."
  [{:keys [name kind attrs status status-message started-unix-nano duration-nanos]
    :or   {kind :internal status :ok}}]
  (when (and *trace* started-unix-nano duration-nanos)
    (record-span! {:span_id        (gen-span-id)
                   :parent_span_id *current-span-id*
                   :name           name
                   :kind           kind
                   :status         status
                   :status_message status-message
                   :started_at     started-unix-nano
                   :ended_at       (+ started-unix-nano duration-nanos)
                   :attributes     (or attrs {})
                   :events         []}))
  nil)

(defmacro with-span
  "Record a span around `body`.

  `spec` is a map: `:name` (required string), `:kind` (one of
  [[metabase.metabot.tracing.semconv/span-kinds]], default `:internal`), and
  `:attrs` (initial attribute map). Inside `body`, [[add-attrs!]] / [[add-event!]]
  / [[set-status!]] enrich this span. A throwable escaping `body` marks the span
  `:error` (with its message) and is re-thrown.

  No-op fast path (just runs `body`) when [[*trace*]] is unbound."
  [spec & body]
  `(let [spec# ~spec]
     (if-not *trace*
       (do ~@body)
       (let [span-id#    (gen-span-id)
             parent#     *current-span-id*
             state#      (atom {:attrs          (or (:attrs spec#) {})
                                :events         []
                                :status         :ok
                                :status-message nil})
             started#    (now-unix-nano)
             start-mono# (System/nanoTime)]
         (binding [*current-span-id* span-id#
                   *current-span*    state#]
           (try
             ~@body
             (catch Throwable t#
               (swap! state# assoc :status :error :status-message (ex-message t#))
               (throw t#))
             (finally
               (let [s# @state#]
                 (record-span!
                  {:span_id        span-id#
                   :parent_span_id parent#
                   :name           (:name spec#)
                   :kind           (:kind spec# :internal)
                   :status         (:status s#)
                   :status_message (:status-message s#)
                   :started_at     started#
                   :ended_at       (+ started# (- (System/nanoTime) start-mono#))
                   :attributes     (:attrs s#)
                   :events         (:events s#)})))))))))

(defmacro with-trace
  "Bind a fresh per-turn trace accumulator for `body` when span capture is
  enabled, otherwise bind `nil` so all nested span ops are no-ops."
  [& body]
  `(binding [*trace* (when (metabot.settings/metabot-trace-spans-enabled)
                       {:trace-id (gen-trace-id) :spans (atom [])})]
     ~@body))

(defn current-spans
  "Snapshot of the spans collected on the active trace, or `nil` when disabled."
  []
  (when *trace*
    @(:spans *trace*)))

(defn persist-spans!
  "Bulk-insert the spans collected on the active trace, stamped with their
  owning `conversation-id` and `message-id`. Defensive: a persistence failure is
  logged and swallowed so it never breaks the turn."
  [conversation-id message-id]
  (when-let [spans (seq (current-spans))]
    (try
      (t2/insert! :model/MetabotTraceSpan
                  (mapv #(assoc %
                                :conversation_id conversation-id
                                :message_id message-id)
                        spans))
      (catch Throwable e
        (log/warn e "Failed to persist Metabot trace spans"
                  {:conversation-id conversation-id :message-id message-id})))))

;;; ------------------------------------------------------------- attr builders

(defn chat-attrs
  "Initial attributes for a `chat` (LLM completion) span given the
  provider-and-model string."
  [provider-and-model]
  (cond-> {semconv/gen-ai-operation-name "chat"}
    provider-and-model
    (assoc semconv/gen-ai-request-model provider-and-model
           semconv/gen-ai-system        (provider-util/provider-and-model->provider provider-and-model))))

(defn chat-usage-attrs
  "Derive `gen_ai.usage.*` and `gen_ai.response.finish_reasons` attributes from an
  iteration's parts (the AISDK parts emitted by the LLM stream). Returns a map
  suitable for [[add-attrs!]]."
  [parts]
  (let [usage    (->> parts (filter #(= :usage (:type %))) last :usage)
        finishes (->> parts
                      (filter #(= :finish (:type %)))
                      (keep :finishReason)
                      distinct
                      vec)]
    (cond-> {}
      (:promptTokens usage)        (assoc semconv/gen-ai-usage-input-tokens (:promptTokens usage))
      (:completionTokens usage)    (assoc semconv/gen-ai-usage-output-tokens (:completionTokens usage))
      (:cacheCreationTokens usage) (assoc semconv/gen-ai-usage-cache-creation-input-tokens (:cacheCreationTokens usage))
      (:cacheReadTokens usage)     (assoc semconv/gen-ai-usage-cache-read-input-tokens (:cacheReadTokens usage))
      (seq finishes)               (assoc semconv/gen-ai-response-finish-reasons finishes))))
