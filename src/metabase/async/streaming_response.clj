(ns metabase.async.streaming-response
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            compojure.response
            [metabase.async.streaming-response.thread-pool :as thread-pool]
            [metabase.server.protocols :as server.protocols]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [potemkin.types :as p.types]
            [pretty.core :as pretty]
            [ring.util
             [response :as ring.response]
             [servlet :as ring.servlet]])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets
           java.util.zip.GZIPOutputStream
           javax.servlet.AsyncContext
           javax.servlet.http.HttpServletResponse
           org.eclipse.jetty.io.EofException))

(defn- write-to-output-stream!
  ([^OutputStream os x]
   (if (int? x)
     (.write os ^int x)
     (.write os ^bytes x)))

  ([^OutputStream os ^bytes ba ^Integer offset ^Integer len]
   (.write os ba offset len)))

(defn- ex-status-code [e]
  (or (some #((some-fn :status-code :status) (ex-data %))
            (take-while some? (iterate ex-cause e)))
      500))

(defn- format-exception [e]
  (assoc (Throwable->map e) :_status (ex-status-code e)))

(defn write-error!
  "Write an error to the output stream, formatting it nicely. Closes output stream afterwards."
  [^OutputStream os obj]
  (cond
    (some #(instance? % obj)
          [InterruptedException EofException])
    (log/trace "Error is an InterruptedException or EofException, not writing to output stream")

    (instance? Throwable obj)
    (recur os (format-exception obj))

    :else
    (with-open [os os]
      (log/trace (u/pprint-to-str (list 'write-error! obj)))
      (try
        (with-open [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
          (json/generate-stream obj writer))
        (catch EofException _)
        (catch Throwable e
          (log/error e (trs "Error writing error to output stream") obj))))))

(defn- do-f* [f ^OutputStream os finished-chan canceled-chan]
  (try
    (f os canceled-chan)
    (catch EofException _
      (a/>!! canceled-chan ::jetty-eof)
      nil)
    (catch InterruptedException _
      (a/>!! canceled-chan ::thread-interrupted)
      nil)
    (catch Throwable e
      (log/error e (trs "Caught unexpected Exception in streaming response body"))
      (write-error! os e)
      nil)
    (finally
      (a/>!! finished-chan (if (a/poll! canceled-chan)
                             :canceled
                             :completed))
      (a/close! finished-chan)
      (a/close! canceled-chan))))

(defn- do-f-async [f ^OutputStream os finished-chan]
  {:pre [(some? os)]}
  (let [canceled-chan (a/promise-chan)
        task          (bound-fn []
                        (try
                          (do-f* f os finished-chan canceled-chan)
                          (catch Throwable e
                            (log/error e (trs "bound-fn caught unexpected Exception"))
                            (a/>!! finished-chan :unexpected-error)
                            (a/close! finished-chan)
                            (a/close! canceled-chan))))]
    (.submit (thread-pool/thread-pool) ^Runnable task)
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

(defn- respond
  [{:keys [^HttpServletResponse response ^AsyncContext async-context request-map response-map]}
   f {:keys [content-type], :as options} finished-chan]
  (a/go
    (a/<! finished-chan)
    (.complete async-context))
  (try
    (.setStatus response 202)
    (let [gzip?   (should-gzip-response? request-map)
          headers (cond-> (assoc (:headers response-map) "Content-Type" content-type)
                    gzip? (assoc "Content-Encoding" "gzip"))]
      (#'ring.servlet/set-headers response headers)
      (let [output-stream-delay (output-stream-delay gzip? response)
            delay-os            (delay-output-stream output-stream-delay)]
        (do-f-async f delay-os finished-chan)))
    (catch Throwable e
      (log/error e (trs "Unexpected exception in do-f-async"))
      (try
        (.sendError response 500 (.getMessage e))
        (catch Throwable e
          (log/error e (trs "Unexpected exception writing error response"))))
      (a/>!! finished-chan :unexpected-error)
      (a/close! finished-chan))))

(declare render)

(p.types/deftype+ StreamingResponse [f options donechan]
  pretty/PrettyPrintable
  (pretty [_]
    (list (symbol (str (.getCanonicalName StreamingResponse) \.)) f options))

  server.protocols/Respond
  (respond [this context]
    (respond context f options donechan))

  ;; sync responses only (in some cases?)
  compojure.response/Renderable
  (render [this request]
    (render this (should-gzip-response? request)))

  ;; async responses only
  compojure.response/Sendable
  (send* [this request respond* _]
    (respond* (compojure.response/render this request))))

;; TODO -- don't think any of this is needed any mo
(defn- render [^StreamingResponse streaming-response gzip?]
  (let [{:keys [headers content-type], :as options} (.options streaming-response)]
    (assoc (ring.response/response (if gzip?
                                     (StreamingResponse. (.f streaming-response)
                                                         (assoc options :gzip? true)
                                                         (.donechan streaming-response))
                                     streaming-response))
           :headers      (cond-> (assoc headers "Content-Type" content-type)
                           gzip? (assoc "Content-Encoding" "gzip"))
           :status       202)))

(defn finished-chan
  "Fetch a promise channel that will get a message when a `StreamingResponse` is completely finished. Provided primarily
  for logging purposes."
  [^StreamingResponse response]
  (.donechan response))

(defn streaming-response*
  "Impl for `streaming-response` macro."
  [f options]
  (->StreamingResponse f options (a/promise-chan)))

(defmacro streaming-response
  "Return an streaming response that writes keepalive newline bytes.

  Minimal example:

    (streaming-response {:content-type \"applicaton/json; charset=utf-8\"} [os canceled-chan]
      (write-something-to-stream! os))

  `f` should block until it is completely finished writing to the stream, which will be closed thereafter.
  `canceled-chan` can be monitored to see if the request is canceled before results are fully written to the stream.

  Current options:

  *  `:content-type` -- string content type to return in the results. This is required!
  *  `:headers` -- other headers to include in the API response.
  *  `:write-keepalive-newlines?` -- whether we should write keepalive newlines every `keepalive-interval-ms`. Default
      `true`; you can disable this for formats where it wouldn't work, such as CSV."
  {:style/indent 2, :arglists '([options [os-binding canceled-chan-binding] & body])}
  [options [os-binding canceled-chan-binding :as bindings] & body]
  {:pre [(= (count bindings) 2)]}
  `(streaming-response* (fn [~(vary-meta os-binding assoc :tag 'java.io.OutputStream) ~canceled-chan-binding] ~@body)
                        ~options))
