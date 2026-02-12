(ns metabase.tracing.pyroscope
  "Optional integration with Pyroscope continuous profiling.

   When Pyroscope agent is on the classpath (via -javaagent:pyroscope.jar),
   tags profiling samples with span_id for trace-to-profile linking in Grafana.
   Uses the same mechanism as grafana/otel-profiling-java: calls
   AsyncProfiler.setTracingContext() to associate profiling samples
   with the active OTel span at the native level.

   All functions are no-ops when Pyroscope is not available.
   Uses runtime reflection — zero compile-time dependency on Pyroscope."
  (:require
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ─────────────────────── Lazy resolution of Pyroscope internals ──────────────────────
;;; All delays return nil if pyroscope.jar is not on the classpath.

;; PyroscopeAsyncProfiler.getAsyncProfiler() → AsyncProfiler instance
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

;; Pyroscope.LabelsWrapper.registerConstant(String) → long
;; Registers a span name string as an integer constant for efficient storage in JFR data.
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

;;; ──────────────────────────────── Public API ─────────────────────────────────────────

(defn available?
  "True if Pyroscope trace-to-profile integration is available.
   Returns true when pyroscope.jar is on the classpath and the async-profiler
   supports setTracingContext."
  []
  (boolean (and @async-profiler-instance @set-tracing-ctx-method)))

(defn set-profiling-context!
  "Tag current thread's profiling samples with span ID and name.
   Called on root span start. No-op if Pyroscope is not available.
   The async-profiler natively associates CPU/alloc/lock samples with the span,
   so profiles can be filtered by span in Pyroscope/Grafana."
  [^String span-id-hex ^String span-name]
  (when-let [^java.lang.reflect.Method method @set-tracing-ctx-method]
    (try
      (let [span-id-long (Long/parseUnsignedLong span-id-hex 16)
            span-name-id (if-let [^java.lang.reflect.Method rc @register-constant-method]
                           (long (.invoke rc nil (into-array Object [span-name])))
                           0)]
        (.invoke method @async-profiler-instance
                 (into-array Object [(Long/valueOf span-id-long)
                                     (Long/valueOf span-name-id)])))
      (catch Exception e
        (log/debug e "Error setting Pyroscope profiling context")))))

(defn clear-profiling-context!
  "Clear profiling context for current thread. Called on root span end.
   No-op if Pyroscope is not available."
  []
  (when-let [^java.lang.reflect.Method method @set-tracing-ctx-method]
    (try
      (.invoke method @async-profiler-instance
               (into-array Object [(Long/valueOf 0) (Long/valueOf 0)]))
      (catch Exception _))))
