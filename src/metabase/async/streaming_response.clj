(ns metabase.async.streaming-response
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            compojure.response
            [metabase.util :as u]
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
  (u/seconds->ms 1)) ; one second

(defn- jetty-eof-canceling-output-stream
  "Wraps an `OutputStream` and sends a message to `canceled-chan` if a jetty `EofException` is thrown when writing to
  the stream."
  ^OutputStream [^OutputStream os canceled-chan]
  (proxy [FilterOutputStream] [os]
    (write
      ([x]
       (try
         (if (int? x)
           (.write os ^int x)
           (.write os ^bytes x))
         (catch EofException e
           (a/>!! canceled-chan ::cancel)
           (throw e))))

      ([^bytes ba ^Integer off ^Integer len]
       (try
         (.write os ba off len)
         (catch EofException e
           (a/>!! canceled-chan ::cancel)
           (throw e)))))))

(defn- keepalive-output-stream
  "Wraps an `OutputStream` and writes keepalive newline bytes every interval until someone else starts writing to the
  stream."
  ^OutputStream [^OutputStream os write-keepalive-newlines?]
  (let [write-newlines? (atom true)]
    (a/go-loop []
      (a/<! (a/timeout keepalive-interval-ms))
      (when @write-newlines?
        (when write-keepalive-newlines?
          (.write os (byte \newline)))
        (.flush os)
        (recur)))
    (proxy [FilterOutputStream] [os]
      (close []
        (reset! write-newlines? false)
        (let [^FilterOutputStream this this]
          (proxy-super close)))
      (write
        ([x]
         (reset! write-newlines? false)
         (if (int? x)
           (.write os ^int x)
           (.write os ^bytes x)))

        ([^bytes ba ^Integer off ^Integer len]
         (reset! write-newlines? false)
         (.write os ba off len))))))

(defmacro ^:private with-open-chan [[chan-binding chan] & body]
  `(let [chan#         ~chan
         ~chan-binding chan#]
     (try
       ~@body
       (finally
         (a/close! chan#)))))

;; TODO - this code is basically duplicated with the code in the QP catch-exceptions middleware; we should refactor to
;; remove the duplication
(defn- exception-chain [^Throwable e]
  (->> (iterate #(.getCause ^Throwable %) e)
       (take-while some?)
       reverse))

(defn- format-exception [e]
  (let [format-ex*           (fn [^Throwable e]
                               {:message    (.getMessage e)
                                :class      (.getCanonicalName (class e))
                                :stacktrace (mapv str (.getStackTrace e))
                                :data       (ex-data e)})
        [e & more :as chain] (exception-chain e)]
    (merge
     (format-ex* e)
     {:_status (or (some #((some-fn :status-code :status) (ex-data %))
                         chain)
                   500)}
     (when (seq more)
       {:via (map format-ex* more)}))))

(defn write-error!
  "Write an error to the output stream, formatting it nicely."
  [^OutputStream os obj]
  (if (instance? Throwable obj)
    (recur os (format-exception obj))
    (try
      (with-open [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
        (json/generate-stream obj writer)
        (.flush writer))
      (catch Throwable _))))

(defn- write-to-stream! [f {:keys [write-keepalive-newlines? gzip?], :as options} ^OutputStream os finished-chan]
  (if gzip?
    (with-open [gzos (GZIPOutputStream. os true)]
      (write-to-stream! f (dissoc options :gzip?) gzos finished-chan))
    (with-open-chan [canceled-chan (a/promise-chan)]
      (with-open [os os
                  os (jetty-eof-canceling-output-stream os canceled-chan)
                  os (keepalive-output-stream os write-keepalive-newlines?)]

        (try
          (f os canceled-chan)
          (catch Throwable e
            (write-error! os {:message (.getMessage e)}))
          (finally
            (.flush os)
            (a/>!! finished-chan (if (a/poll! canceled-chan)
                                   :canceled
                                   :done))
            (a/close! finished-chan)))))))

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
    (write-to-stream! f options os donechan))

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
                        (a/promise-chan)))
