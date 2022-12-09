(ns ^{:deprecated "0.35.0"}
 metabase.async.api-response
  "Handle ring response maps that contain a core.async chan in the :body key:

    {:body (a/chan)}

  and send strings (presumibly newlines) as heartbeats to the client until the real results (a seq) is received, then
  stream that to the client.

  This namespace is deprecated in favor of [[metabase.async.streaming-response]]."
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.tools.logging :as log]
   [compojure.response :refer [Sendable]]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [ring.core.protocols :as ring.protocols]
   [ring.util.response :as response])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (java.io OutputStream)
   (java.util.concurrent TimeoutException)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

;;; these are dynamic mostly to make them rebindable in tests.

(def ^:private ^:dynamic *keepalive-interval-ms*
  "Interval between sending newline characters to keep Heroku from terminating requests like queries that take a long
  time to complete."
  1000)

(def ^:private ^:dynamic *absolute-max-keepalive-ms*
  "Absolute maximum amount of time to wait for a response to return results, instead of keeping the connection open
  forever. Normally we'll eventually give up when a connection is closed, but if someone keeps the connection open
  forever, or if there's a bug in the API code (and `respond` is never called, or a value is never written to the
  channel it returns) give up after 4 hours."
  (u/hours->ms 4))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                  Writing Results of Async Keep-alive Channel                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- write-keepalive-character!
  "Write a keepalive newline to `out`. Returns true if the byte was written successfully, or false if not, usually
  because the underlying output stream/HTTP connection is already closed."
  [^OutputStream os]
  (try
    ;; a newline padding character as it's harmless and will allow us to check if the client is connected. If sending
    ;; this character fails because the connection is closed, the chan will then close. Newlines are no-ops when
    ;; reading JSON which this depends upon.
    (.write os (byte \newline))
    (.flush os)
    true
    (catch EofException _e
      (log/debug (u/format-color 'yellow (trs "connection closed, canceling request")))
      false)
    (catch java.io.IOException _
      (log/debug (u/format-color 'yellow (trs "connection closed, canceling request")))
      false)
    (catch Throwable e
      (log/error e (trs "Unexpected error writing keepalive characters"))
      false)))

(defn- write-response-and-close!
  "Write `response` to the `os`, and close the os so Ring knows the response is finished."
  [response ^OutputStream os]
  (try
    (with-open [writer (io/writer os)]
      (cond
        ;; An error has occurred, let the user know
        (instance? Throwable response)
        (json/generate-stream (let [{:keys [body status]
                                     :or   {status 500}} (mw.exceptions/api-exception-response response)]
                                (if (map? body)
                                  (assoc body :_status status)
                                  {:message body :_status status}))
                              writer)

        ;; We've recevied the response, write it to the os and we're done
        (seqable? response)
        (json/generate-stream response writer)

        :else
        (log/error (trs "Unexpected output in async API response") (class os))))
    (finally
      (.close os))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Async Keep-alive Channel                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- write-timeout-error-and-close!
  "Write a timeout error to the output stream and close it."
  [os]
  (log/debugf "Async API response timed out after %d ms. Closing input channel and os." *absolute-max-keepalive-ms*)
  (write-response-and-close! (TimeoutException. (trs "No response after waiting {0}. Canceling request."
                                                     (u/format-milliseconds *absolute-max-keepalive-ms*)))
                             os))

(defn- keepalive-loop-handle-timeout!
  "Returns true if it wrote the keepalive byte succesfully and the loop should keep looping."
  [os start-time-ms]
  (let [elapsed-time-ms                  (- (System/currentTimeMillis) start-time-ms)
        exceeded-absolute-max-keepalive? (> elapsed-time-ms *absolute-max-keepalive-ms*)]
    (if exceeded-absolute-max-keepalive?
      ;; timed out waiting for response
      (do
        (write-timeout-error-and-close! os)
        false)
      ;; otherwise attempt to write the keepalive byte
      (do
        (log/debug (u/format-color 'blue "Response not ready, writing one byte & sleeping..."))
        (let [wrote-keepalive-character? (write-keepalive-character! os)]
          (if wrote-keepalive-character?
            (log/debug "Wrote keepalive byte successfully")
            (log/debug "Connection closed, canceling keepalive request."))
          wrote-keepalive-character?)))))

(defn- keepalive-loop-write-input-chan-response!
  [response os]
  (if (nil? response)
    ;; if the input channel was closed before we received the response, write an error and then finish up.
    (do
      (log/error (trs "Input channel unexpectedly closed."))
      (write-response-and-close! (InterruptedException. (trs "Input channel unexpectedly closed."))
                                 os))
    ;; otherwise we have a valid response and it's time to write it and close everything
    (do
      ;; write the response on a separate thread to avoid tying up precious core.async threads
      (a/thread
        (write-response-and-close! response os))
      (log/debug (u/format-color 'blue "Async response finished, closing channels.")))))

(defn- start-async-keepalive-loop!
  "Starts a go-loop that will write `::keepalive` messages to `os` every second until `input-chan` either produces a
  response or is closed. If `os` is closed (because there's no longer anywhere to write to -- the connection was
  canceled), closes `input-chan`; this can and is used by producers such as the async QP to cancel whatever they're
  doing."
  [input-chan ^OutputStream os]
  (let [start-time-ms (System/currentTimeMillis)]
    ;; Start the async loop to wait for the response/write messages to the output
    (a/go-loop []
      ;; check whether input-chan is closed or has produced a value, or time out
      ;; after [[*keepalive-interval-ms*]] (default 1 second)
      (let [timeout-chan                (a/timeout *keepalive-interval-ms*)
            [response first-to-respond] (a/alts! [input-chan timeout-chan])]
        (log/debugf "Async keepalive loop got response from %s" (if (= first-to-respond input-chan) 'input-chan 'timeout-chan))
        (condp = first-to-respond
          ;; Write keepalive byte if appropriate. [[keepalive-loop-handle-timeout!]] returns true if a byte was written
          ;; and we should recur, or false if the byte was not written and it's time to call it a day
          timeout-chan
          (if (keepalive-loop-handle-timeout! os start-time-ms)
            (recur)
            ;; if writing the byte failed because we ran into an EoF or IO Exception because the connection was closed,
            ;; close the `input-chan` as well. Some endpoints are smart enough to cancel themselves when this
            ;; occurs. (Not sure if this is actually true.)
            (a/close! input-chan))

          ;; response came from input chan: write response and then make sure input-chan is closed (should already be
          ;; closed, but just to be safe)
          input-chan
          (do
            (keepalive-loop-write-input-chan-response! response os)
            (a/close! input-chan)
            ;; go ahead and close the timeout channel as well. It doesn't seem to hurt anything if we don't close it but
            ;; let's not waste precious core.async resources firing things that we are just going to ignore
            (a/close! timeout-chan)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                    Telling Ring & Compojure how to handle core.async channel API responses                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Synchronous Compojure endpoint (e.g. `defendpoint`) responses go directly to here. Async endpoint
;; (`defendpoint-async`) responses go to Sendable and then to here. So technically this affects both sync & async.

(extend-protocol ring.protocols/StreamableResponseBody
  ManyToManyChannel
  (write-body-to-stream [chan _response ^OutputStream os]
    (log/debug (u/format-color 'green "starting streaming response"))
    (start-async-keepalive-loop! chan os))

  ;; java.lang.Double, java.lang.Long, and java.lang.Boolean will be given a Content-Type of "application/json; charset=utf-8"
  ;; so they should be strings, and will be parsed into their respective values.
  java.lang.Double
  (write-body-to-stream [num response output-stream]
    (ring.protocols/write-body-to-stream (str num) response output-stream))

  java.lang.Long
  (write-body-to-stream [num response output-stream]
    (ring.protocols/write-body-to-stream (str num) response output-stream))

  java.lang.Boolean
  (write-body-to-stream [bool response output-stream]
    (ring.protocols/write-body-to-stream (str bool) response output-stream))

  clojure.lang.Keyword
  (write-body-to-stream [kkey response output-stream]
    (ring.protocols/write-body-to-stream
     (if-let  [key-ns (namespace kkey)]
       (str key-ns "/" (name kkey))
       (name kkey))
     response output-stream)))

;; `defendpoint-async` responses
(extend-protocol Sendable
  ManyToManyChannel
  (send* [input-chan _ respond _]
    (respond (assoc (response/response input-chan)
                    :content-type "application/json; charset=utf-8"
                    :status 202))))

;; everthing in this namespace is deprecated!
(doseq [[_symb varr] (ns-interns *ns*)]
  (alter-meta! varr assoc :deprecated "0.35.0"))
