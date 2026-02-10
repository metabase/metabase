(ns metabase.server.middleware.trace
  "Ring middleware that creates a root OpenTelemetry span per HTTP request.
   Extracts W3C Trace Context (traceparent header) from incoming requests
   for distributed tracing support."
  (:require
   [metabase.tracing.core :as tracing]
   [steffan-westcott.clj-otel.api.trace.span :as span])
  (:import
   (io.opentelemetry.api GlobalOpenTelemetry)
   (io.opentelemetry.context Context)
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

(defn wrap-trace
  "Middleware that wraps each HTTP request in an OpenTelemetry span (`:api` group).
   Extracts W3C traceparent header for distributed trace context propagation.
   Includes HTTP method, URI, and request ID as span attributes."
  [handler]
  (fn [request respond raise]
    (if (tracing/group-enabled? :api)
      (let [parent-ctx (extract-parent-context request)]
        (span/with-span! {:name       "api.request"
                          :parent     parent-ctx
                          :attributes {:http/method     (some-> (:request-method request) name)
                                       :http/url        (:uri request)
                                       :http/request-id (:metabase-request-id request)}}
          (tracing/inject-trace-id-into-mdc!)
          (try
            (handler request respond raise)
            (finally
              (tracing/clear-trace-id-from-mdc!)))))
      (handler request respond raise))))
