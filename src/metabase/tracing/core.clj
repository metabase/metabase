(ns metabase.tracing.core
  "Tracing module API. Add OpenTelemetry traces to your code.

   ## Quick Start
     (require '[metabase.tracing.core :as tracing])
     (tracing/with-span :qp \"qp.preprocess\" {:db/id 42}
       (preprocess query))

   ## New Group
     (tracing/register-group! :my-feature \"Description\")
     (tracing/with-span :my-feature \"my-op\" {} (do-stuff))

   ## Built-in Groups
     :qp, :sync, :tasks, :search, :api, :db-user, :db-app, :events, :quartz

   ## Configuration
     MB_TRACING_ENABLED=true   MB_TRACING_ENDPOINT=host:4317
     MB_TRACING_GROUPS=qp,api  MB_TRACING_SERVICE_NAME=metabase-prod-1"
  (:require
   [clojure.string :as str]
   [metabase.tracing.attributes :as trace-attrs]
   [metabase.util.log :as log]
   [potemkin :as p]
   [steffan-westcott.clj-otel.api.otel :as otel]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [steffan-westcott.clj-otel.exporter.otlp.http.trace :as otlp-http]
   [steffan-westcott.clj-otel.sdk.otel-sdk :as otel-sdk])
  (:import
   (io.opentelemetry.api.trace Span SpanContext)
   (io.opentelemetry.sdk.trace IdGenerator)
   (java.time Duration)
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(p/import-vars
 [trace-attrs
  sanitize-sql])

;;; ------------------------------------------------ Group Registry ------------------------------------------------

(defonce ^:private group-registry
  (atom {}))

(defn register-group!
  "Register a trace group. Groups can be selectively enabled via MB_TRACING_GROUPS."
  [group-key description]
  (swap! group-registry assoc group-key {:description description})
  nil)

;; Built-in groups
(register-group! :qp      "Query processor: preprocess, compile, execute, cache")
(register-group! :sync    "Database sync: metadata, analysis, fingerprinting, field values")
(register-group! :tasks   "Scheduled background tasks (Quartz jobs)")
(register-group! :search  "Search: full-text, semantic, indexing, ingestion")
(register-group! :api     "HTTP request/response lifecycle")
(register-group! :db-user "Customer/user database operations: SQL execution, connection pool")
(register-group! :db-app  "Application/system database operations: sessions, settings, QE writes")
(register-group! :events  "Event system: view logging, audit, notifications")
(register-group! :quartz  "Quartz scheduler internals: trigger acquisition, locks, heartbeats, JDBC")

(defn registered-groups
  "Return a map of all registered trace groups."
  []
  @group-registry)

;;; ----------------------------------------------- Runtime State --------------------------------------------------

;; Cached set of enabled groups, or `:all`. nil means tracing is disabled.
(defonce ^:private enabled-groups (atom nil))

;; Cached trace log level string (e.g. "DEBUG"). Used by DynamicThresholdFilter in log4j2.xml
;; to lower the effective log threshold for traced threads. nil means tracing is disabled.
(defonce ^:private trace-log-level (atom nil))

(defn init-enabled-groups!
  "Parse the tracing-groups and log-level settings and cache the results.
   `log-level-str` is the MB_TRACING_LOG_LEVEL value (e.g. \"DEBUG\", \"INFO\")."
  [groups-str log-level-str]
  (let [groups-str (or groups-str "all")]
    (reset! enabled-groups
            (if (= "all" (str/trim groups-str))
              :all
              (->> (str/split groups-str #",")
                   (map (comp keyword str/trim))
                   (set)))))
  (reset! trace-log-level (or log-level-str "INFO")))

(defn shutdown-groups!
  "Clear cached enabled groups and trace log level."
  []
  (reset! enabled-groups nil)
  (reset! trace-log-level nil))

(defn group-enabled?
  "Check if a trace group is currently enabled. Returns false when tracing is disabled."
  [group]
  (when-let [groups @enabled-groups]
    (or (= groups :all)
        (contains? groups group))))

;;; ------------------------------------------ Forced Trace ID (Frontend) ----------------------------------------

;; ThreadLocal for per-request trace ID override from frontend traceparent header.
;; The custom IdGenerator reads (and clears) this value when creating a root span,
;; so the span gets the frontend's trace ID without a parent-child link
;; (which would cause "root span not yet received" in Tempo).
(def ^:private ^ThreadLocal forced-trace-id-holder (ThreadLocal.))

(defn force-trace-id!
  "Set a trace ID to be used by the next root span created on this thread.
   Consumed (and cleared) by the custom IdGenerator."
  [^String trace-id]
  (.set forced-trace-id-holder trace-id))

(defn get-and-clear-forced-trace-id!
  "Get and atomically clear the forced trace ID for this thread. Returns nil if none set.
   Called by the custom IdGenerator — should not be called directly."
  ^String []
  (let [tid (.get forced-trace-id-holder)]
    (when tid
      (.remove forced-trace-id-holder))
    tid))

(defn clear-forced-trace-id!
  "Clear any forced trace ID without consuming it. Safety cleanup."
  []
  (.remove forced-trace-id-holder))

;;; -------------------------------------------- MDC Injection (Log<->Trace) -----------------------------------------

(defn inject-trace-id-into-mdc!
  "Inject current span's trace_id, span_id, and trace_level into Log4j2 MDC.
   - trace_id/span_id: for log-to-trace correlation (Loki <-> Tempo).
   - trace_level: consumed by DynamicThresholdFilter in log4j2.xml to lower
     the effective log threshold for this thread during the span."
  []
  (let [span (Span/current)
        ctx  (.getSpanContext span)]
    (ThreadContext/put "trace_id" (.getTraceId ctx))
    (ThreadContext/put "span_id" (.getSpanId ctx)))
  (when-let [level @trace-log-level]
    (ThreadContext/put "trace_level" level)))

(defn clear-trace-id-from-mdc!
  "Remove trace_id, span_id, and trace_level from Log4j2 MDC."
  []
  (ThreadContext/remove "trace_id")
  (ThreadContext/remove "span_id")
  (ThreadContext/remove "trace_level"))

;;; ------------------------------------------------- Tracer Access ------------------------------------------------

(defn get-tracer
  "Return an OTel `Tracer` for the given instrumentation library name.
   Uses the clj-otel default OTel instance (set during SDK init), NOT
   `GlobalOpenTelemetry` (which may be no-op if `:set-as-global` was false)."
  ^io.opentelemetry.api.trace.Tracer [^String library-name]
  (let [^io.opentelemetry.api.OpenTelemetry otel-instance (otel/get-default-otel!)]
    (.getTracer otel-instance library-name)))

;;; --------------------------------------------- Pyroscope Integration --------------------------------------------
;;; Optional integration with Pyroscope continuous profiling. When pyroscope.jar is on the
;;; classpath, tags profiling samples with span_id for trace-to-profile linking in Grafana.
;;; All functions are no-ops when Pyroscope is not available. Uses runtime reflection only.

;; PyroscopeAsyncProfiler.getAsyncProfiler() -> AsyncProfiler instance
(defonce ^:private async-profiler-instance
  (delay
    (try
      (let [factory-cls (Class/forName "io.pyroscope.PyroscopeAsyncProfiler")
            ^java.lang.reflect.Method getter (.getMethod factory-cls "getAsyncProfiler" (make-array Class 0))]
        (.invoke getter nil (make-array Object 0)))
      (catch ClassNotFoundException _
        nil)
      (catch Exception e
        (log/debug e "Could not resolve PyroscopeAsyncProfiler")
        nil))))

;; AsyncProfiler.setTracingContext(long spanId, long spanNameId)
(defonce ^:private set-tracing-ctx-method
  (delay
    (when-let [profiler @async-profiler-instance]
      (try
        (.getMethod (class profiler) "setTracingContext"
                    (into-array Class [Long/TYPE Long/TYPE]))
        (catch NoSuchMethodException _
          (log/debug "AsyncProfiler.setTracingContext not available")
          nil)
        (catch Exception _ nil)))))

;; Pyroscope.LabelsWrapper.registerConstant(String) -> long
(defonce ^:private register-constant-method
  (delay
    (try
      ;; v2.x package path
      (let [cls (Class/forName "io.pyroscope.labels.v2.Pyroscope$LabelsWrapper")]
        (.getMethod cls "registerConstant" (into-array Class [String])))
      (catch ClassNotFoundException _
        (try
          ;; v1.x package path
          (let [cls (Class/forName "io.pyroscope.labels.Pyroscope$LabelsWrapper")]
            (.getMethod cls "registerConstant" (into-array Class [String])))
          (catch ClassNotFoundException _ nil)
          (catch Exception _ nil)))
      (catch Exception _ nil))))

(defn pyroscope-available?
  "True if Pyroscope trace-to-profile integration is available.
   Returns true when pyroscope.jar is on the classpath and the async-profiler
   supports setTracingContext."
  []
  (boolean (and @async-profiler-instance @set-tracing-ctx-method)))

(defn set-pyroscope-context!
  "Tag current thread's profiling samples with span ID and name, and set the
   `pyroscope.profile.id` attribute on the span (for Grafana trace-to-profile linking).
   No-op if Pyroscope is not available."
  [^Span span ^String span-id-hex ^String span-name]
  (when-let [^java.lang.reflect.Method method @set-tracing-ctx-method]
    (try
      (let [span-id-long (Long/parseUnsignedLong span-id-hex 16)
            span-name-id (if-let [^java.lang.reflect.Method rc @register-constant-method]
                           (long (.invoke rc nil (into-array Object [span-name])))
                           0)]
        (.invoke method @async-profiler-instance
                 (into-array Object [(Long/valueOf span-id-long)
                                     (Long/valueOf span-name-id)]))
        (.setAttribute span "pyroscope.profile.id" span-id-hex))
      (catch Exception e
        (log/debug e "Error setting Pyroscope profiling context")))))

(defn clear-pyroscope-context!
  "Clear profiling context for current thread. No-op if Pyroscope is not available."
  []
  (when-let [^java.lang.reflect.Method method @set-tracing-ctx-method]
    (try
      (.invoke method @async-profiler-instance
               (into-array Object [(Long/valueOf 0) (Long/valueOf 0)]))
      (catch Exception _))))

;;; ------------------------------------------------ Primary Macro -------------------------------------------------

(defmacro with-span
  "Create an OTel span if tracing is enabled for `group`.

   When disabled: zero overhead — single atom deref + boolean check, body runs directly.
   When enabled: creates span AND injects trace_id/span_id into Log4j2 MDC
   for log-to-trace correlation (Loki <-> Tempo in Grafana).

   Saves and restores previous MDC values so that nested spans don't wipe the
   parent span's trace_id/span_id from MDC when they exit.

   For root spans (no parent in MDC), also sets Pyroscope profiling context so
   that CPU/alloc/lock samples are tagged with the span ID. This covers task spans
   and other entry points that don't go through the API trace middleware.
   API requests get profiling context from wrap-trace instead.

   Usage:
     (with-span :qp \"qp.process-query\" {:db/id db-id}
       (process-query query))"
  [group span-name attrs & body]
  `(if (group-enabled? ~group)
     (let [prev-trace-id# (ThreadContext/get "trace_id")
           prev-span-id#  (ThreadContext/get "span_id")
           root-span?#    (nil? prev-span-id#)]
       (span/with-span! {:name ~span-name :attributes ~attrs}
         (inject-trace-id-into-mdc!)
         ;; For root spans (no parent in MDC), set Pyroscope profiling context.
         ;; Nested child spans skip this — the root's context covers all samples.
         (when root-span?#
           (let [^Span span#                   (Span/current)
                 ^SpanContext ctx#              (.getSpanContext span#)
                 span-id#                       (.getSpanId ctx#)]
             (set-pyroscope-context! span# span-id# ~span-name)))
         (try
           ~@body
           (finally
             (when root-span?#
               (clear-pyroscope-context!))
             (if prev-trace-id#
               (do (ThreadContext/put "trace_id" prev-trace-id#)
                   (ThreadContext/put "span_id" prev-span-id#))
               (clear-trace-id-from-mdc!))))))
     (do ~@body)))

;;; -------------------------------------------- SDK Lifecycle -------------------------------------------------
;;; OpenTelemetry SDK initialization and shutdown. Initializes the OTel SDK with an OTLP
;;; span exporter for pushing traces to a collector. Has no database dependency — can be
;;; initialized very early in the startup process.

;; Holds the initialized OpenTelemetrySdk instance for manual shutdown.
(defonce ^:private otel-sdk-instance (atom nil))

(defn- make-id-generator
  "Create an IdGenerator that respects forced trace IDs from frontend traceparent
   headers (via `force-trace-id!`), falling back to random generation.
   This allows frontend-originated requests to share a trace ID without creating
   a parent-child link to a non-existent browser span."
  ^IdGenerator []
  (let [^IdGenerator default-gen (IdGenerator/random)]
    (reify IdGenerator
      (generateTraceId [_]
        (or (get-and-clear-forced-trace-id!)
            (.generateTraceId default-gen)))
      (generateSpanId [_]
        (.generateSpanId default-gen)))))

(defn init!
  "Initialize the OTel SDK with OTLP HTTP exporter. No-op when MB_TRACING_ENABLED=false.
   Should be called as early as possible in startup — has no database dependency.
   Uses requiring-resolve for settings to avoid cyclic load dependency."
  []
  (if-not ((requiring-resolve 'metabase.tracing.settings/tracing-enabled))
    (log/info "OpenTelemetry tracing is disabled (MB_TRACING_ENABLED=false)")
    (try
      (let [endpoint      ((requiring-resolve 'metabase.tracing.settings/tracing-endpoint))
            service-name  ((requiring-resolve 'metabase.tracing.settings/tracing-service-name))
            groups-str    ((requiring-resolve 'metabase.tracing.settings/tracing-groups))
            log-level-str ((requiring-resolve 'metabase.tracing.settings/tracing-log-level))
            queue-size    ((requiring-resolve 'metabase.tracing.settings/tracing-max-queue-size))
            timeout-ms    ((requiring-resolve 'metabase.tracing.settings/tracing-export-timeout-ms))
            delay-ms      ((requiring-resolve 'metabase.tracing.settings/tracing-schedule-delay-ms))
            exporter      (otlp-http/span-exporter {:endpoint endpoint})]
        (log/infof "Initializing OpenTelemetry tracing: service=%s endpoint=%s groups=%s log-level=%s"
                   service-name endpoint groups-str log-level-str)
        (log/infof "Batch span processor config: max-queue-size=%d export-timeout-ms=%d schedule-delay-ms=%d"
                   queue-size timeout-ms delay-ms)
        (let [otel (otel-sdk/init-otel-sdk!
                    service-name
                    {:set-as-default        true
                     :register-shutdown-hook false  ;; we manage shutdown ourselves
                     :tracer-provider
                     {:id-generator    (make-id-generator)
                      :span-processors [{:exporters        [exporter]
                                         :max-queue-size   queue-size
                                         :exporter-timeout (Duration/ofMillis timeout-ms)
                                         :schedule-delay   (Duration/ofMillis delay-ms)}]}})]
          (reset! otel-sdk-instance otel)
          (init-enabled-groups! groups-str log-level-str)
          (log/info "OpenTelemetry tracing initialized successfully")))
      (catch Exception e
        (log/error e "Failed to initialize OpenTelemetry tracing — tracing will be disabled")))))

(defn shutdown!
  "Shutdown the OTel SDK, flushing any pending spans. Called during application shutdown."
  []
  (when-let [otel @otel-sdk-instance]
    (log/info "Shutting down OpenTelemetry tracing...")
    (try
      (otel-sdk/close-otel-sdk! otel)
      (catch Exception e
        (log/warn e "Error shutting down OpenTelemetry SDK")))
    (reset! otel-sdk-instance nil)
    (shutdown-groups!)
    (log/info "OpenTelemetry tracing shut down")))
