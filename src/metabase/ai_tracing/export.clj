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
   [medley.core :as m]
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
       (filter (comp #{:llm} :type))
       (keep (comp :ai/output-text :attributes))
       (remove (comp str/blank? str))
       last))

(defn- node->semconv-attrs
  "Map a captured span node's domain attributes (`:ai/*`) to Confident AI's OTLP attribute
  schema (`confident.*`). THE single place the wire schema is defined — change vendors/
  conventions here, never at call sites. `confident.span.input`/`output`/`metadata` are
  JSON strings (matching DeepEval's `json.dumps` convention)."
  [{:keys [type attributes] :as node}]
  (let [{:ai/keys [model profile-id user-input input-parts output-text tool-args tool-name tool-output]} attributes
        turn?  (= type :turn)
        ;; Scalars only — large payloads belong in span.input/output. Dumping the full attrs
        ;; map (system prompt etc.) once blew past Confident's ingest size limit.
        scalars (not-empty (select-keys attributes [:ai/iteration :ai/model :ai/tool-count
                                                    :ai/profile-id :ai/msg-count :ai/tool-call-id]))]
    (m/assoc-some
     {}
     "confident.span.type"     (case type :turn "agent" :llm "llm" :tool "tool" nil)
     "confident.span.metadata" (some-> scalars json/encode)
     "confident.span.input"    (some-> (or input-parts tool-args) json/encode)
     "confident.span.output"   (some-> (or output-text tool-output) json/encode)
     "confident.tool.name"     (some-> tool-name str)
     "confident.llm.model"     (some-> model str)
     ;; trace-level attrs drive Confident's trace overview; only meaningful on the root turn
     "confident.trace.input"   (when turn? (some-> user-input json/encode))
     "confident.trace.output"  (when turn? (some-> (final-llm-output node) json/encode))
     "confident.trace.name"    (when turn? (some-> profile-id str))
     "confident.agent.name"    (when turn? (some-> profile-id str)))))

;;;; ----------------------------------------- Java interop helpers -----------------------------------------

(defn- set-attr!
  "Set `v` on `builder` as the right OTel primitive type."
  [^SpanBuilder builder ^String k v]
  (cond
    (string? v)  (.setAttribute builder k ^String v)
    (boolean? v) (.setAttribute builder k (boolean v))
    (integer? v) (.setAttribute builder k (long v))
    (number? v)  (.setAttribute builder k (double v))
    :else        (.setAttribute builder k ^String (str v))))

(defn- event->attributes
  "Build OTel event attributes from an event map's non-`:event` fields (e.g. an error :message),
  so the backend shows WHAT happened, not just that an event occurred."
  ^Attributes [event]
  (.build ^AttributesBuilder
   (reduce-kv (fn [^AttributesBuilder b k v]
                (.put b ^String (name k) ^String (str v)))
              (Attributes/builder)
              (dissoc event :event))))

;;;; ----------------------------------------- Dedicated provider (lazy) ------------------------------------

(defonce ^:private provider-state
  ;; {:sdk OpenTelemetrySdk :provider SdkTracerProvider :tracer Tracer :endpoint <str>} or nil
  (atom nil))

(defn- parse-headers
  "Parse a `\"k=v,k2=v2\"` header string (e.g. an API key) into a map."
  [s]
  (into {} (for [pair  (str/split (or s "") #",")
                 :let  [[k v] (str/split (str/trim pair) #"=" 2)]
                 :when (and (not (str/blank? k)) (some? v))]
             [(str/trim k) (str/trim v)])))

(defn- build-provider!
  [^String endpoint headers ^String service-name]
  (let [exporter (let [builder (doto (OtlpHttpSpanExporter/builder)
                                 (.setEndpoint endpoint))]
                   (doseq [[k v] headers]
                     (.addHeader builder k v))
                   (.build builder))
        provider (-> (SdkTracerProvider/builder)
                     (.addSpanProcessor (SimpleSpanProcessor/create exporter))
                     (.build))
        ;; NOT set as global — fully isolated from production tracing.
        sdk      (-> (OpenTelemetrySdk/builder)
                     (.setTracerProvider provider)
                     (.build))]
    {:sdk sdk :provider provider :tracer (.getTracer sdk service-name) :endpoint endpoint}))

(defn- ensure-provider!
  "Return the dedicated eval provider state, lazily (re)building it on first use or when the
  configured endpoint changes. nil when no endpoint is set (export disabled)."
  []
  (let [endpoint (ai-tracing.settings/ai-eval-otlp-endpoint)
        fresh?   (fn [st] (and st (= endpoint (:endpoint st))))]
    (when-not (str/blank? endpoint)
      (or (let [st @provider-state] (when (fresh? st) st))
          (locking provider-state
            (let [st @provider-state]
              (if (fresh? st)
                st
                (reset! provider-state
                        (build-provider! endpoint
                                         (parse-headers (ai-tracing.settings/ai-eval-otlp-headers))
                                         (ai-tracing.settings/ai-eval-otlp-service-name))))))))))

(defn shutdown!
  "Flush and shut down the dedicated eval provider, if any."
  []
  (when-let [{:keys [^SdkTracerProvider provider]} @provider-state]
    (try
      (.shutdown provider)
      (catch Exception e
        (log/warn e "Error shutting down eval OTLP provider")))
    (reset! provider-state nil)))

;;;; ----------------------------------------- Replay tree -> spans -----------------------------------------

(defn- emit-node!
  "Recursively replay a captured span `node` (and its children) as OTel spans under `parent-ctx`."
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
          (.addEvent span ^String (str (:event ev)) (event->attributes ev)))
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
        (run! #(emit-node! tracer (Context/root) %) roots)
        (let [rc (.join (.forceFlush provider) 10 TimeUnit/SECONDS)]
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
