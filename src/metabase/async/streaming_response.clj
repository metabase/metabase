(ns metabase.async.streaming-response
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            compojure.response
            [metabase.async.streaming-response.thread-pool :as thread-pool]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [potemkin.types :as p.types]
            [pretty.core :as pretty]
            [ring.core.protocols :as ring.protocols]
            [ring.util.response :as ring.response])
  (:import [java.io BufferedWriter FilterOutputStream OutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets
           java.util.zip.GZIPOutputStream
           org.eclipse.jetty.io.EofException))

(def ^:private keepalive-interval-ms
  "Interval between sending newline characters to keep Heroku from terminating requests like queries that take a long
  time to complete."
  (u/seconds->ms 1))

(defn- write-to-output-stream!
  ([^OutputStream os x]
   (if (int? x)
     (.write os ^int x)
     (.write os ^bytes x)))

  ([^OutputStream os ^bytes ba ^Integer offset ^Integer len]
   (.write os ba offset len)))

(defn- jetty-eof-canceling-output-stream
  "Wraps an `OutputStream` and sends a message to `canceled-chan` if a jetty `EofException` is thrown when writing to
  the stream."
  ^OutputStream [^OutputStream os canceled-chan]
  (proxy [FilterOutputStream] [os]
    (flush []
      (try
        (.flush os)
        (catch EofException e
          (log/trace "Caught EofException")
          (a/>!! canceled-chan ::cancel)
          (throw e))))
    (write
      ([x]
       (try
         (write-to-output-stream! os x)
         (catch EofException e
           (log/trace "Caught EofException")
           (a/>!! canceled-chan ::cancel)
           (throw e))))

      ([ba off len]
       (try
         (write-to-output-stream! os ba off len)
         (catch EofException e
           (log/trace "Caught EofException")
           (a/>!! canceled-chan ::cancel)
           (throw e)))))))

(defn- start-keepalive-loop! [^OutputStream os write-keepalive-newlines? continue-writing-newlines?]
  (a/go-loop []
    (a/<! (a/timeout keepalive-interval-ms))
    ;; by still attempting to flush even when not writing newlines we can hopefully trigger an EofException if the
    ;; request is canceled
    (when @continue-writing-newlines?
      (when (try
              (when write-keepalive-newlines?
                (.write os (byte \newline)))
              (.flush os)
              ::recur
              (catch Throwable _
                nil))
        (recur)))))

(defn- keepalive-output-stream
  "Wraps an `OutputStream` and writes keepalive newline bytes every interval until someone else starts writing to the
  stream."
  ^OutputStream [^OutputStream os write-keepalive-newlines?]
  (let [continue-writing-newlines? (atom true)]
    (start-keepalive-loop! os write-keepalive-newlines? continue-writing-newlines?)
    (proxy [FilterOutputStream] [os]
      (close []
        (reset! continue-writing-newlines? false)
        (u/ignore-exceptions (.close os)))
      (write
        ([x]
         (reset! continue-writing-newlines? false)
         (write-to-output-stream! os x))

        ([ba off len]
         (reset! continue-writing-newlines? false)
         (write-to-output-stream! os ba off len))))))

(defn- stop-writing-after-close-stream
  "Wraps `OutputStreams` and ignores additional calls to `flush` and `write` after it has been closed. (Background: I
  think we call flush a few more times than we need to which causes Jetty and the GZIPOutputStream to throw
  Exceptions.)"
  ^OutputStream [^OutputStream os]
  (let [closed? (atom false)]
    (proxy [FilterOutputStream] [os]
      (close []
        (when-not @closed?
          (reset! closed? true)
          (u/ignore-exceptions (.close os))))

      (flush []
        (when-not @closed?
          (.flush os)))

      (write
        ([x]
         (when-not @closed?
           (write-to-output-stream! os x)))

        ([ba off len]
         (when-not @closed?
           (write-to-output-stream! os ba off len)))))))

(defn- ex-status-code [e]
  (or (some #((some-fn :status-code :status) (ex-data %))
            (take-while some? (iterate ex-cause e)))
      500))

(defn- format-exception [e]
  (assoc (Throwable->map e) :_status (ex-status-code e)))

(defn write-error!
  "Write an error to the output stream, formatting it nicely. Closes output stream afterwards."
  [^OutputStream os obj]
  (if (instance? Throwable obj)
    (recur os (format-exception obj))
    (with-open [os os]
      (log/trace (pr-str (list 'write-error! obj)))
      (try
        (with-open [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
          (json/generate-stream obj writer))
        (catch EofException _)
        (catch Throwable e
          (log/error e (trs "Error writing error to output stream") obj))))))

(defn- respond* [f ^OutputStream os finished-chan canceled-chan]
  (try
    (f os canceled-chan)
    (catch EofException _
      (println "eof:") ; NOCOMMIT
      (a/>!! canceled-chan ::cancel)
      nil)
    (catch InterruptedException _
      (println "interrupted") ; NOCOMMIT
      (a/>!! canceled-chan ::cancel)
      nil)
    (catch Throwable e
      (println "e:" e) ; NOCOMMIT
      (log/error e (trs "Caught unexpected Exception in streaming response body"))
      (write-error! os e)
      nil)
    (finally
      (a/>!! finished-chan (if (a/poll! canceled-chan)
                             :canceled
                             :done))
      (a/close! finished-chan)
      (a/close! canceled-chan))))

(defn- respond [f {:keys [gzip? write-keepalive-newlines?], :or {write-keepalive-newlines? true}, :as options}
                ^OutputStream os finished-chan canceled-chan]
  (if gzip?
    (with-open [gzos (GZIPOutputStream. os true)]
      (respond f (assoc options :gzip? false) gzos finished-chan canceled-chan)
      (.finish gzos))
    (with-open [os (jetty-eof-canceling-output-stream os canceled-chan)
                os (keepalive-output-stream os write-keepalive-newlines?)
                os (stop-writing-after-close-stream os)]
      (respond* f os finished-chan canceled-chan)
      (.flush os))))

(defn- respond-async [f options ^OutputStream os finished-chan]
  (let [canceled-chan (a/promise-chan identity identity)
        task          (bound-fn []
                        (try
                          (respond f options os finished-chan canceled-chan)
                          (finally
                            (u/ignore-exceptions (.close os)))))
        futur         (.submit (thread-pool/thread-pool) ^Runnable task)]
    (a/go
      (when (a/<! canceled-chan)
        (log/trace "Canceling async thread")
        (future-cancel futur)
        (a/>!! finished-chan :canceled)
        (a/close! finished-chan)
        (a/close! canceled-chan)
        (.flush os)
        (.close os)))))

;; `ring.middleware.gzip` doesn't work on our StreamingResponse class.
(defn- should-gzip-response?
  "GZIP a response if the client accepts GZIP encoding, and, if quality is specified, quality > 0."
  [{{:strs [accept-encoding]} :headers}]
  (re-find #"gzip|\*" accept-encoding))

(declare render)

(p.types/deftype+ StreamingResponse [f options donechan]
  pretty/PrettyPrintable
  (pretty [_]
    (list (symbol (str (.getCanonicalName StreamingResponse) \.)) f options))

  ;; both sync and async responses
  ring.protocols/StreamableResponseBody
  (write-body-to-stream [_ _ os]
    (respond-async f options os donechan))

  ;; sync responses only
  compojure.response/Renderable
  (render [this request]
    (render this (should-gzip-response? request)))

  ;; async responses only
  compojure.response/Sendable
  (send* [this request respond _]
    (respond (compojure.response/render this request))))

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
  `(->StreamingResponse (fn [~(vary-meta os-binding assoc :tag 'java.io.OutputStream) ~canceled-chan-binding] ~@body)
                        ~options
                        (a/promise-chan identity identity)))
