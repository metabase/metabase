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
     :qp, :sync, :tasks, :api, :db-user, :db-app, :events

   ## Configuration
     MB_TRACING_ENABLED=true   MB_TRACING_ENDPOINT=host:4317
     MB_TRACING_GROUPS=qp,api  MB_TRACING_SERVICE_NAME=metabase-prod-1"
  (:require
   [clojure.string :as str]
   [steffan-westcott.clj-otel.api.trace.span :as span])
  (:import
   (io.opentelemetry.api.trace Span)
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

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
(register-group! :api     "HTTP request/response lifecycle")
(register-group! :db-user "Customer/user database operations: SQL execution, connection pool")
(register-group! :db-app  "Application/system database operations: sessions, settings, QE writes")
(register-group! :events  "Event system: view logging, audit, notifications")

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
   Called by `metabase.tracing.sdk/init!`.
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
  "Clear cached enabled groups and trace log level. Called by `metabase.tracing.sdk/shutdown!`."
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
;; The custom IdGenerator in tracing.sdk reads (and clears) this value when creating
;; a root span, so the span gets the frontend's trace ID without a parent-child link
;; (which would cause "root span not yet received" in Tempo).
(def ^:private ^ThreadLocal forced-trace-id-holder (ThreadLocal.))

(defn force-trace-id!
  "Set a trace ID to be used by the next root span created on this thread.
   Consumed (and cleared) by the custom IdGenerator in tracing.sdk."
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

;;; -------------------------------------------- MDC Injection (Log↔Trace) -----------------------------------------

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

;;; ------------------------------------------------ Primary Macro -------------------------------------------------

(defmacro with-span
  "Create an OTel span if tracing is enabled for `group`.

   When disabled: zero overhead — single atom deref + boolean check, body runs directly.
   When enabled: creates span AND injects trace_id/span_id into Log4j2 MDC
   for log-to-trace correlation (Loki <-> Tempo in Grafana).

   Saves and restores previous MDC values so that nested spans don't wipe the
   parent span's trace_id/span_id from MDC when they exit.

   Usage:
     (with-span :qp \"qp.process-query\" {:db/id db-id}
       (process-query query))"
  [group span-name attrs & body]
  `(if (group-enabled? ~group)
     (let [prev-trace-id# (ThreadContext/get "trace_id")
           prev-span-id#  (ThreadContext/get "span_id")]
       (span/with-span! {:name ~span-name :attributes ~attrs}
         (inject-trace-id-into-mdc!)
         (try
           ~@body
           (finally
             (if prev-trace-id#
               (do (ThreadContext/put "trace_id" prev-trace-id#)
                   (ThreadContext/put "span_id" prev-span-id#))
               (clear-trace-id-from-mdc!))))))
     (do ~@body)))
