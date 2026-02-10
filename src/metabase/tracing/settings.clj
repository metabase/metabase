(ns metabase.tracing.settings
  "Env-var-only settings for the OpenTelemetry tracing module.
   All settings are configured exclusively via environment variables (`:setter :none`)."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defsetting tracing-enabled
  (deferred-tru "Enable OpenTelemetry tracing. When true, spans are exported to the configured OTLP collector.")
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-enabled []
                (setting/get-raw-value :tracing-enabled boolean? parse-boolean)))

(defsetting tracing-endpoint
  (deferred-tru "OTLP collector endpoint for trace export.")
  :type       :string
  :default    "http://localhost:4317"
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-endpoint []
                (or (setting/get-raw-value :tracing-endpoint string? identity)
                    "http://localhost:4317")))

(defsetting tracing-protocol
  (deferred-tru "OTLP export protocol: \"grpc\" or \"http\".")
  :type       :string
  :default    "grpc"
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-protocol []
                (let [v (or (setting/get-raw-value :tracing-protocol string? identity)
                            "grpc")]
                  (when-not (#{"grpc" "http"} v)
                    (log/warnf "MB_TRACING_PROTOCOL value '%s' is not valid, expected 'grpc' or 'http'. Defaulting to 'grpc'." v))
                  (if (#{"grpc" "http"} v) v "grpc"))))

(defsetting tracing-groups
  (deferred-tru "Comma-separated list of trace groups to enable, or \"all\" for everything.")
  :type       :string
  :default    "all"
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-groups []
                (or (setting/get-raw-value :tracing-groups string? identity)
                    "all")))

(defsetting tracing-log-level
  (deferred-tru "Log level threshold during traced spans. When a span is active, log events at this level and above bypass per-logger level gates via Log4j2 DynamicThresholdFilter. Requires the filter in log4j2.xml. Valid values: \"INFO\", \"DEBUG\", \"TRACE\".")
  :type       :string
  :default    "INFO"
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-log-level []
                (let [v (or (setting/get-raw-value :tracing-log-level string? identity)
                            "INFO")]
                  (if (#{"TRACE" "DEBUG" "INFO"} v)
                    v
                    (do
                      (log/warnf "MB_TRACING_LOG_LEVEL value '%s' is not valid, expected 'TRACE', 'DEBUG', or 'INFO'. Defaulting to 'INFO'." v)
                      "INFO")))))

(defsetting tracing-max-queue-size
  (deferred-tru "Maximum number of spans queued for export. When the queue is full, new spans are dropped silently. Controls memory usage when the collector is slow or unavailable.")
  :type       :integer
  :default    2048
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-max-queue-size []
                (or (setting/get-raw-value :tracing-max-queue-size pos-int? #(Long/parseLong ^String %))
                    2048)))

(defsetting tracing-export-timeout-ms
  (deferred-tru "Maximum time in milliseconds to wait for a batch export to complete. If the collector is slow or unreachable, the batch is dropped after this timeout.")
  :type       :integer
  :default    10000
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-export-timeout-ms []
                (or (setting/get-raw-value :tracing-export-timeout-ms pos-int? #(Long/parseLong ^String %))
                    10000)))

(defsetting tracing-schedule-delay-ms
  (deferred-tru "Delay in milliseconds between consecutive batch span exports to the collector.")
  :type       :integer
  :default    5000
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-schedule-delay-ms []
                (or (setting/get-raw-value :tracing-schedule-delay-ms pos-int? #(Long/parseLong ^String %))
                    5000)))

(defsetting tracing-service-name
  (deferred-tru "Service name reported in traces. Defaults to the hostname.")
  :type       :string
  :visibility :internal
  :export?    false
  :setter     :none
  :getter     (fn reading-tracing-service-name []
                (or (setting/get-raw-value :tracing-service-name string? identity)
                    (try (.getHostName (java.net.InetAddress/getLocalHost))
                         (catch Exception _
                           "metabase")))))
