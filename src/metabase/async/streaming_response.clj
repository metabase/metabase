(ns metabase.async.streaming-response
  "A special Ring response type that can handle async, streaming results. It writes newlines as 'heartbeats' to the
  client until the real results are ready to begin streaming, then streams those to the client."
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            compojure.response
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.util.i18n :refer [trs]]
            [potemkin.types :as p.types]
            [pretty.core :as pretty]
            [ring.core.protocols :as ring.protocols]
            [ring.util.response :as ring.response])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           [org.apache.commons.io Charsets IOUtils]
           org.eclipse.jetty.io.EofException))

(def ^:private keepalive-interval-ms
  "Interval between sending newline characters to keep Heroku from terminating requests like queries that take a long
  time to complete."
  (u/seconds->ms 1)) ; one second

(def ^:private absolute-max-keepalive-ms
  "Absolute maximum amount of time to wait for a response to return results, instead of keeping the connection open
  forever. Normally we'll eventually give up when a connection is closed, but if someone keeps the connection open
  forever, or if there's a bug in the API code (and `respond` is never called, or a value is never written to the
  channel it returns) give up after 4 hours."
  (cond
    config/is-prod? (u/hours->ms 4)
    config/is-dev?  (u/minutes->ms 10)
    config/is-test? (u/minutes->ms 1)))

;; TODO - this code is basically duplicated with the code in the QP catch-exceptions middleware; we should refactor to
;; remove the duplication
(defn- exception-chain [^Throwable e]
  (->> (iterate #(.getCause ^Throwable %) e)
       (take-while some?)
       reverse))

(defn- format-exception [e]
  (let [format-ex*           (fn [^Throwable e]
                               {:message    (.getMessage e)
                                :class      (class e)
                                :stacktrace (seq (.getStackTrace e))
                                :data       (ex-data e)})
        [e & more :as chain] (exception-chain e)]
    (merge
     (format-ex* e)
     {:_status (or (some #((some-fn :status-code :status) (ex-data %))
                         chain)
                   500)}
     (when (seq more)
       {:via (map format-ex* more)}))))

(defn write-error-and-close!
  "Util fn for writing an Exception to the OutputStream provided by `streaming-response`."
  [^OutputStream os, ^Throwable e]
  (with-open [writer (BufferedWriter. (OutputStreamWriter. os))]
    (try
      (json/generate-stream (format-exception e)
                            writer)
      (catch EofException _)))
  (.close os))

(defn- proxy-output-stream
  "Proxy that wraps an `OutputStream` and:

  1.  Sends a message to `they-have-started-writing-chan` whenever someone writes something
  2.  Sends a message to `they-are-done-chan` whenever someone closes the output stream

  The overhead of this compared to the wrapped `OutputStream` is relatively low -- ~85 ms for 1 million writes to disk
  vs ~25 ms for a raw OutputStream."
  ^OutputStream [^OutputStream os {:keys [they-have-started-writing-chan they-are-done-chan]}]
  (let [send-begin-message! (delay
                              (a/>!! they-have-started-writing-chan ::wrote-something))
        send-close-message! (delay
                              (a/>!! they-are-done-chan ::closed))]
    ;; TODO -- consider making this a `FilterInputStream` so it can actually take `os` as a constructor arg and
    ;; provide default impls for some methods
    (proxy [OutputStream] []
      (close []
        @send-close-message!
        (u/ignore-exceptions
          (.close os)))
      (flush []
        (u/ignore-exceptions
          (.flush os)))
      (write
        ([x]
         @send-begin-message!
         (if (int? x)
           (.write os ^int x)
           (.write os ^bytes x)))
        ([^bytes ba ^Integer off ^Integer len]
         @send-begin-message!
         (.write os ba off len))))))

(defn- start-newline-loop!
  "Write a newline every `keepalive-interval-ms` (e.g., one second) until 'they' start writing to the output stream."
  [^OutputStream os {:keys [they-have-started-writing-chan canceled-chan]} {:keys [write-keepalive-newlines?]
                                                                            :or   {write-keepalive-newlines? true}}]
  (a/go-loop []
    (let [timeout-chan (a/timeout keepalive-interval-ms)
          [val port]   (a/alts! [they-have-started-writing-chan timeout-chan] :priority true)]
      ;; TODO - are we sure it's safe to write this newline on a `core.async` thread? I don't see why it would block,
      ;; but it certainly seems possible. But if we write the newline byte async it seems possible that they could
      ;; have started writing before our newline byte thread gets ran. Guess this will have to do for now.
      (when (= port timeout-chan)
        (log/debug (u/format-color 'blue (trs "Response not ready, writing one byte & sleeping...")))
        (when (try
                (when write-keepalive-newlines?
                  (IOUtils/write (str \newline) os Charsets/UTF_8))
                (.flush os)
                true
                (catch EofException _
                  (log/debug (u/format-color 'yellow (trs "connection closed, canceling request")))
                  (a/>!! canceled-chan ::canceled)
                  false))
          (recur))))))

(defn- setup-timeout-and-close!
  "Once `they-are-done-chan` or `canceled-chan` gets a message, or is closed; or if we not finished by the timeout, shut
  everything down and flush/close the output stream."
  [^OutputStream os {:keys [they-are-done-chan canceled-chan], :as chans}]
  (a/go
    (let [timeout-chan (a/timeout absolute-max-keepalive-ms)
          [val port]   (a/alts! [canceled-chan they-are-done-chan timeout-chan])]
      (when (= port timeout-chan)
        ;; let "them" know to cancel anything outstanding as well
        (a/>! canceled-chan ::timed-out))
      ;; go ahead and close all the channels now
      (doseq [chan (vals chans)]
        (a/close! chan))
      ;; we can write the timeout error (if needed) and flush/close the stream on another thread. To avoid tying up
      ;; our precious core.async thread.
      (a/thread
        (if (= port timeout-chan)
          (u/ignore-exceptions
            (write-error-and-close! os (ex-info (trs "Response not finished after waiting {0}. Canceling request."
                                                     (u/format-milliseconds absolute-max-keepalive-ms))
                                                {:status 504})))
          (u/ignore-exceptions
            (.close os)))))))

(defn- streaming-chans []
  ;; this channel will get a message when they start writing to the proxy output stream
  {:they-have-started-writing-chan (a/promise-chan)
   ;; this channel will get a message when the request is canceled.
   :canceled-chan                  (a/promise-chan)
   ;; this channel will get a message when they .close() the proxy output stream
   :they-are-done-chan             (a/promise-chan)})

(defn do-streaming-response
  "Stream results of `f` to output stream, writing newlines as appropiate. You shouldn't use this function directly --
  use `streaming-response` instead -- but I had to make it public because Eastwood isn't able to figure out it's being
  used since the only use is inside the `deftype+` below."
  [^OutputStream os f options]
  (let [chans (streaming-chans)]
    (start-newline-loop! os chans options)
    (setup-timeout-and-close! os chans)
    ;; ok, we can call f now with a proxy-output-stream
    (try
      (f (proxy-output-stream os chans) (:canceled-chan chans))
      (catch Throwable e
        (write-error-and-close! os e)
        (a/>!! (:canceled-chan chans) ::exception)
        (doseq [chan (vals chans)]
          (a/close! chan))))
    ;; result of this fn is ignored
    nil))

(p.types/deftype+ StreamingResponse [f options]
  pretty/PrettyPrintable
  (pretty [_]
    (list '->StreamingResponse f options))

  ;; both sync and async responses
  ring.protocols/StreamableResponseBody
  (write-body-to-stream [_ _ ostream]
    (do-streaming-response ostream f options))

  ;; async responses only
  compojure.response/Sendable
  (send* [this request respond raise]
    (respond (merge (ring.response/response this)
                    {:content-type (:content-type options)
                     :headers      (:headers options)
                     :status       202}))))

(defmacro streaming-response
  "Return an async, streaming, keepalive response.

  Minimal example:

    (streaming-response {:content-type \"applicaton/json; charset=utf-8\"} [os canceled-chan]
      (let [futur (future
                    ;; start writing stuff (possibly async)
                    (write-stuff! os)
                    ;; close the output stream when you are finished
                    (.close os))]
        ;; canceled-chan will get a message if the API request is canceled. Listen to it and kill any async stuff
        (a/go
          (when (nil? (a/<! canceled-chan))
            (future-cancel futur)))
        ;; result of `streaming-response` is ignored
        nil))

  Current options:

  *  `:content-type` -- string content type to return in the results. This is required!
  *  `:headers` -- other headers to include in the API response.
  *  `:write-keepalive-newlines?` -- whether we should write keepalive newlines every `keepalive-interval-ms`. Default
      `true`; you can disable this for formats where it wouldn't work, such as CSV."
  {:style/indent 2}
  [options [os-binding canceled-chan-binding :as bindings] & body]
  {:pre [(= (count bindings) 2)]}
  `(->StreamingResponse (fn [~(vary-meta os-binding assoc :tag 'java.io.OutputStream) ~canceled-chan-binding] ~@body)
                        ~options))
