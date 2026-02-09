(ns metabase.server.middleware.trace
  "Ring middleware that creates a root OpenTelemetry span per HTTP request."
  (:require
   [metabase.tracing.core :as tracing]))

(set! *warn-on-reflection* true)

(defn wrap-trace
  "Middleware that wraps each HTTP request in an OpenTelemetry span (`:api` group).
   Includes HTTP method, URI, and request ID as span attributes."
  [handler]
  (fn [request respond raise]
    (tracing/with-span :api "api.request"
      {:http/method     (some-> (:request-method request) name)
       :http/url        (:uri request)
       :http/request-id (:metabase-request-id request)}
      (handler request respond raise))))
