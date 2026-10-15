(ns metabase.server.middleware.body-limit
  "Middleware that bounds the size of request bodies before anything reads them to protect memory.

  [[wrap-limit-request-body]] sits inside [[metabase.server.middleware.session/wrap-current-user-info]], so it knows
  whether the caller is authenticated, and outside every middleware that reads the body, so the bound is in place
  before the first byte is read. Only unauthenticated requests are bounded."
  (:require
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.server.settings :as server.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log])
  (:import
   (java.io InputStream)
   (org.apache.commons.io.input BoundedInputStream)))

(set! *warn-on-reflection* true)

(defn- body-too-large-exception [max-bytes]
  (ex-info (tru "Request body exceeds the maximum size of {0} bytes." max-bytes)
           {:status-code 413, :type ::body-too-large}))

(defn bounded-input-stream
  "Wrap `in` so that reading more than `max-bytes` bytes from it throws a 413 exception.

  The bound is `max-bytes` + 1 so that a body of exactly `max-bytes` still reads through to EOF; that extra byte is
  also the most this ever pulls out of `in` past the limit. Once the bound is hit every subsequent read throws,
  rather than reporting EOF and letting the caller treat a truncated body as the whole thing."
  ^InputStream [^InputStream in max-bytes]
  (let [max-bytes (long max-bytes)]
    (.get (doto (BoundedInputStream/builder)
            (.setInputStream in)
            (.setMaxCount (inc max-bytes))
            (.setOnMaxCount (fn [_max-count _count]
                              (throw (body-too-large-exception max-bytes))))))))

(defn- limit-request-body
  "For an unauthenticated `request`, reject it outright when its declared `Content-Length` is over the limit;
  otherwise bound `:body` so a chunked body can't sneak past it. Authenticated requests pass through untouched."
  [{:keys [body content-length metabase-user-id], :as request}]
  (if (or (nil? body) metabase-user-id)
    request
    (let [max-bytes (server.settings/max-unauthenticated-request-body-bytes)]
      (when (and content-length (> content-length max-bytes))
        (throw (body-too-large-exception max-bytes)))
      (assoc request :body (bounded-input-stream body max-bytes)))))

(defn wrap-limit-request-body
  "Middleware that bounds unauthenticated request bodies, responding with 413 when a body is larger than
  [[server.settings/max-unauthenticated-request-body-bytes]]. Must sit inside
  [[metabase.server.middleware.session/wrap-current-user-info]] and outside every middleware that reads the body."
  [handler]
  (fn [request respond raise]
    (try
      (handler (limit-request-body request) respond raise)
      ;; body readers on the global stack sit outside the API exception middleware, so a limit exceeded there
      ;; surfaces here as a throw rather than through `raise`
      (catch clojure.lang.ExceptionInfo e
        (if (= ::body-too-large (:type (ex-data e)))
          (do
            ;; this responds before `log-api-call`, so note the rejection here
            (log/infof "Rejected %s %s: %s"
                       (some-> (:request-method request) name u/upper-case-en)
                       (:uri request)
                       (ex-message e))
            (respond (mw.exceptions/api-exception-response e request)))
          (throw e))))))
