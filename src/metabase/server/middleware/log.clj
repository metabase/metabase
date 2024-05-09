(ns metabase.server.middleware.log
  "Ring middleware for logging API requests/responses."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.async.streaming-response :as streaming-response]
   [metabase.async.streaming-response.thread-pool :as thread-pool]
   [metabase.async.util :as async.u]
   [metabase.db :as mdb]
   [metabase.driver.sql-jdbc.execute.diagnostic
    :as sql-jdbc.execute.diagnostic]
   [metabase.models.setting :refer [defsetting]]
   [metabase.server :as server]
   [metabase.server.request.util :as req.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru trs]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (com.mchange.v2.c3p0 PoolBackedDataSource)
   (metabase.async.streaming_response StreamingResponse)
   (org.eclipse.jetty.util.thread QueuedThreadPool)))

(set! *warn-on-reflection* true)

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

(defn- format-status-info
  [{:keys [async-status]
    {:keys [request-method uri] :or {request-method :XXX}} :request
    {:keys [status]} :response}]
  (str
   (format "%s %s %d" (u/upper-case-en (name request-method)) uri status)
   (when async-status
     (format " [%s: %s]" (trs "ASYNC") async-status))))

(defn- format-performance-info
  [{:keys [start-time call-count-fn _diag-info-fn]
    :or {start-time    (System/nanoTime)
         call-count-fn (constantly -1)}}]
  (let [elapsed-time (u/format-nanoseconds (- (System/nanoTime) start-time))
        db-calls     (call-count-fn)]
    (trs "{0} ({1} DB calls)" elapsed-time db-calls)))

(defn- stats [diag-info-fn]
  (str
   (when-let [^PoolBackedDataSource pool (let [data-source (mdb/data-source)]
                                           (when (instance? PoolBackedDataSource data-source)
                                             data-source))]
     (trs "App DB connections: {0}/{1}"
          (.getNumBusyConnectionsAllUsers pool) (.getNumConnectionsAllUsers pool)))
   " "
   (when-let [^QueuedThreadPool pool (some-> (server/instance) .getThreadPool)]
     (trs "Jetty threads: {0}/{1} ({2} idle, {3} queued)"
          (.getBusyThreads pool)
          (.getMaxThreads pool)
          (.getIdleThreads pool)
          (.getQueueSize pool)))
   " "
   (trs "({0} total active threads)" (Thread/activeCount))
   " "
   (trs "Queries in flight: {0}" (thread-pool/active-thread-count))
   " "
   (trs "({0} queued)" (thread-pool/queued-thread-count))
   (when diag-info-fn
     (when-let [diag-info (not-empty (diag-info-fn))]
       (format
        "; %s DB %s connections: %d/%d (%d threads blocked)"
        (some-> diag-info ::sql-jdbc.execute.diagnostic/driver name)
        (::sql-jdbc.execute.diagnostic/database-id diag-info)
        (::sql-jdbc.execute.diagnostic/active-connections diag-info)
        (::sql-jdbc.execute.diagnostic/total-connections diag-info)
        (::sql-jdbc.execute.diagnostic/threads-waiting diag-info))))))

(defn- format-threads-info [{:keys [diag-info-fn]} {:keys [include-stats?]}]
  (when include-stats?
    (stats diag-info-fn)))

(defn- format-error-info [{{:keys [body]} :response} {:keys [error?]}]
  (when (and error?
             (or (string? body) (coll? body)))
    (str "\n" (u/pprint-to-str body))))

(defn- format-log-context [{:keys [log-context]} _]
  (pr-str log-context))

(defn- format-info [info opts]
  (str/join " " (filter some? [(format-status-info info)
                               (format-performance-info info)
                               (format-threads-info info opts)
                               (format-log-context info opts)
                               (format-error-info info opts)])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Logging the Info                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; `log-info` below takes an info map and actually writes the log message, using the format functions from the section
;; above to create the combined message.

;; `log-options` determines some other formatting options, such as the color of the message. The first logger out of the
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

(defn- log-info
  [{{:keys [status] :or {status -1}} :response, :as info}]
  (try
    (let [{:keys [color log-fn]
           :or {color  :default-color
                log-fn identity}
           :as opts}
          (some #(when ((:status-pred %) status) %)
                log-options)]
      (log-fn (u/format-color color (format-info info opts))))
    (catch Throwable e
      (log/error e "Error logging API request"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Async Logging                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions call `log-info` when appropriate -- right away for non-core.async-channel responses, or after the
;; channel closes for core.async channels.

(defn- log-core-async-response
  "For async responses that return a `core.async` channel, wait for the channel to return a response before logging the
  API request info."
  [{{chan :body, :as _response} :response, :as info}]
  {:pre [(async.u/promise-chan? chan)]}
  ;; [async] wait for the pipe to close the canceled/finished channel and log the API response
  (a/go
    (let [result (a/<! chan)]
      (log-info (assoc info :async-status (if (nil? result) "canceled" "completed"))))))

(defn- log-streaming-response [{{streaming-response :body, :as _response} :response, :as info}]
  ;; [async] wait for the streaming response to be canceled/finished channel and log the API response
  (let [finished-chan (streaming-response/finished-chan streaming-response)]
    (a/go
      (let [result (a/<! finished-chan)]
        (log-info (assoc info :async-status (name result)))))))

(defn- logged-response
  "Log an API response. Returns resonse, possibly modified (i.e., core.async channels will be wrapped); this value
  should be passed to the normal `respond` function."
  [{{:keys [body], :as response} :response, :as info}]
  (condp instance? body
    ManyToManyChannel (log-core-async-response info)
    StreamingResponse (log-streaming-response info)
    (log-info info))
  response)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Actual middleware. Determines whether request should be logged, and, if so, creates the info dictionary and hands
;; off to functions above.

(defsetting health-check-logging-enabled
  (deferred-tru "Whether to log health check requests from session middleware.")
  :type       :boolean
  :default    true
  :visibility :internal
  :export?    false)

(defn- logging-disabled-uris
  "The set of URIs that should not be logged."
  []
  (cond-> #{"/api/util/logs"}
    (not (health-check-logging-enabled)) (conj "/api/health")))

(defn- should-log-request? [{:keys [uri], :as request}]
  ;; don't log calls to /health or /util/logs because they clutter up the logs (especially the window in admin) with
  ;; useless lines
  (and (req.util/api-call? request)
       (not ((logging-disabled-uris) uri))))

(defn log-api-call
  "Logs info about request such as status code, number of DB calls, and time taken to complete."
  [handler]
  (fn [request respond raise]
    (if-not (should-log-request? request)
      ;; non-API call or health or logs call, don't log it
      (handler request respond raise)
      ;; API call, log info about it
      (t2/with-call-count [call-count-fn]
        (sql-jdbc.execute.diagnostic/capturing-diagnostic-info [diag-info-fn]
          (let [info           {:request       request
                                :start-time    (System/nanoTime)
                                :call-count-fn call-count-fn
                                :diag-info-fn  diag-info-fn
                                :log-context   {:metabase-user-id api/*current-user-id*}}
                response->info (fn [response]
                                 (assoc info :response response))
                respond        (comp respond logged-response response->info)]
            (handler request respond raise)))))))
