(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process). These include things like saving QueryExecutions and
  formatting the results."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [medley.core :as m]
            [metabase.models
             [query :as query]
             [query-execution :as query-execution :refer [QueryExecution]]]
            [metabase.query-processor.util :as qputil]
            [metabase.util.i18n :refer [trs tru]]
            [toucan.db :as db])
  (:import [java.util.concurrent Executors Future]
           org.apache.commons.lang3.concurrent.BasicThreadFactory$Builder))

(defn- add-running-time [{start-time-ms :start_time_millis, :as query-execution}]
  (-> query-execution
      (assoc :running_time (- (System/currentTimeMillis) start-time-ms))
      (dissoc :start_time_millis)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Save Query Execution                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - I'm not sure whether this should happen async as is currently the case, or should happen synchronously e.g.
;; in the completing arity of the rf
;;
;; Async seems like it makes sense from a performance standpoint, but should we have some sort of shared threadpool
;; for other places where we would want to do async saves (such as results-metadata for Cards?)
(defn- save-query-execution!
  "Save a `QueryExecution` and update the average execution time for the corresponding `Query`."
  [{query :json_query, query-hash :hash, running-time :running_time, :as query-execution}]
  (query/save-query-and-update-average-execution-time! query query-hash running-time)
  (db/insert! QueryExecution (dissoc query-execution :json_query)))

(def ^:private ^Long thread-pool-size 4)

(def ^:private ^{:arglists '(^java.util.concurrent.ExecutorService [])} thread-pool
  "Thread pool for asynchronously saving query executions."
  (let [pool (delay
               (Executors/newFixedThreadPool
                thread-pool-size
                (.build
                 (doto (BasicThreadFactory$Builder.)
                   (.namingPattern "save-query-execution-thread-pool-%d")
                   ;; Daemon threads do not block shutdown of the JVM
                   (.daemon true)
                   ;; Save query executions should be lower priority than other stuff e.g. API responses
                   (.priority Thread/MIN_PRIORITY)))))]
    (fn []
      @pool)))

(defn- save-query-execution-async!
  "Asynchronously save a `QueryExecution` row containing `execution-info`. This is done when a query is finished, so
  regardless of whether results streaming is canceled, we want to continue the save; for this reason, we don't call
  `future-cancel` if we get a message to `canceled-chan` the way we normally do."
  ^Future [execution-info]
  (.submit
   (thread-pool)
   ^Runnable (bound-fn []
               (try
                 (save-query-execution! (add-running-time execution-info))
                 (catch Throwable e
                   (log/error e (trs "Error saving query execution info")))))))

(defn- save-successful-query-execution-async! [query-execution {cached? :cached, result-rows :row_count}]
  ;; only insert a new record into QueryExecution if the results *were not* cached (i.e., only if a Query was
  ;; actually ran)
  (when-not cached?
    (save-query-execution-async! (assoc query-execution :result_rows (or result-rows 0)))))

(defn- save-failed-query-execution-async! [query-execution message]
  (save-query-execution-async! (assoc query-execution :error (str message))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Format Response                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- success-response [{query-hash :hash, :as query-execution} {cached? :cached, :as result}]
  (merge
   (-> query-execution
       add-running-time
       (dissoc :error :hash :executor_id :card_id :dashboard_id :pulse_id :result_rows :native))
   result
   {:status                 :completed
    :average_execution_time (when cached?
                              (query/average-execution-time-ms query-hash))}))

(defn- failure-response [query-execution message result]
  (merge
   (-> query-execution
       add-running-time
       (dissoc :result_rows :hash :executor_id :card_id :dashboard_id :pulse_id :native))
   {:status    :failed
    :error     message
    :row_count 0
    :data      {:rows []
                :cols []}}
   ;; include stacktrace and preprocessed/native stages of the query if available in the response which should
   ;; make debugging queries a bit easier
   (-> (select-keys result [:stacktrace :preprocessed :native :error_type])
       (m/dissoc-in [:preprocessed :info]))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Handle Response                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- succeed [execution-info result]
  (save-successful-query-execution-async! execution-info result)
  (success-response execution-info result))

(defn- fail [execution-info result]
  (let [message (get result :error (tru "Unknown error"))]
    (save-failed-query-execution-async! execution-info message)
    (failure-response execution-info message result)))

(defn- add-and-save-execution-info!
  "Add some keys from `execution-info` to the query `result`. Asynchronously save the execution info as a row in the
  `QueryExecution` table."
  [execution-info result]
  (let [status (when (map? result) (:status result))]
    (case status
      :completed (succeed execution-info result)
      :failed (fail execution-info result)
      (do
        (log/error (trs "Unexpected result from query processor: unexpected status code {0}" (pr-str status)))
        result))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- query-execution-info
  "Return the info for the QueryExecution entry for this `query`."
  {:arglists '([query])}
  [{{:keys [executed-by query-hash context card-id dashboard-id pulse-id]} :info
    database-id                                                            :database
    query-type                                                             :type
    :as                                                                    query}]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  {:database_id       database-id
   :executor_id       executed-by
   :card_id           card-id
   :dashboard_id      dashboard-id
   :pulse_id          pulse-id
   :context           context
   :hash              query-hash
   :native            (= (keyword query-type) :native)
   :json_query        (dissoc query :info)
   :started_at        (t/zoned-date-time)
   :running_time      0
   :result_rows       0
   :start_time_millis (System/currentTimeMillis)})

(defn process-userland-query
  "Do extra handling 'userland' queries (i.e. ones ran as a result of a user action, e.g. an API call, scheduled Pulse,
  etc.). This includes recording QueryExecution entries and returning the results in an FE-client-friendly format."
  [qp]
  (fn [query xformf {:keys [finished-chan], :as chans}]
    (let [query'         (assoc-in query [:info :query-hash] (qputil/query-hash query))
          execution-info (query-execution-info query')
          finished-chan' (a/promise-chan)]
      ;; intercept the final result and transform it with `add-and-save-execution-info!` (save happens asynchronously)
      (a/go
        (when-let [result (a/<! finished-chan')]
          (log/tracef "finished-chan' got %s, transforming and forwarding to finished-chan" (class result))
          (let [result' (try
                          (add-and-save-execution-info! execution-info result)
                          (catch Throwable e
                            (log/error e (trs "Error adding query execution info"))
                            result))]
            (a/>!! finished-chan result'))))
      ;; close `finished-chan'` when `finished-chan` is closed
      (a/go
        (a/<! finished-chan)
        (log/trace "finished-chan done; closing finished-chan'")
        (a/close! finished-chan'))
      (qp query' xformf (assoc chans :finished-chan finished-chan')))))
