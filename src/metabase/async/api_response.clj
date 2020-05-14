(ns ^{:deprecated "0.35.0"} metabase.async.api-response
  "Handle ring response maps that contain a core.async chan in the :body key:

    {:body (a/chan)}

  and send strings (presumibly newlines) as heartbeats to the client until the real results (a seq) is received, then stream
  that to the client.

  This namespace is deprecated in favor of `metabase.async.streaming-response`."
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [compojure.response :refer [Sendable]]
            [metabase.middleware.exceptions :as mw.exceptions]
            [metabase.util :as u]
            [metabase.util.i18n :as ui18n :refer [trs]]
            [ring.core.protocols :as ring.protocols]
            [ring.util.response :as response])
  (:import clojure.core.async.impl.channels.ManyToManyChannel
           [java.io OutputStream Writer]
           java.util.concurrent.TimeoutException
           org.eclipse.jetty.io.EofException))

(def ^:private keepalive-interval-ms
  "Interval between sending newline characters to keep Heroku from terminating requests like queries that take a long
  time to complete."
  ;; 1 second
  (* 1 1000))

(def ^:private absolute-max-keepalive-ms
  "Absolute maximum amount of time to wait for a response to return results, instead of keeping the connection open
  forever. Normally we'll eventually give up when a connection is closed, but if someone keeps the connection open
  forever, or if there's a bug in the API code (and `respond` is never called, or a value is never written to the
  channel it returns) give up after 4 hours."
  ;; 4 hours
  (* 4 60 60 1000))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                  Writing Results of Async Keep-alive Channel                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- write-keepalive-character! [^Writer out]
  (try
    ;; a newline padding character as it's harmless and will allow us to check if the client is connected. If sending
    ;; this character fails because the connection is closed, the chan will then close. Newlines are no-ops when
    ;; reading JSON which this depends upon.
    (.write out (str \newline))
    (.flush out)
    true
    (catch EofException e
      (log/debug (u/format-color 'yellow (trs "connection closed, canceling request")))
      false)
    (catch Throwable e
      (log/error e (trs "Unexpected error writing keepalive characters"))
      false)))

;; `chunkk` named as such to avoid conflict with `clojure.core/chunk`
(defn- write-response-chunk! [chunkk, ^Writer out]
  (cond
    ;; An error has occurred, let the user know
    (instance? Throwable chunkk)
    (json/generate-stream (let [{:keys [body status]
                                 :or   {status 500}} (mw.exceptions/api-exception-response chunkk)]
                            (if (map? body)
                              (assoc body :_status status)
                              {:message body :_status status}))
                          out)

    ;; We've recevied the response, write it to the output stream and we're done
    (seqable? chunkk)
    (json/generate-stream chunkk out)

    :else
    (log/error (trs "Unexpected output in async API response") (class chunkk))))

(defn- write-chan-vals-to-writer!
  "Write whatever val(s) come into `chan` onto the Writer wrapping our OutputStream. Vals should be either
  `::keepalive`, meaning we should write a keepalive newline character to the Writer, or some other value, which is
  the actual response we've been waiting for (at this point we can close both the Writer and the channel)."
  [chan, ^Writer out]
  (a/go-loop [chunkk (a/<! chan)]
    (cond
      ;; keepalive chunkk
      (= chunkk ::keepalive)
      (if (write-keepalive-character! out)
        (recur (a/<! chan))
        (do
          (a/close! chan)
          (.close out)))

      ;; nothing -- `chan` is prematurely closed
      (nil? chunkk)
      (.close out)

      ;; otherwise we got an actual response. Do this on another thread so we don't block our precious core.async
      ;; threads doing potentially long-running I/O
      :else
      (future
        (try
          ;; chunkk *might* be `nil` if the channel already go closed.
          (write-response-chunk! chunkk out)
          (finally
            ;; should already be closed, but just to be safe
            (a/close! chan)
            ;; close the writer so Ring knows the response is finished
            (.close out))))))
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Async Keep-alive Channel                                            |
;;; +----------------------------------------------------------------------------------------------------------------+


(defn- start-async-keepalive-loop!
  "Starts a go-loop that will send `::keepalive` messages to `output-chan` every second until `input-chan` either
  produces a response or one of the two channels is closed. If `output-chan` is closed (because there's no longer
  anywhere to write to -- the connection was canceled), closes `input-chan`; this can and is used by producers such as
  the async QP to cancel whatever they're doing."
  [input-chan output-chan]
  (let [start-time-ms (System/currentTimeMillis)]
    ;; Start the async loop to wait for the response/write messages to the output
    (a/go-loop []
      ;; check whether input-chan is closed or has produced a value, or time out after a second
      (let [[response chan]                  (a/alts! [input-chan (a/timeout keepalive-interval-ms)])
            elapsed-time-ms                  (- (System/currentTimeMillis) start-time-ms)
            exceeded-absolute-max-keepalive? (> elapsed-time-ms absolute-max-keepalive-ms)
            timed-out?                       (not= chan input-chan)
            input-chan-closed?               (and (= chan input-chan)
                                                  (nil? response))
            should-write-keepalive-byte?     (and timed-out? (not exceeded-absolute-max-keepalive?))]
        ;; if we hit a timeout before getting a response but haven't hit the `absolute-max-keepalive-ms` limit then
        ;; attempt to write our byte. Recur if successful
        (if (when should-write-keepalive-byte?
              (log/debug (u/format-color 'blue (trs "Response not ready, writing one byte & sleeping...")))
              (a/>! output-chan ::keepalive))
          (recur)
          ;; otherwise do the appropriate thing & then we're done here
          (try
            (cond
              ;; if we attempted to write a keepalive byte but `>!` returned `nil`, that means output-chan is closed.
              ;; Log a message, and the `finally` block will handle closing everything
              should-write-keepalive-byte?
              (log/debug (trs "Output chan closed, canceling keepalive request."))

              ;; We have a response since it's non-nil, write the results, we're done
              (some? response)
              (do
                ;; BTW if output-chan is closed, it's already too late, nothing else we need to do
                (a/>! output-chan response)
                (log/debug (u/format-color 'blue (trs "Async response finished, closing channels."))))

              ;; Otherwise if we've been waiting longer than `absolute-max-keepalive-ms` it's time to call it quits
              exceeded-absolute-max-keepalive?
              (a/>! output-chan (TimeoutException. (trs "No response after waiting {0}. Canceling request."
                                                        (u/format-milliseconds absolute-max-keepalive-ms))))

              ;; if input-chan was unexpectedly closed log a message to that effect and return an appropriate error
              ;; rather than letting people wait forever
              input-chan-closed?
              (do
                (log/error (trs "Input channel unexpectedly closed."))
                (a/>! output-chan (InterruptedException. (trs "Input channel unexpectedly closed.")))))
            (finally
              (a/close! output-chan)
              (a/close! input-chan))))))))

(defn- async-keepalive-channel
  "Given a core.async channel `input-chan` which will (presumably) eventually receive an asynchronous result, return a
  new channel 'wrapping' the original that will write keepalive bytes until the actual result is obtained."
  [input-chan]
  ;; Output chan only needs to hold on to the last message it got, for example no point in writing multiple `\n`
  ;; characters if the consumer didn't get a chance to consume them, and no point writing `\n` before writing the
  ;; actual response
  (u/prog1 (a/chan (a/sliding-buffer 1))
    (start-async-keepalive-loop! input-chan <>)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                    Telling Ring & Compojure how to handle core.async channel API responses                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Synchronous Compojure endpoint (e.g. `defendpoint`) responses go directly to here. Async endpoint
;; (`defendpoint-async`) responses go to Sendable and then to here. So technically this affects both sync & async.

(extend-protocol ring.protocols/StreamableResponseBody
  ManyToManyChannel
  (write-body-to-stream [chan _ ^OutputStream output-stream]
    (log/debug (u/format-color 'green (trs "starting streaming response")))
    (write-chan-vals-to-writer! (async-keepalive-channel chan) (io/writer output-stream))))

;; `defendpoint-async` responses
(extend-protocol Sendable
  ManyToManyChannel
  (send* [input-chan _ respond _]
    (respond (assoc (response/response input-chan)
                    :content-type "application/json; charset=utf-8"
                    :status 202))))

;; everthing in this namespace is deprecated!
(doseq [[symb varr] (ns-interns *ns*)]
  (alter-meta! varr assoc :deprecated "0.35.0"))
