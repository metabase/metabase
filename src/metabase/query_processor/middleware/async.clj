(ns metabase.query-processor.middleware.async
  "Middleware for implementing async QP behavior."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.async.util :as async.u]
            [metabase.config :as config]
            [metabase.util
             [date :as du]
             [i18n :refer [trs tru]]])
  (:import java.util.concurrent.TimeoutException))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  async->sync                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn async->sync
  "Async-style (4-arg) middleware that wraps the synchronous (1-arg) portion of the QP middleware."
  [qp]
  (fn [query respond raise canceled-chan]
    (if (a/poll! canceled-chan)
      (log/debug (trs "Request already canceled, will not run synchronous QP code."))
      (try
        (some-> (qp query) respond)
        (catch Throwable e
          (raise e))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  async-setup                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- respond-fn [out-chan canceled-chan]
  (fn [result]
    (try
      ;; out-chan might already be closed if query was canceled. NBD if that's the case
      (a/>!! out-chan (if (nil? result)
                        (Exception. (trs "Unexpectedly got `nil` Query Processor response."))
                        result))
      (finally
        (a/close! out-chan)))))

(defn- raise-fn [out-chan respond]
  (fn [e]
    (if (instance? InterruptedException e)
      (do
        (log/debug (trs "Got InterruptedException. Canceling query."))
        (a/close! out-chan))
      (do
        (log/warn e (trs "Unhandled exception, expected `catch-exceptions` middleware to handle it."))
        (respond e)))))

(def ^:private in-flight* (atom 0))

(defn in-flight
  "Return the number of queries currently in flight."
  []
  @in-flight*)

(defn- async-args []
  (let [out-chan      (a/promise-chan)
        canceled-chan (async.u/promise-canceled-chan out-chan)
        respond       (respond-fn out-chan canceled-chan)
        raise         (raise-fn out-chan respond)]
    (swap! in-flight* inc)
    (a/go
      (a/<! canceled-chan)
      (swap! in-flight* dec))
    {:out-chan out-chan, :canceled-chan canceled-chan, :respond respond, :raise raise}))

(def ^:private query-timeout-ms
  "Maximum amount of time to wait for a running query to complete before throwing an Exception."
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  (cond
    config/is-prod? (* 20 60 1000)  ; twenty minutes
    config/is-test? (* 30 1000)     ; 30 seconds
    config/is-dev?  (* 5 60 1000))) ; 5 minutes

(defn- wait-for-result [out-chan]
  (let [[result port] (a/alts!! [out-chan (a/timeout query-timeout-ms)])]
    (cond
      (instance? Throwable result)
      (throw result)

      (not= port out-chan)
      (do
        (a/close! out-chan)
        (throw (TimeoutException. (tru "Query timed out after %s" (du/format-milliseconds query-timeout-ms)))))

      :else
      result)))

(defn async-setup
  "Middleware that creates the output/canceled channels for the asynchronous (4-arg) QP middleware and runs it.

  Our 4-arg middleware follows the same pattern as async 3-arg Ring middleware, with the addition of fourth
  `canceled-chan` arg; this is a core.async channel that can be listened to to implement special query cancelation
  behavior, such as canceling JDBC queries. If the output channel is closed before the query completes (i.e., API
  request is canceled) this channel will receive a message; otherwise it will close whenever the output channel
  closes."
  [qp]
  (fn [{:keys [async?], :as query}]
    (let [{:keys [out-chan respond raise canceled-chan]} (async-args)]
      (try
        (qp query respond raise canceled-chan)
        ;; if query is `async?` return the output channel; otherwise block until output channel returns a result
        (if async?
          out-chan
          (wait-for-result out-chan))
        (catch Throwable e
          (raise e))))))
