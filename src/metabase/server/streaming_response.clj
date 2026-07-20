(ns metabase.server.streaming-response
  (:require
   [clojure.core.async :as a]
   [clojure.walk :as walk]
   [compojure.response]
   [metabase.api.common.internal]
   [metabase.server.protocols :as server.protocols]
   [metabase.server.settings :as server.settings]
   [metabase.server.streaming-response.thread-pool :as thread-pool]
   [metabase.util :as u]
   [metabase.util.async :as async.u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [potemkin.types :as p.types]
   [pretty.core :as pretty]
   [ring.util.jakarta.servlet :as servlet]
   [ring.util.response :as response])
  (:import
   (jakarta.servlet AsyncContext AsyncEvent AsyncListener)
   (jakarta.servlet.http HttpServletResponse)
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.net SocketException)
   (java.nio ByteBuffer)
   (java.nio.channels ClosedChannelException SocketChannel)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent Future)
   (java.util.concurrent.atomic AtomicBoolean)
   (java.util.zip GZIPOutputStream)
   (org.eclipse.jetty.ee9.nested HttpChannel Request)
   (org.eclipse.jetty.io EofException SocketChannelEndPoint)))

(set! *warn-on-reflection* true)

(defn- write-to-output-stream!
  ([^OutputStream os x]
   (if (int? x)
     (.write os ^int x)
     (.write os ^bytes x)))

  ([^OutputStream os ^bytes ba ^Integer offset ^Integer len]
   (.write os ba offset len)))

(defn- format-exception [e]
  (cond-> (Throwable->map e)
    (server.settings/hide-stacktraces) (dissoc :via :trace)))

(def ^:dynamic *response*
  "The `HttpServletResponse` for the current streaming response.
   Bound automatically inside `streaming-response` bodies in the Jetty async path.
   Use the helper functions [[committed?]], [[set-status!]], [[set-header!]], and
   [[set-content-type!]] to interact with it."
  nil)

(def ^:dynamic *request*
  "The Jetty `Request` for the current streaming response.
   Bound automatically inside `streaming-response` bodies in the Jetty async path.
   Used by [[abort-connection!]] to tear down the underlying connection when an error
   occurs after the response has already been committed."
  nil)

(def ^:dynamic *completed?*
  "An `AtomicBoolean` that is set to `true` when the async context has been completed,
   either by the worker thread or by Jetty's timeout/error callbacks. When `true`, the
   response object may have been recycled and must not be touched."
  nil)

(defn- async-context-completed?
  "Returns true if the async context has already been completed (by timeout, error, or worker thread).
   When true, the response object may have been recycled by Jetty and must not be touched."
  []
  (and *completed?* (.get ^AtomicBoolean *completed?*)))

(defn- assert-response-bound! []
  (when-not *response*
    (throw (ex-info "Cannot call response control functions outside of a streaming-response context"
                    {}))))

(defn committed?
  "Returns true if the HTTP response has already been committed (headers sent to client).
   Raises if called outside a `streaming-response` context."
  []
  (assert-response-bound!)
  (.isCommitted ^HttpServletResponse *response*))

(defn set-status!
  "Set the HTTP status code on the response. No-op if the response is already committed
   or the async context has already been completed (response may be recycled).
   Raises if called outside a `streaming-response` context."
  [code]
  (assert-response-bound!)
  (when-not (or (async-context-completed?)
                (committed?))
    (.setStatus ^HttpServletResponse *response* (int code))))

(defn set-header!
  "Set a header on the HTTP response. No-op if the response is already committed
   or the async context has already been completed (response may be recycled).
   Raises if called outside a `streaming-response` context."
  [name value]
  (assert-response-bound!)
  (when-not (or (async-context-completed?)
                (committed?))
    (.setHeader ^HttpServletResponse *response* (str name) (str value))))

(defn set-content-type!
  "Set the Content-Type on the HTTP response. No-op if the response is already committed
   or the async context has already been completed (response may be recycled).
   Raises if called outside a `streaming-response` context."
  [ct]
  (assert-response-bound!)
  (when-not (or (async-context-completed?)
                (committed?))
    (.setContentType ^HttpServletResponse *response* (str ct))))

(defn- log-skipped-error! [obj]
  (if (instance? Throwable obj)
    (log/error obj "Async context already completed, cannot write error to client")
    (log/errorf "Async context already completed, cannot write error to client: %s" obj)))

(defn- sanitize-error-obj [obj export-format]
  (-> (if (not= :api export-format)
        (walk/prewalk (fn [x]
                        (if (map? x)
                          (apply dissoc x [:json_query :preprocessed])
                          x))
                      obj)
        obj)
      (dissoc :export-format)
      (cond-> (server.settings/hide-stacktraces) (dissoc :stacktrace :trace :via))))

(defn- abort-connection!
  "Abort the underlying Jetty connection for an *already-committed* streaming response, so it
   terminates without a clean chunked/gzip terminator. The client's `fetch`/`blob()` then
   rejects with a network error instead of silently accepting a truncated body that has a
   JSON error blob appended to it. Marks the async context completed so the worker thread's
   normal `.complete` call is skipped — the abort tears the connection down itself."
  []
  (when (and *request* *completed?*
             (.compareAndSet ^AtomicBoolean *completed?* false true))
    (try
      (let [^HttpChannel channel (.getHttpChannel ^Request *request*)]
        (.abort channel (EofException. "Aborting streaming response after a mid-stream error")))
      (catch Throwable e
        ;; The abort failed, so it won't tear the connection down. Revert the flag we
        ;; optimistically set so the worker thread's `finally` in `do-f-async` can still
        ;; `.complete` the async context, instead of leaving the request to hang until
        ;; Jetty's async timeout fires.
        (.set ^AtomicBoolean *completed?* false)
        (log/error e "Error aborting streaming connection after mid-stream error")))))

(defn- write-error-to-stream!
  "Serialize `obj` as a JSON error body onto `os` and close the stream. Used when there is no
   committed HTTP response to abort — either an uncommitted error response, or a plain output
   stream with no Ring response bound (e.g. [[metabase.query-processor.streaming/do-with-streaming-rff]]
   used directly)."
  [^OutputStream os obj export-format]
  (with-open [os os]
    (log/trace (u/pprint-to-str (list 'write-error! obj)))
    (try
      (let [obj (sanitize-error-obj obj export-format)]
        (with-open [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
          (json/encode-to obj writer {})))
      (catch EofException _)
      (catch Throwable e
        (log/error e "Error writing error to output stream" obj)))))

(defn write-error!
  "Handle an error that occurred while producing a streaming response.

   - When the HTTP response is *not yet committed*, send a normal error response: set the
     status code and `application/json` content type, then write the error as a JSON body.
   - When the response is *already committed* (the error happened mid-stream, after the status
     line and some body bytes are on the wire), abort the connection via [[abort-connection!]].
     We can no longer signal failure through the status code or a parseable trailer, so a clean
     close with an appended error blob would be silently accepted by the client as a successful
     (but corrupt) download. Aborting makes the client's `fetch`/`blob()` reject instead.
   - When no HTTP response is bound (a plain output stream), just write the JSON error body.

   No-op if the async context has already been completed (response and stream may be recycled)."
  ([os obj export-format]
   (write-error! os obj export-format nil))
  ([^OutputStream os obj export-format status-code]
   (cond
     (async-context-completed?)
     (log-skipped-error! obj)

     (some #(instance? % obj) [InterruptedException EofException])
     (log/trace "Error is an InterruptedException or EofException, not writing to output stream")

     (instance? Throwable obj)
     (recur os (format-exception obj) export-format status-code)

     (nil? *response*)
     (write-error-to-stream! os obj export-format)

     (committed?)
     (do
       (log/trace "Streaming response already committed; aborting connection to signal mid-stream error")
       (abort-connection!))

     :else
     (do
       (set-status! (or status-code 500))
       (set-content-type! "application/json")
       (write-error-to-stream! os obj export-format)))))

(defn- do-f* [f ^OutputStream os _finished-chan canceled-chan]
  (try
    (f os canceled-chan)
    (catch EofException _
      (a/>!! canceled-chan ::jetty-eof)
      nil)
    (catch InterruptedException _
      (a/>!! canceled-chan ::thread-interrupted)
      nil)))

(defn- start-interrupt-escalation!
  "If `*thread-interrupt-escalation-timeout-ms*` is set and we receive a cancellation,
  then cancel the future (ie interrupt the thread) if the finished-chan doesn't complete before the timeout.
  This is to handle JDBC drivers that deadlock on `(.cancel stmt)`."
  [^Future fut finished-chan canceled-chan]
  (when (pos? server.settings/*thread-interrupt-escalation-timeout-ms*)
    (a/go
      (when (a/<! canceled-chan)
        (let [timeout-chan (a/timeout server.settings/*thread-interrupt-escalation-timeout-ms*)
              [_ port]     (a/alts! [finished-chan timeout-chan])]
          (when (= port timeout-chan)
            (log/infof "Task still running %s after cancellation, escalating to thread interruption"
                       (u/format-milliseconds server.settings/*thread-interrupt-escalation-timeout-ms*))
            (.cancel fut true)))))))

(defn- do-f-async
  "Runs `f` asynchronously on the streaming response `thread-pool`, returning immediately. When `f` finishes,
  completes (i.e., closes) Jetty `async-context`. `completed?` is an `AtomicBoolean` used to coordinate with
  Jetty's timeout/error callbacks so that only one path calls `.complete`."
  [^AsyncContext async-context response ^Request request f ^OutputStream os finished-chan canceled-chan ^AtomicBoolean completed?]
  {:pre [(some? os)]}
  (let [task (^:once fn* []
               (binding [*response*   response
                         *request*    request
                         *completed?* completed?]
                 (try
                   (do-f* f os finished-chan canceled-chan)
                   (catch Throwable e
                     (log/error e "Caught unexpected Exception in streaming response body")
                     (a/>!! finished-chan :unexpected-error)
                     (write-error! os e nil))
                   (finally
                     ;; Clear the interrupted flag to prevent the thread from
                     ;; carrying stale interrupted state to the next task.
                     (Thread/interrupted)
                     (a/>!! finished-chan (if (a/poll! canceled-chan)
                                            :canceled
                                            :completed))
                     (a/close! finished-chan)
                     (a/close! canceled-chan)
                     (when (.compareAndSet completed? false true)
                       (.complete async-context))))))
        fut  (.submit (thread-pool/thread-pool) ^Runnable task)]
    (start-interrupt-escalation! fut finished-chan canceled-chan)
    nil))

;; `ring.middleware.gzip` doesn't work on our StreamingResponse class.
(defn- should-gzip-response?
  "Does the client accept GZIP-encoded responses?"
  [{{:strs [accept-encoding]} :headers}]
  (some->> accept-encoding (re-find #"gzip|\*")))

(defn- output-stream-delay [gzip? ^HttpServletResponse response]
  (if gzip?
    (delay
      (GZIPOutputStream. (.getOutputStream response) true))
    (delay
      (.getOutputStream response))))

(defn- delay-output-stream
  "An OutputStream proxy that fetches the actual output stream by dereffing a delay (or other dereffable) before first
  use."
  [dlay]
  (proxy [OutputStream] []
    (close []
      (.close ^OutputStream @dlay))
    (flush []
      (.flush ^OutputStream @dlay))
    (write
      ([x]
       (write-to-output-stream! @dlay x))
      ([ba offset length]
       (write-to-output-stream! @dlay ba offset length)))))

(def ^:private async-cancellation-poll-interval-ms
  "How often to check whether the request was canceled by the client."
  1000)

(p.types/defprotocol+ ^:private ChannelProvider
  "Protocol to get a SocketChannel from various types of transports."
  (^SocketChannel get-channel [transport] "Method to extract a SocketChannel."))

;; Extend the protocol to SocketChannel, returning itself
(extend-protocol ChannelProvider
  SocketChannel
  (get-channel [self] self)

  SocketChannelEndPoint
  (get-channel [self] (.getChannel self))

  Object
  (get-channel [_] nil))

(def ^:private *reported-types
  "A set of types returned from `.getTransport` have already been reported as errors. This is used to avoid spamming the logs with the same
  error over and over."
  (atom #{}))

(defn log-unexpected-transport!
  "Log an error when an unexpected transport is encountered."
  [transport]
  (let [transport-type (type transport)]
    (when-not (contains? @*reported-types transport-type)
      (log/errorf "Unexpected transport type encountered in `canceled?`: %s" transport-type))
    (swap! *reported-types conj transport-type)))

(defn- canceled?
  "Check whether the HTTP request has been canceled by the client.

  This function attempts to read a single byte from the underlying TCP socket; if the request is canceled, `.read`
  will return `-1`. Otherwise, since the entire request has already been read, `.read` *should* probably complete
  immediately, returning `0`."
  [^Request request]
  (try
    (let [transport (.. request getHttpChannel getEndPoint getTransport)]
      (if-let [channel (get-channel transport)]
        (let [buf        (ByteBuffer/allocate 1)
              status     (.read channel buf)]
          (log/tracef "Check cancelation status: .read returned %d" status)
          (neg? status))
        (do
          (log-unexpected-transport! transport)
          false)))
    (catch InterruptedException _ false)
    (catch ClosedChannelException _ true)
    (catch SocketException _ true)
    (catch Throwable e
      (log/error e "Error determining whether HTTP request was canceled")
      false)))

(def ^:private async-cancellation-poll-timeout-ms
  "How long to wait for the cancelation check to complete (it should usually complete immediately -- see above -- but if
  it doesn't, we don't want to block forever)."
  1000)

(defn- start-async-cancel-loop!
  "Starts an async loop that checks whether the client has canceled HTTP `request` at some interval. If the client has
  canceled the request, this sends a message to `canceled-chan`."
  [request finished-chan canceled-chan]
  (a/go-loop []
    (let [poll-timeout-chan (a/timeout async-cancellation-poll-interval-ms)
          [_ port]          (a/alts! [poll-timeout-chan finished-chan])]
      (when (= port poll-timeout-chan)
        (log/tracef "Checking cancelation status after waiting %s" (u/format-milliseconds async-cancellation-poll-interval-ms))
        (let [canceled-status-chan (async.u/cancelable-thread (canceled? request))
              status-timeout-chan  (a/timeout async-cancellation-poll-timeout-ms)
              [canceled? port]     (a/alts! [finished-chan canceled-status-chan status-timeout-chan])]
          ;; if `canceled-status-chan` *wasn't* the first channel to return (i.e., we either timed out or the request
          ;; was completed) then close `canceled-status-chan` which will kill the underlying thread
          (a/close! canceled-status-chan)
          (when (= port status-timeout-chan)
            (log/debugf "Check cancelation status timed out after %s"
                        (u/format-milliseconds async-cancellation-poll-timeout-ms)))
          (when (not= port finished-chan)
            (if canceled?
              (a/>! canceled-chan ::request-canceled)
              (recur))))))))

(defn- respond
  [{:keys [^HttpServletResponse response ^AsyncContext async-context request-map response-map request]}
   f {:keys [content-type status headers], :as _options} finished-chan]
  (let [canceled-chan (a/promise-chan)
        completed?   (AtomicBoolean. false)]
    (.addListener async-context
                  (reify AsyncListener
                    (onTimeout [_ _event]
                      (log/warn "Jetty async context timed out, completing request")
                      (when (.compareAndSet completed? false true)
                        (.complete async-context)))
                    (onError [_ event]
                      (log/warn (.getThrowable ^AsyncEvent event) "Jetty async context error, completing request")
                      (when (.compareAndSet completed? false true)
                        (.complete async-context)))
                    (onComplete [_ _event])
                    (onStartAsync [_ _event])))
    (try
      (.setStatus response (or status 202))
      (let [gzip?   (should-gzip-response? request-map)
            headers (cond-> (assoc (merge headers (:headers response-map))
                                   "Content-Type" content-type
                                   ;; Very important: connections which serve streaming responses SHOULD NOT be reused
                                   ;; by the client because of `start-async-cancel-loop!`. The latter tries to read a
                                   ;; byte from the input stream at some interval, and that may/will cause corruption
                                   ;; of the subsequent requests that come through the reused connection (see #46071).
                                   "Connection" "close"
                                   ;; Force chunked transfer encoding so the body has a positive terminator (the
                                   ;; final zero-length chunk). Without it, `Connection: close` makes Jetty delimit
                                   ;; the body by connection close, which is indistinguishable from a truncated
                                   ;; stream — so a mid-stream failure that aborts the connection (see
                                   ;; [[abort-connection!]]) would be silently accepted by the client as a complete
                                   ;; body. With chunked framing the client gets a protocol error instead.
                                   ;; (HTTP/2 has no chunked encoding, but an aborted stream becomes an RST_STREAM,
                                   ;; which the client surfaces as an error just the same.)
                                   "Transfer-Encoding" "chunked")
                      gzip? (assoc "Content-Encoding" "gzip"))]
        (#'servlet/set-headers response headers)
        (let [output-stream-delay (output-stream-delay gzip? response)
              delay-os            (delay-output-stream output-stream-delay)]
          (start-async-cancel-loop! request finished-chan canceled-chan)
          (do-f-async async-context response request f delay-os finished-chan canceled-chan completed?)))
      (catch Throwable e
        (log/error e "Unexpected exception in do-f-async")
        (try
          (.sendError response 500 (.getMessage e))
          (catch Throwable e
            (log/error e "Unexpected exception writing error response")))
        (a/>!! finished-chan :unexpected-error)
        (a/close! finished-chan)
        (a/close! canceled-chan)
        (when (.compareAndSet completed? false true)
          (.complete async-context))))))

(declare render)

(p.types/deftype+ StreamingResponse [f options donechan]
  pretty/PrettyPrintable
  (pretty [_]
    (list `->StreamingResponse f options donechan))

  server.protocols/Respond
  (respond [_this context]
    (respond context f options donechan))

  ;; sync responses only (in some cases?)
  compojure.response/Renderable
  (render [this request]
    (render this (should-gzip-response? request)))

  ;; async responses only
  compojure.response/Sendable
  (send* [this request respond* _raise]
    (respond* (compojure.response/render this request)))

  metabase.api.common.internal/EndpointResponse
  (wrap-response-if-needed [this]
    this))

(defn- render [^StreamingResponse streaming-response gzip?]
  (let [{:keys [headers content-type], :as options} (.options streaming-response)]
    (assoc (response/response (if gzip?
                                (StreamingResponse. (.f streaming-response)
                                                    (assoc options :gzip? true)
                                                    (.donechan streaming-response))
                                streaming-response))
           :headers      (cond-> (assoc headers "Content-Type" content-type)
                           gzip? (assoc "Content-Encoding" "gzip"))
           :status       (or (:status options) 202))))

(defn finished-chan
  "Fetch a promise channel that will get a message when a `StreamingResponse` is completely finished. Provided primarily
  for logging purposes."
  [^StreamingResponse response]
  (.donechan response))

(defn -streaming-response
  "Impl for [[streaming-response]] macro."
  [f options]
  (->StreamingResponse f options (a/promise-chan)))

(defmacro streaming-response
  "Create an API response that streams results to an `OutputStream`.

  Minimal example:

    (streaming-response {:content-type \"application/json; charset=utf-8\"} [os canceled-chan]
      (write-something-to-stream! os))

  `f` should block until it is completely finished writing to the stream, which will be closed thereafter.
  `canceled-chan` can be monitored to see if the request is canceled before results are fully written to the stream.

  Inside the body, [[*response*]] is bound to the `HttpServletResponse`. You can use the helper functions
  [[set-status!]], [[set-header!]], [[set-content-type!]], and [[committed?]] to interact with the response.

  Current options:

  *  `:content-type` -- string content type to return in the results. This is required!
  *  `:headers` -- other headers to include in the API response."
  {:style/indent 2, :arglists '([options [os-binding canceled-chan-binding] & body])}
  [options [os-binding canceled-chan-binding :as bindings] & body]
  {:pre [(= (count bindings) 2)]}
  `(-streaming-response (bound-fn [~(vary-meta os-binding assoc :tag 'java.io.OutputStream) ~canceled-chan-binding] ~@body)
                        ~options))

;;;; Malli schema for StreamingResponse

(defn streaming-response-schema
  "Malli schema for a streaming HTTP response that will contain JSON matching `content-schema`.

  At runtime, validates that the response is a StreamingResponse instance.
  WARNING: DOES NOT VALIDATE the actual data being streamed at runtime. For OpenAPI documentation, uses `content-schema`
  to describe the JSON response body.

  Example:
    (api.macros/defendpoint :post \"/query\"
      :- (server/streaming-response-schema
           [:map
            [:data [:map [:cols sequential?] [:rows sequential?]]]
            [:row_count :int]])
      ...)"
  [content-schema]
  [:fn
   {:openapi/response-schema content-schema
    :description             "Streaming JSON response"
    :error/message           "Non-streaming response returned from streaming endpoint"}
   #(instance? StreamingResponse %)])
