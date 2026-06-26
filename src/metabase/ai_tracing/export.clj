(ns metabase.ai-tracing.export
  "OTLP export sink for eval traces (the seam).

  Takes the in-memory trace tree captured by `metabase.ai-tracing.core` and replays it,
  post-hoc, as OpenTelemetry spans on a DEDICATED TracerProvider — initialized separately
  from `metabase.tracing` so eval spans never reach the production sink and production spans
  never reach the eval backend. Uses a SimpleSpanProcessor + force-flush per trace for
  lossless delivery (the production BatchSpanProcessor drops on overflow).

  Replaying post-hoc (rather than emitting live) keeps the agent's execution path untouched
  and makes the in-memory tree the single source of truth: OTLP is just one more consumer.

  Export is fully opt-in: no-op unless `MB_AI_EVAL_OTLP_ENDPOINT` is set. Point that endpoint
  at any OTLP backend (Confident AI / Langfuse / Phoenix / a local Collector). Vendor swap is
  an endpoint/header change; wire-schema changes live solely in [[node->semconv-attrs]]."
  (:require
   [clojure.string :as str]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (io.opentelemetry.api.common Attributes AttributesBuilder)
   (io.opentelemetry.api.trace Span SpanBuilder Tracer)
   (io.opentelemetry.context Context)
   (io.opentelemetry.exporter.otlp.http.trace OtlpHttpSpanExporter)
   (io.opentelemetry.sdk OpenTelemetrySdk)
   (io.opentelemetry.sdk.trace SdkTracerProvider)
   (io.opentelemetry.sdk.trace.export SimpleSpanProcessor)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

;;;; ----------------------------------------- Schema chokepoint --------------------------------------------

(defn- final-llm-output
  "The text of the last non-blank LLM output in this subtree — the agent's final answer."
  [node]
  (->> (tree-seq :children :children node)
       (filter #(= :llm (:type %)))
       (keep #(let [o (get-in % [:attributes :ai/output-text])]
                (when-not (str/blank? (str o)) o)))
       last))

(defn- node->semconv-attrs
  "Map a captured span node's domain attributes (`:ai/*`) to Confident AI's OTLP attribute
  schema (`confident.*`). THE single place the wire schema is defined — change vendors/
  conventions here, never at call sites. `confident.span.input`/`output`/`metadata` are
  JSON strings (matching DeepEval's `json.dumps` convention)."
  [{:keys [type attributes] :as node}]
  (let [a       attributes
        ;; Small scalars only — NEVER dump large payloads here (they go in span.input/output).
        ;; Dumping the full attrs map (system prompt etc.) blew Confident's ingest size limit.
        meta    (select-keys a [:ai/iteration :ai/model :ai/tool-count :ai/profile-id
                                :ai/msg-count :ai/tool-call-id])
        ;; trace-level output = the agent's final answer = last non-blank LLM output in the turn
        trace-out (when (= type :turn) (final-llm-output node))]
    (cond-> (case type
              :turn {"confident.span.type" "agent"}
              :llm  {"confident.span.type" "llm"}
              :tool {"confident.span.type" "tool"}
              {})                                  ;; generic span -> Confident "Custom"
      (seq meta)           (assoc "confident.span.metadata" (json/encode meta))
      ;; trace-level input/output/name — set on the root agent turn, drive Confident's trace overview
      (and (= type :turn)
           (:ai/user-input a)) (assoc "confident.trace.input" (json/encode (:ai/user-input a)))
      trace-out            (assoc "confident.trace.output" (json/encode trace-out))
      (and (= type :turn)
           (:ai/profile-id a)) (assoc "confident.agent.name" (str (:ai/profile-id a))
                                      "confident.trace.name"  (str (:ai/profile-id a)))
      ;; names / model
      (:ai/tool-name a)    (assoc "confident.tool.name" (str (:ai/tool-name a)))
      (:ai/model a)        (assoc "confident.llm.model" (str (:ai/model a)))
      ;; input / output (JSON strings)
      (:ai/input-parts a)  (assoc "confident.span.input"  (json/encode (:ai/input-parts a)))
      (:ai/output-text a)  (assoc "confident.span.output" (json/encode (:ai/output-text a)))
      (:ai/tool-args a)    (assoc "confident.span.input"  (json/encode (:ai/tool-args a)))
      (:ai/tool-output a)  (assoc "confident.span.output" (json/encode (:ai/tool-output a))))))

(defn- set-attr!
  [^SpanBuilder b ^String k v]
  (cond
    (string? v)  (.setAttribute b k ^String v)
    (boolean? v) (.setAttribute b k (boolean v))
    (integer? v) (.setAttribute b k (long v))
    (number? v)  (.setAttribute b k (double v))
    :else        (.setAttribute b k ^String (str v))))

;;;; ----------------------------------------- Dedicated provider (lazy) ------------------------------------

(defonce ^:private provider-state
  ;; {:sdk OpenTelemetrySdk :provider SdkTracerProvider :tracer Tracer :endpoint <str>} or nil
  (atom nil))

(defn- parse-headers
  "Parse a `\"k=v,k2=v2\"` header string (e.g. an API key) into a map."
  [s]
  (->> (str/split (or s "") #",")
       (map str/trim)
       (remove str/blank?)
       (map #(str/split % #"=" 2))
       (filter #(= 2 (count %)))
       (into {} (map (fn [[k v]] [(str/trim k) (str/trim v)])))))

(defn- build-provider!
  [^String endpoint headers ^String service-name]
  (let [exporter (let [b (OtlpHttpSpanExporter/builder)]
                   (.setEndpoint b endpoint)
                   (doseq [[k v] headers] (.addHeader b k v))
                   (.build b))
        provider (-> (SdkTracerProvider/builder)
                     (.addSpanProcessor (SimpleSpanProcessor/create exporter))
                     (.build))
        sdk      (-> (OpenTelemetrySdk/builder)
                     ;; NOT set as global — fully isolated from production tracing.
                     (.setTracerProvider provider)
                     (.build))]
    {:sdk sdk :provider provider :tracer (.getTracer sdk service-name) :endpoint endpoint}))

(defn- ensure-provider!
  "Return the dedicated eval provider state, lazily building it. nil when no endpoint is set
  (export disabled) or the configured endpoint changed."
  []
  (let [endpoint (ai-tracing.settings/ai-eval-otlp-endpoint)]
    (when-not (str/blank? endpoint)
      (let [st @provider-state]
        (if (and st (= endpoint (:endpoint st)))
          st
          (locking provider-state
            (let [st @provider-state]
              (if (and st (= endpoint (:endpoint st)))
                st
                (reset! provider-state
                        (build-provider! endpoint
                                         (parse-headers (ai-tracing.settings/ai-eval-otlp-headers))
                                         (ai-tracing.settings/ai-eval-otlp-service-name)))))))))))

(defn shutdown!
  "Flush and shut down the dedicated eval provider, if any."
  []
  (when-let [{:keys [^SdkTracerProvider provider]} @provider-state]
    (try (.shutdown provider) (catch Exception e (log/warn e "Error shutting down eval OTLP provider")))
    (reset! provider-state nil)))

;;;; ----------------------------------------- Replay tree -> spans -----------------------------------------

(defn- emit-node!
  [^Tracer tracer ^Context parent-ctx node]
  (let [^SpanBuilder builder (.spanBuilder tracer ^String (:name node))]
    (.setParent builder parent-ctx)
    (when-let [start (:start-epoch-nanos node)]
      (.setStartTimestamp builder (long start) TimeUnit/NANOSECONDS))
    (doseq [[k v] (node->semconv-attrs node)]
      (set-attr! builder k v))
    (let [^Span span (.startSpan builder)
          ctx        (.with parent-ctx span)]
      (try
        (doseq [ev (:events node)]
          ;; carry the event's other fields (e.g. an error :message) as attributes so the
          ;; backend shows WHAT happened, not just that an event occurred.
          (let [^AttributesBuilder ab (Attributes/builder)]
            (doseq [[k v] (dissoc ev :event)]
              (.put ab ^String (name k) ^String (str v)))
            (.addEvent span ^String (str (:event ev)) (.build ab))))
        (doseq [child (:children node)]
          (emit-node! tracer ctx child))
        (finally
          (if-let [end (:end-epoch-nanos node)]
            (.end span (long end) TimeUnit/NANOSECONDS)
            (.end span)))))))

(defn export-trace!
  "Replay a captured eval trace (`roots` = vector of root span nodes from
  `metabase.ai-tracing.core`) onto the dedicated OTLP provider and force-flush. Best-effort:
  never throws into the caller. No-op when export is disabled or `roots` is empty."
  [roots]
  (when (seq roots)
    (try
      (when-let [{:keys [^Tracer tracer ^SdkTracerProvider provider endpoint]} (ensure-provider!)]
        (let [root-ctx (Context/root)]
          (doseq [n roots]
            (emit-node! tracer root-ctx n)))
        (let [rc (-> (.forceFlush provider) (.join 10 TimeUnit/SECONDS))]
          ;; Surface failures loudly — a swallowed 401/oversize is otherwise invisible (nothing
          ;; in the UI, nothing in logs). Common causes: wrong auth header, endpoint, or an
          ;; attribute exceeding the backend's size limit.
          (when-not (.isSuccess rc)
            (log/warnf (str "Eval trace OTLP export to %s reported failure — "
                            "check auth header, endpoint, and attribute sizes")
                       endpoint))))
      (catch Exception e
        (log/warn e "Failed to export eval trace over OTLP"))))
  nil)
