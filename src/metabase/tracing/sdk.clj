(ns metabase.tracing.sdk
  "OpenTelemetry SDK lifecycle management. Initializes the OTel SDK with an OTLP span exporter
   for pushing traces to a collector. Has no database dependency — can be initialized very early
   in the startup process."
  (:require
   [metabase.tracing.core :as tracing]
   [metabase.tracing.settings :as tracing.settings]
   [metabase.util.log :as log]
   [steffan-westcott.clj-otel.sdk.otel-sdk :as sdk])
  (:import
   (io.opentelemetry.sdk.trace IdGenerator)
   (java.time Duration)))

(set! *warn-on-reflection* true)

;; Holds the initialized OpenTelemetrySdk instance for manual shutdown.
(defonce ^:private otel-sdk-instance (atom nil))

(defn- make-id-generator
  "Create an IdGenerator that respects forced trace IDs from frontend traceparent
   headers (via `tracing/force-trace-id!`), falling back to random generation.
   This allows frontend-originated requests to share a trace ID without creating
   a parent-child link to a non-existent browser span."
  ^IdGenerator []
  (let [default-gen (IdGenerator/random)]
    (reify IdGenerator
      (generateTraceId [_]
        (or (tracing/get-and-clear-forced-trace-id!)
            (.generateTraceId default-gen)))
      (generateSpanId [_]
        (.generateSpanId default-gen)))))

(defn- make-span-exporter
  "Create an OTLP span exporter based on the configured protocol."
  [protocol endpoint]
  (case protocol
    "grpc" ((requiring-resolve 'steffan-westcott.clj-otel.exporter.otlp.grpc.trace/span-exporter)
            {:endpoint endpoint})
    "http" ((requiring-resolve 'steffan-westcott.clj-otel.exporter.otlp.http.trace/span-exporter)
            {:endpoint endpoint})))

(defn init!
  "Initialize the OTel SDK with OTLP exporter. No-op when MB_TRACING_ENABLED=false.
   Should be called as early as possible in startup — has no database dependency."
  []
  (if-not (tracing.settings/tracing-enabled)
    (log/info "OpenTelemetry tracing is disabled (MB_TRACING_ENABLED=false)")
    (try
      (let [endpoint      (tracing.settings/tracing-endpoint)
            protocol      (tracing.settings/tracing-protocol)
            service-name  (tracing.settings/tracing-service-name)
            groups-str    (tracing.settings/tracing-groups)
            log-level-str (tracing.settings/tracing-log-level)
            queue-size    (tracing.settings/tracing-max-queue-size)
            timeout-ms    (tracing.settings/tracing-export-timeout-ms)
            delay-ms      (tracing.settings/tracing-schedule-delay-ms)
            exporter      (make-span-exporter protocol endpoint)]
        (log/infof "Initializing OpenTelemetry tracing: service=%s endpoint=%s protocol=%s groups=%s log-level=%s"
                   service-name endpoint protocol groups-str log-level-str)
        (log/infof "Batch span processor config: max-queue-size=%d export-timeout-ms=%d schedule-delay-ms=%d"
                   queue-size timeout-ms delay-ms)
        (let [otel (sdk/init-otel-sdk!
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
          (tracing/init-enabled-groups! groups-str log-level-str)
          (log/info "OpenTelemetry tracing initialized successfully")))
      (catch Exception e
        (log/error e "Failed to initialize OpenTelemetry tracing — tracing will be disabled")))))

(defn shutdown!
  "Shutdown the OTel SDK, flushing any pending spans. Called during application shutdown."
  []
  (when-let [otel @otel-sdk-instance]
    (log/info "Shutting down OpenTelemetry tracing...")
    (try
      (sdk/close-otel-sdk! otel)
      (catch Exception e
        (log/warn e "Error shutting down OpenTelemetry SDK")))
    (reset! otel-sdk-instance nil)
    (tracing/shutdown-groups!)
    (log/info "OpenTelemetry tracing shut down")))
