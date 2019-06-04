(ns metabase.middleware.log
  "Ring middleware for logging API requests/responses."
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [server :as server]
             [util :as u]]
            [metabase.async.util :as async.u]
            [metabase.middleware.util :as middleware.u]
            [metabase.query-processor.middleware.async :as qp.middleware.async]
            [metabase.util
             [date :as du]
             [i18n :refer [trs]]]
            [toucan.db :as db])
  (:import clojure.core.async.impl.channels.ManyToManyChannel
           org.eclipse.jetty.util.thread.QueuedThreadPool))

;; To simplify passing large amounts of arguments around most functions in this namespace take an "info" map that
;; looks like
;;
;;     {:request ..., :response ..., :start-time ..., :call-count-fn ...}
;;
;; This map is created in `log-api-call` at the bottom of this namespace.

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Getting & Formatting Request/Response Info                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions take parts of the info map and convert it into formatted strings.

(defn- format-status-info [{:keys [async-status], {:keys [request-method uri]} :request, {:keys [status]} :response}]
  (str
   (format "%s %s %d" (str/upper-case (name request-method)) uri status)
   (when async-status
     (format " [ASYNC: %s]" async-status))))

(defn- format-performance-info [{:keys [start-time call-count-fn]}]
  (let [elapsed-time (du/format-nanoseconds (- (System/nanoTime) start-time))
        db-calls     (call-count-fn)]
    (format "%s (%d DB calls)" elapsed-time db-calls)))

(defn- format-threads-info [{:keys [include-stats?]}]
  (when include-stats?
    (str
     (when-let [^QueuedThreadPool pool (some-> (server/instance) .getThreadPool)]
       (format "Jetty threads: %s/%s (%s idle, %s queued) "
               (.getBusyThreads pool)
               (.getMaxThreads pool)
               (.getIdleThreads pool)
               (.getQueueSize pool)))
     (format "(%d total active threads) " (Thread/activeCount))
     (format "Queries in flight: %d" (qp.middleware.async/in-flight)))))

(defn- format-error-info [{{:keys [body]} :response} {:keys [error?]}]
  (when (and error?
             (or (string? body) (coll? body)))
    (str "\n" (u/pprint-to-str body))))

(defn- format-info [info opts]
  (str/join " " (filter some? [(format-status-info info)
                               (format-performance-info info)
                               (format-threads-info opts)
                               (format-error-info info opts)])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Logging the Info                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; `log-info` below takes an info map and actually writes the log message, using the format functions from the section
;; above to create the combined message.

;; `log-options` determines som other formating options, such as the color of the message. The first logger out of the
;; list below whose `:status-pred` is true will be used to log the API request/response.
;;
;; `include-stats?` here is to avoid incurring the cost of collecting the Jetty stats and concatenating the extra
;; strings when they're just going to be ignored. This is automatically handled by the macro, but is bypassed once we
;; wrap it in a function
(def ^:private log-options
  [{:status-pred    #(>= % 500)
    :error?         true
    :color          'red
    :log-fn         #(log/error %)
    :include-stats? false}
   {:status-pred    #(>= % 403)
    :error?         true
    :color          'red
    :log-fn         #(log/warn  %)
    :include-stats? false}
   {:status-pred    #(>= % 400)
    :error?         true
    :color          'red
    :log-fn         #(log/debug %)
    :include-stats? false}
   {:status-pred    (constantly true)
    :error?         false
    :color          'green
    :log-fn         #(log/debug %)
    :include-stats? true}])

(defn- log-info [{{:keys [status]} :response, :as info}]
  (try
    (let [{:keys [color log-fn], :as opts} (some #(when ((:status-pred %) status)
                                                    %)
                                                 log-options)]
      (log-fn (u/format-color color (format-info info opts))))
    (catch Throwable e
      (log/error e (trs "Error logging API request")))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Async Logging                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions call `log-info` when appropriate -- right away for non-core.async-channel responses, or after the
;; channel closes for core.async channels.

(defn- log-core-async-response
  "For async responses that return a `core.async` channel, wait for the channel to return a response before logging the
  API request info."
  [{{in-chan :body, :as response} :response, :as info}]
  ;; create a new out channel, and pipe response from `in-chan` to `out-chan` using the async util single value pipe.
  ;; The channel returned by that function can be used to listen for either in or out channels to close
  (let [out-chan              (a/chan 1)
        in-or-out-closed-chan (async.u/single-value-pipe in-chan out-chan)]
    ;; [async] wait for the pipe to close the canceled/finished channel and log the API response
    (a/go
      (log-info (assoc info :async-status (if (a/<! in-or-out-closed-chan) "canceled" "completed"))))
    ;; [sync] return updated response with our new body
    (assoc response :body out-chan)))

(defn- logged-response
  "Log an API response. Returns resonse, possibly modified (i.e., core.async channels will be wrapped); this value
  should be passed to the normal `respond` function."
  [{{:keys [body], :as response} :response, :as info}]
  (if (instance? ManyToManyChannel body)
    (log-core-async-response info)
    (do (log-info info)
        response)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Actual middleware. Determines whether request should be logged, and, if so, creates the info dictionary and hands
;; off to functions above.

(defn- should-log-request? [{:keys [uri], :as request}]
  ;; don't log calls to /health or /util/logs because they clutter up the logs (especially the window in admin) with
  ;; useless lines
  (and (middleware.u/api-call? request)
       (not (#{"/api/health" "/api/util/logs"} uri))))

(defn log-api-call
  "Logs info about request such as status code, number of DB calls, and time taken to complete."
  [handler]
  (fn [request respond raise]
    (if-not (should-log-request? request)
      ;; non-API call or health or logs call, don't log it
      (handler request respond raise)
      ;; API call, log info about it
      (db/with-call-counting [call-count-fn]
        (let [info           {:request       request
                              :start-time    (System/nanoTime)
                              :call-count-fn call-count-fn}
              response->info #(assoc info :response %)
              respond        (comp respond logged-response response->info)]
          (handler request respond raise))))))
