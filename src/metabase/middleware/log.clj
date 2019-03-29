(ns metabase.middleware.log
  "Ring middleware for logging API requests/responses."
  (:require [clojure.tools.logging :as log]
            [metabase
             [server :as server]
             [util :as u]]
            [metabase.middleware.util :as middleware.u]
            [metabase.util
             [date :as du]
             [i18n :refer [trs]]]
            [toucan.db :as db])
  (:import org.eclipse.jetty.util.thread.QueuedThreadPool))

(def ^:private jetty-stats-coll
  (juxt :min-threads :max-threads :busy-threads :idle-threads :queue-size))

(defn- jetty-stats []
  (when-let [jetty-server (server/instance)]
    (let [^QueuedThreadPool pool (.getThreadPool jetty-server)]
      {:min-threads  (.getMinThreads pool)
       :max-threads  (.getMaxThreads pool)
       :busy-threads (.getBusyThreads pool)
       :idle-threads (.getIdleThreads pool)
       :queue-size   (.getQueueSize pool)})))

(defn- log-response [{:keys [uri request-method]} {:keys [status body]} elapsed-time db-call-count]
  (let [log-error #(log/error %)        ; these are macros so we can't pass by value :sad:
        log-debug #(log/debug %)
        log-warn  #(log/warn  %)
        ;; stats? here is to avoid incurring the cost of collecting the Jetty stats and concatenating the extra
        ;; strings when they're just going to be ignored. This is automatically handled by the macro , but is bypassed
        ;; once we wrap it in a function
        [error? color log-fn stats?] (cond
                                       (>= status 500) [true  'red   log-error false]
                                       (=  status 403) [true  'red   log-warn false]
                                       (>= status 400) [true  'red   log-debug false]
                                       :else           [false 'green log-debug true])]
    (log-fn (str (apply u/format-color color
                        (str "%s %s %d (%s) (%d DB calls)."
                             (when stats?
                               " Jetty threads: %s/%s (%s busy, %s idle, %s queued) (%d total active threads)"))
                        (.toUpperCase (name request-method)) uri status elapsed-time db-call-count
                        (when stats?
                          (conj (vec (jetty-stats-coll (jetty-stats)))
                                (Thread/activeCount))))
                 ;; only print body on error so we don't pollute our environment by over-logging
                 (when (and error?
                            (or (string? body) (coll? body)))
                   (str "\n" (u/pprint-to-str body)))))))

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
      (let [start-time (System/nanoTime)]
        (db/with-call-counting [call-count]
          (let [respond (fn [response]
                          (try
                            (log-response request response (du/format-nanoseconds (- (System/nanoTime) start-time)) (call-count))
                            (catch Throwable e
                              (log/error e (trs "Error logging API request"))))
                          (respond response))]
            (handler request respond raise)))))))
