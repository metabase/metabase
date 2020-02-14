(ns metabase.async.streaming-response
  "A special Ring response type that can handle async, streaming results. It writes newlines as 'heartbeats' to the client
  until the real results are ready to begin streaming, then streams those to the client."
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            compojure.response
            [metabase.query-processor.middleware.catch-exceptions :as qp.middleware.exceptions]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [potemkin.types :as p.types]
            [pretty.core :as pretty]
            [ring.core.protocols :as ring.protocols]
            [ring.util.response :as ring.response])
  (:import java.io.Writer
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
  (u/hours->ms 4))

(defn write-error-and-close!
  "Util fn for writing an Exception to the writer provided by `streaming-response`."
  [^Writer writer ^Throwable e]
  ;; TODO - QP middleware code shouldn't really be used in this non-QP-specific context, but it's the nicest
  ;; Exception formatting code we have rn. Move the formatting logic somewhere more generic and have both this and
  ;; the middleware use it.
  (json/generate-stream (merge (qp.middleware.exceptions/exception-response e)
                               {:message (.getMessage e)
                                :_status (get (ex-data e) :status 500)})
                        writer)
  (.close writer))

(defn- proxy-writer
  "Proxy that wraps `writer` and:

  1.  Sends a message to `they-have-started-writing-chan` whenever someone writes something
  2.  Sends a message to `they-are-done-chan` whenever someone closes the writer"
  ^Writer [^Writer writer {:keys [they-have-started-writing-chan they-are-done-chan]}]
  (proxy [Writer] []
    (append
      ([x]
       (a/>!! they-have-started-writing-chan ::wrote-something)
       (if (char? x)
         (.append writer ^Character x)
         (.append writer ^CharSequence x)))
      ([^CharSequence csq ^Integer start ^Integer end]
       (a/>!! they-have-started-writing-chan ::wrote-something)
       (.append writer csq start end)))
    (close []
      (a/>!! they-are-done-chan ::closed)
      (.close writer))
    (flush []
      (.flush writer))
    (write
      ([x]
       (a/>!! they-have-started-writing-chan ::wrote-something)
       (cond
         (int? x)    (.write writer ^Integer x)
         (string? x) (.write writer ^String x)
         :else       (.write writer ^chars x)))
      ([x ^Integer off ^Integer len]
       (a/>!! they-have-started-writing-chan ::wrote-something)
       (if (string? x)
         (.write writer ^String x off len)
         (.write writer ^chars x off len))))))

(defn- start-newline-loop!
  "Write a newline every `keepalive-interval-ms` (e.g., one second) until they start using the writer."
  [^Writer writer {:keys [they-have-started-writing-chan canceled-chan]} {:keys [write-keepalive-newlines?]
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
                  (.write writer (str \newline)))
                (.flush writer)
                true
                (catch EofException _
                  (log/debug (u/format-color 'yellow (trs "connection closed, canceling request")))
                  (a/>!! canceled-chan ::canceled)
                  false))
          (recur))))))

(defn- setup-timeout-and-close!
  "Once `they-are-done-chan` or `canceled-chan` gets a message, or is closed; or if we not finished by the timeout, shut
  everything down and flush/close the writer."
  [^Writer writer {:keys [they-are-done-chan canceled-chan], :as chans}]
  (a/go
    (let [timeout-chan (a/timeout absolute-max-keepalive-ms)
          [val port]   (a/alts! [canceled-chan they-are-done-chan timeout-chan])]
      (when (= port timeout-chan)
        ;; let "them" know to cancel anything outstanding as well
        (a/>! canceled-chan ::timed-out))
      ;; go ahead and close all the channels now
      (doseq [chan (vals chans)]
        (a/close! chan))
      ;; we can write the timeout error (if needed) and flush/close the writer on another thread. To avoid tying up our
      ;; precious core.async thread.
      (a/thread
        (when (= port timeout-chan)
          (u/ignore-exceptions
            (write-error-and-close! writer (ex-info (trs "Response not finished after waiting {0}. Canceling request."
                                               (u/format-milliseconds absolute-max-keepalive-ms))
                                          {:status 504}))))
        (.close writer)))))

(defn- streaming-chans []
  ;; this channel will get a message when they start writing to the proxy writer
  {:they-have-started-writing-chan (a/promise-chan)
   ;; this channel will get a message when the request is canceled.
   :canceled-chan                  (a/promise-chan)
   ;; this channel will get a message when they .close() the proxy writer
   :they-are-done-chan             (a/promise-chan)})

(defn- do-streaming-response* [^Writer writer f options]
  (let [chans (streaming-chans)]
    (start-newline-loop! writer chans options)
    (setup-timeout-and-close! writer chans)
    ;; ok, we can call f now with a proxy-writer
    (try
      (f (proxy-writer writer chans) (:canceled-chan chans))
      (catch Throwable e
        (write-error-and-close! writer e)
        (a/>!! (:canceled-chan chans) ::exception)
        (doseq [chan (vals chans)]
          (a/close! chan))))
    ;; result of this fn is ignored
    nil))

(p.types/defrecord+ StreamingResponse [f options]
  pretty/PrettyPrintable
  (pretty [_]
    (list '->StreamingResponse f))

  ;; both sync and async responses
  ring.protocols/StreamableResponseBody
  (write-body-to-stream [_ _ ostream]
    (do-streaming-response* (io/writer ostream) f options))

  ;; async responses only
  compojure.response/Sendable
  (send* [this request respond raise]
    (respond (merge (ring.response/response this)
                    {:content-type (:content-type options)
                     :status       202}))))

(defmacro streaming-response
  "Return an async, streaming, keepalive response.

  Minimal example:

    (streaming-response {:content-type \"applicaton/json; charset=utf-8\"} [writer canceled-chan]
      (let [futur (future
                    ;; start writing stuff (possibly async)
                    (write-stuff! writer)
                    ;; close the writer when you are finished
                    (.close writer))]
        ;; canceled-chan will get a message if the API request is canceled. Listen to it and kill any async stuff
        (a/go
          (when (nil? (a/<! canceled-chan))
            (future-cancel futur)))
        ;; result of `streaming-response` is ignored
        nil))

  Current options:

  *  `:content-type` -- string content type to return in the results. This is required
  *  `:write-keepalive-newlines?` -- whether we should write keepalive newlines every `keepalive-interval-ms`. Default
      `true`; you can disable this for formats where it wouldn't work, such as CSV."
  {:style/indent 2}
  [options [writer-binding canceled-chan-binding :as bindings] & body]
  {:pre [(= (count bindings) 2)]}
  `(->StreamingResponse (fn [~(vary-meta writer-binding assoc :tag 'java.io.Writer) ~canceled-chan-binding] ~@body)
                        ~options))
