(ns metabase.async.streaming-response-2
  (:require [clojure.core.async :as a]
            compojure.response
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.async.streaming-response :as streaming-response-1]
            [potemkin.types :as p.types]
            [pretty.core :as pretty]
            [ring.core.protocols :as ring.protocols]
            [ring.util.response :as ring.response])
  (:import [java.io FilterOutputStream OutputStream]
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

;; TODO - do something with `absolute-max-keepalive-ms`

(p.types/deftype+ StreamingResponse [f options]
  pretty/PrettyPrintable
  (pretty [_]
    (list '->StreamingResponse f options))

  ;; both sync and async responses
  ring.protocols/StreamableResponseBody
  (write-body-to-stream [_ _ os]
    (let [{:keys [write-keepalive-newlines? content-type headers]} options
          canceled-chan                                            (a/promise-chan)
          finished-chan                                            (a/promise-chan)]
      (try
        (with-open [os os
                    os (jetty-eof-canceling-output-stream os canceled-chan)
                    os (keepalive-output-stream os write-keepalive-newlines?)]
          (let [futur (future
                        (try
                          (f os canceled-chan)
                          (a/>!! finished-chan ::done)
                          (catch Throwable e
                            (u/ignore-exceptions (streaming-response-1/write-error-and-close! os e))
                            (a/>!! finished-chan ::error))))]
            (a/go
              (let [timeout-chan (a/timeout absolute-max-keepalive-ms)
                    [val port]   (a/alts! )]))
            )
          (a/go
            (a/alts! [(a/thread )

                      (a/canceled-chan)]))
          (.flush os))
        (finally
          (a/close! canceled-chan)
          (a/close! finished-chan)))))

  ;; async responses only
  compojure.response/Sendable
  (send* [this request respond raise]
    (respond (merge (ring.response/response this)
                    {:content-type (:content-type options)
                     :headers      (:headers options)
                     :status       202}))))

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
  {:style/indent 2}
  [options [os-binding canceled-chan-binding :as bindings] & body]
  {:pre [(= (count bindings) 2)]}
  `(->StreamingResponse (fn [~(vary-meta os-binding assoc :tag 'java.io.OutputStream) ~canceled-chan-binding] ~@body)
                        ~options))
