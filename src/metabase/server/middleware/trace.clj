(ns metabase.server.middleware.trace
  "Ring middleware that creates a root OpenTelemetry span per HTTP request.

   When a frontend `traceparent` header is present, the trace ID is extracted
   and forced onto the root span via a custom IdGenerator (in tracing.sdk).
   This correlates frontend and backend spans under the same trace WITHOUT
   creating a parent-child link to a non-existent browser span — avoiding
   the 'root span not yet received' message in Tempo.

   Uses clj-otel's `new-span!`/`end-span!` (manual span lifecycle) instead of
   `with-span!` (auto-close) because Metabase Ring handlers are async — the handler
   returns immediately and calls `respond` later on a different thread. The span
   must stay open until `respond` or `raise` is called."
  (:require
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]
   [steffan-westcott.clj-otel.api.trace.span :as span])
  (:import
   (io.opentelemetry.api.trace Span StatusCode)
   (io.opentelemetry.context Context Scope)))

(set! *warn-on-reflection* true)

(defn- parse-frontend-trace-id
  "Extract the trace ID from a W3C traceparent header.
   Returns nil if the header is missing or malformed.
   Format: 00-{32-hex-trace-id}-{16-hex-parent-id}-{2-hex-flags}"
  ^String [request]
  (when-let [tp (get-in request [:headers "traceparent"])]
    (second (re-matches #"00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}" tp))))

(defn- end-span-with-status!
  "End a span from its context, setting HTTP status code and error status if applicable."
  [^Span span ^Context span-ctx status-code]
  (when status-code
    (.setAttribute span "http.status_code" (long status-code))
    (when (>= (long status-code) 500)
      (.setStatus span StatusCode/ERROR)))
  (span/end-span! {:context span-ctx}))

(defn- api-request?
  "Returns true for API requests (/api/*) which are the only requests worth tracing.
   Excludes static files (/app/*, /favicon*), the root page (/), and any other
   non-API routes that would create noise as independent traces in the collector."
  [request]
  (.startsWith (str (:uri request)) "/api/"))

(defn wrap-trace
  "Middleware that wraps each HTTP request in an OpenTelemetry span (`:api` group).
   Extracts trace ID from the frontend's traceparent header for correlation.
   Includes HTTP method, URI, and request ID as span attributes.
   Skips static file requests (/app/*, /favicon*) to avoid trace noise.

   Uses clj-otel's `new-span!`/`end-span!` for manual span lifecycle to correctly
   handle async Ring handlers — the span stays open until `respond` or `raise` is called."
  [handler]
  (fn [request respond raise]
    (if (and (tracing/group-enabled? :api)
             (api-request? request))
      (do
        ;; If frontend sent a traceparent, force its trace ID for this thread.
        ;; The custom IdGenerator in tracing.sdk will return it instead of a random one.
        (when-let [tid (parse-frontend-trace-id request)]
          (tracing/force-trace-id! tid))
        (let [;; Create as root span — no parent context means no parent-child link
              ;; to the browser's phantom span. If a frontend trace ID was forced,
              ;; the IdGenerator returns it; otherwise a random trace ID is generated.
              span-ctx   (span/new-span! {:name       "api.request"
                                          :parent     nil
                                          :span-kind  :server
                                          :attributes {:http/method     (some-> (:request-method request) name)
                                                       :http/url        (:uri request)
                                                       :http/request-id (:metabase-request-id request)
                                                       :http/referer    (get-in request [:headers "referer"])}})
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
              (tracing/clear-forced-trace-id!)
              (tracing/clear-trace-id-from-mdc!)))))
      (handler request respond raise))))
