(ns metabase.async.api-response-3
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            compojure.response
            [metabase.async.util :as async.u]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [ring.core.protocols :as ring.protocols]
            [ring.util.response :as ring.response])
  (:import java.io.Writer
           org.eclipse.jetty.io.EofException))

(def ^:private keepalive-interval-ms
  "Interval between sending newline characters to keep Heroku from terminating requests like queries that take a long
  time to complete."
  (u/seconds->ms 1))

(def ^:private absolute-max-keepalive-ms
  "Absolute maximum amount of time to wait for a response to return results, instead of keeping the connection open
  forever. Normally we'll eventually give up when a connection is closed, but if someone keeps the connection open
  forever, or if there's a bug in the API code (and `respond` is never called, or a value is never written to the
  channel it returns) give up after 4 hours."
  (u/hours->ms 4))

(def ^:private write-results-timeout-ms
  "Maximum amount of time to wait for all results to be written to the Ring response output stream after the query
  result rows begin streaming."
  (u/minutes->ms 10))

(defn- write-error! [^Writer writer ^Throwable e]
  (println "write error:" e) ; NOCOMMIT
  (json/generate-stream {:message (.getMessage e)
                         :_status (or (:status (ex-data e))
                                      500)}
                        writer))

(defn- start-newline-loop! [^Writer writer begin-chan result-chan]
  (a/go-loop []
    (let [[val port] (a/alts! [begin-chan (a/timeout keepalive-interval-ms)] :priority true)]
      (when-not (= port begin-chan)
        (when (try
                (log/debug (u/format-color 'blue (trs "Response not ready, writing one byte & sleeping...")))
                (println (u/format-color 'blue (trs "Response not ready, writing one byte & sleeping..."))) ; NOCOMMIT
                (.write writer (str \newline))
                (.flush writer)
                true
                (catch EofException _
                  (log/debug (u/format-color 'yellow (trs "connection closed, canceling request")))
                  (a/close! result-chan)
                  false))
          (recur))))))

(defn- start-keepalive-loop! [^Writer writer begin-chan result-chan]
  (a/go
    (let [[val port] (a/alts! [result-chan (a/timeout absolute-max-keepalive-ms)])]
      (cond
        (not= port result-chan)
        (write-error! writer (ex-info (trs "No response after waiting {0}. Canceling request."
                                           (u/format-milliseconds absolute-max-keepalive-ms))
                                      {:status 504}))

        (instance? Throwable val)
        (write-error! val (ex-info (trs "No response after waiting {0}. Canceling request."
                                        (u/format-milliseconds absolute-max-keepalive-ms))
                                   {:status 504})))
      (println "GOT FINAL RESULT :" val) ; NOCOMMIT
      (a/close! begin-chan)
      (a/close! result-chan)
      (.close writer))))

(defn keepalive-response** [^Writer writer f]
  (let [begin-chan  (a/promise-chan)
        result-chan (f (fn writerf []
                         (when (a/>!! begin-chan :begin)
                           writer)))]
    (try
      (assert (async.u/promise-chan? result-chan))
      (start-keepalive-loop! writer begin-chan result-chan)
      (start-newline-loop! writer begin-chan result-chan)
      (catch Throwable e
        (a/close! begin-chan)
        (u/ignore-exceptions
          (a/close! result-chan))
        (.close writer)
        (throw e)))
    nil))

(defn keepalive-response* [f]
  {:pre [(fn? f)]}
  (reify
    ;; both sync and async responses
    ring.protocols/StreamableResponseBody
    (write-body-to-stream [_ _ ostream]
      (keepalive-response** (io/writer ostream) f))

    ;; async responses only
    compojure.response/Sendable
    (send* [this request respond raise]
      (respond (merge (ring.response/response this)
                      ;; TODO - should this be configurable?
                      {:content-type "applicaton/json; charset=utf-8"
                       :status       202})))))

(defmacro keepalive-response {:style/indent 1} [[writerf-binding] & body]
  `(keepalive-response* (fn [~writerf-binding]
                          ~@body)))
