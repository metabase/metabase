(ns metabase.server.middleware.trace
  "Ring middleware that creates a root OpenTelemetry span per HTTP request.
   Extracts W3C Trace Context (traceparent header) from incoming requests
   for distributed tracing support.

   Uses clj-otel's `new-span!`/`end-span!` (manual span lifecycle) instead of
   `with-span!` (auto-close) because Metabase Ring handlers are async — the handler
   returns immediately and calls `respond` later on a different thread. The span
   must stay open until `respond` or `raise` is called."
  (:require
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]
   [steffan-westcott.clj-otel.api.otel :as otel]
   [steffan-westcott.clj-otel.api.trace.span :as span])
  (:import
   (io.opentelemetry.api.trace Span StatusCode)
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
   Returns the extracted context, or Context/current if no traceparent header is present.
   Uses clj-otel's default OTel instance (not GlobalOpenTelemetry) to get the propagator."
  ^Context [request]
  (let [^io.opentelemetry.api.OpenTelemetry otel (otel/get-default-otel!)
        ^io.opentelemetry.context.propagation.TextMapPropagator propagator
        (.getTextMapPropagator (.getPropagators otel))]
    (.extract propagator (Context/current) request ring-header-getter)))

(defn- end-span-with-status!
  "End a span from its context, setting HTTP status code and error status if applicable."
  [^Span span ^Context span-ctx status-code]
  (when status-code
    (.setAttribute span "http.status_code" (long status-code))
    (when (>= (long status-code) 500)
      (.setStatus span StatusCode/ERROR)))
  (span/end-span! {:context span-ctx}))

(defn wrap-trace
  "Middleware that wraps each HTTP request in an OpenTelemetry span (`:api` group).
   Extracts W3C traceparent header for distributed trace context propagation.
   Includes HTTP method, URI, and request ID as span attributes.

   Uses clj-otel's `new-span!`/`end-span!` for manual span lifecycle to correctly
   handle async Ring handlers — the span stays open until `respond` or `raise` is called."
  [handler]
  (fn [request respond raise]
    (if (tracing/group-enabled? :api)
      (let [parent-ctx (extract-parent-context request)
            ;; Create span using clj-otel's new-span! — returns a Context containing the span.
            ;; This goes through clj-otel's default OTel instance (where the SDK is registered),
            ;; NOT GlobalOpenTelemetry (which is no-op).
            span-ctx   (span/new-span! {:name       "api.request"
                                        :parent     parent-ctx
                                        :span-kind  :server
                                        :attributes {:http/method     (some-> (:request-method request) name)
                                                     :http/url        (:uri request)
                                                     :http/request-id (:metabase-request-id request)}})
            ^Span span (span/get-span span-ctx)
            ^Scope scope (.makeCurrent ^Context span-ctx)]
        (tracing/inject-trace-id-into-mdc!)
        (try
          (handler request
                   (fn trace-respond [response]
                     (try
                       (end-span-with-status! span span-ctx (:status response))
                       (catch Throwable t
                         (log/error t "Error ending trace span")))
                     (respond response))
                   (fn trace-raise [exception]
                     (try
                       (.setStatus span StatusCode/ERROR)
                       (.recordException span exception)
                       (span/end-span! {:context span-ctx})
                       (catch Throwable t
                         (log/error t "Error ending trace span on exception")))
                     (raise exception)))
          (catch Throwable t
            ;; Handler itself threw synchronously — end span and re-raise
            (.setStatus span StatusCode/ERROR)
            (.recordException span t)
            (span/end-span! {:context span-ctx})
            (raise t))
          (finally
            ;; Close scope on the middleware thread (restores previous context).
            ;; For async handlers, the callback runs on a different thread — the scope
            ;; closure here is still correct (cleans up this thread's context).
            (.close scope)
            (tracing/clear-trace-id-from-mdc!))))
      (handler request respond raise))))
