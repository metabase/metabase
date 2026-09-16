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
   (java.io InputStream)))

(set! *warn-on-reflection* true)

(defn- body-too-large-exception [max-bytes]
  (ex-info (tru "Request body exceeds the maximum size of {0} bytes." max-bytes)
           {:status-code 413, :type ::body-too-large}))

(defn bounded-input-stream
  "Wrap `in` so that reading more than `max-bytes` bytes from it throws a 413 exception."
  ^InputStream [^InputStream in max-bytes]
  (let [consumed (atom 0)
        consume! (fn [n]
                   (when (> (swap! consumed + n) max-bytes)
                     (throw (body-too-large-exception max-bytes))))]
    (proxy [InputStream] []
      (read
        ([]
         (let [b (.read in)]
           (when (>= b 0) (consume! 1))
           b))
        ([^bytes buf off len]
         ;; already over the limit: keep throwing rather than clamping to a 0-byte read a caller might retry forever
         (when (> @consumed max-bytes)
           (throw (body-too-large-exception max-bytes)))
         ;; never ask the underlying stream for more than one byte past the limit
         (let [len (min (long len) (inc (- max-bytes @consumed)))
               n   (.read in buf (int off) (int len))]
           (when (pos? n) (consume! n))
           n)))
      (available [] (.available in))
      (close [] (.close in)))))

(defn- multipart? [request]
  (some->> (get-in request [:headers "content-type"])
           (re-find #"^multipart/form-data")))

(defn- limit-request-body
  "For an unauthenticated `request`, reject it outright when its declared `Content-Length` is over the limit;
  otherwise bound `:body` so a chunked body can't sneak past it. Authenticated requests pass through untouched.
  Multipart bodies are exempt: endpoints that accept them opt in explicitly after authentication, streaming parts to
  disk under their own `:max-file-size`."
  [{:keys [body content-length metabase-user-id], :as request}]
  (if (or (nil? body) metabase-user-id (multipart? request))
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
