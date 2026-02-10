(ns metabase.server.middleware.trace
  "Ring middleware that creates a root OpenTelemetry span per HTTP request.
   Extracts W3C Trace Context (traceparent header) from incoming requests
   for distributed tracing support.

   Uses manual span lifecycle (not `with-span!`) because Metabase Ring handlers
   are async — the handler returns immediately and calls `respond` later on a
   different thread. The span must stay open until `respond` or `raise` is called."
  (:require
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log])
  (:import
   (io.opentelemetry.api GlobalOpenTelemetry)
   (io.opentelemetry.api.trace Span SpanKind StatusCode)
   (io.opentelemetry.context Context Scope)
   (io.opentelemetry.context.propagation TextMapGetter)))

(set! *warn-on-reflection* true)

;; TextMapGetter that reads headers from a Ring request map.
;; Ring normalizes header names to lowercase, which matches W3C traceparent/tracestate.
(def ^:private ring-header-getter
  (reify TextMapGetter
    (keys [_ carrier]
      (or (clojure.core/keys (:headers carrier)) []))
    (^String get [_ carrier ^String key]
      (clojure.core/get (:headers carrier) key))))

(defn- extract-parent-context
  "Extract W3C Trace Context from incoming request headers.
   Returns the extracted context, or Context/current if no traceparent header is present."
  ^Context [request]
  (let [^io.opentelemetry.context.propagation.TextMapPropagator propagator
        (.getTextMapPropagator (.getPropagators (GlobalOpenTelemetry/get)))]
    (.extract propagator (Context/current) request ring-header-getter)))

(defn- start-request-span
  "Start a new span for an HTTP request. Returns [^Span span, ^Scope scope].
   Caller is responsible for ending the span and closing the scope."
  ^Span [^Context parent-ctx request]
  (let [tracer    (.getTracer (GlobalOpenTelemetry/get) "metabase.server")
        builder   (-> (.spanBuilder tracer "api.request")
                      (.setParent parent-ctx)
                      (.setSpanKind SpanKind/SERVER)
                      (.setAttribute "http.method" (str (some-> (:request-method request) name)))
                      (.setAttribute "http.url" (str (:uri request))))]
    (when-let [rid (:metabase-request-id request)]
      (.setAttribute builder "http.request_id" (str rid)))
    (.startSpan builder)))

(defn- end-span-with-status!
  "End a span, setting HTTP status code and error status if applicable."
  [^Span span ^Scope scope status-code]
  (try
    (when status-code
      (.setAttribute span "http.status_code" (long status-code))
      (when (>= (long status-code) 500)
        (.setStatus span StatusCode/ERROR)))
    (.end span)
    (finally
      (.close scope))))

(defn wrap-trace
  "Middleware that wraps each HTTP request in an OpenTelemetry span (`:api` group).
   Extracts W3C traceparent header for distributed trace context propagation.
   Includes HTTP method, URI, and request ID as span attributes.

   Uses manual span lifecycle to correctly handle async Ring handlers — the span
   stays open until `respond` or `raise` is called."
  [handler]
  (fn [request respond raise]
    (if (tracing/group-enabled? :api)
      (let [parent-ctx (extract-parent-context request)
            span       (start-request-span parent-ctx request)
            scope      (.makeCurrent span)]
        (tracing/inject-trace-id-into-mdc!)
        (try
          (handler request
                   (fn trace-respond [response]
                     (try
                       (end-span-with-status! span scope (:status response))
                       (tracing/clear-trace-id-from-mdc!)
                       (catch Throwable t
                         (log/error t "Error ending trace span")))
                     (respond response))
                   (fn trace-raise [exception]
                     (try
                       (.setStatus span StatusCode/ERROR)
                       (.recordException span exception)
                       (.end span)
                       (.close scope)
                       (tracing/clear-trace-id-from-mdc!)
                       (catch Throwable t
                         (log/error t "Error ending trace span on exception")))
                     (raise exception)))
          (catch Throwable t
            ;; Handler itself threw (not async) — end span and re-raise
            (.setStatus span StatusCode/ERROR)
            (.recordException span t)
            (.end span)
            (.close scope)
            (tracing/clear-trace-id-from-mdc!)
            (raise t))))
      (handler request respond raise))))
