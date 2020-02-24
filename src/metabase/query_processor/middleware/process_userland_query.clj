(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process). These include things like saving QueryExecutions and
  formatting the results."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.models
             [query :as query]
             [query-execution :as query-execution :refer [QueryExecution]]]
            [metabase.query-processor.util :as qputil]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import [java.util.concurrent Executors Future]
           org.apache.commons.lang3.concurrent.BasicThreadFactory$Builder))

(defn- add-running-time [{start-time-ms :start_time_millis, :as query-execution}]
  (-> query-execution
      (assoc :running_time (when start-time-ms
                             (- (System/currentTimeMillis) start-time-ms)))
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
  [{query :json_query, query-hash :hash, running-time :running_time, context :context :as query-execution}]
  (query/save-query-and-update-average-execution-time! query query-hash running-time)
  (if-not context
    (log/warn (trs "Cannot save QueryExecution, missing :context"))
    (db/insert! QueryExecution (dissoc query-execution :json_query))))

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
    (fn [] @pool)))

(defn- save-query-execution-async!
  "Asynchronously save a `QueryExecution` row containing `execution-info`. This is done when a query is finished, so
  regardless of whether results streaming is canceled, we want to continue the save; for this reason, we don't call
  `future-cancel` if we get a message to `canceled-chan` the way we normally do."
  ^Future [execution-info]
  (log/trace "Saving QueryExecution info asynchronously")
  (let [execution-info (add-running-time execution-info)
        ^Runnable task (bound-fn []
                         (try
                           (save-query-execution! execution-info)
                           (catch Throwable e
                             (log/error e (trs "Error saving query execution info"))))
                         nil)]
    (.submit (thread-pool) task)))

(defn- save-successful-query-execution-async! [query-execution result-rows]
  (save-query-execution-async! (assoc query-execution :result_rows result-rows)))

(defn- save-failed-query-execution-async! [query-execution message]
  (save-query-execution-async! (assoc query-execution :error (str message))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
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

(defn- add-and-save-execution-info-xform! [{:keys [cached?]} execution-info rf]
  {:pre [(fn? rf)]}
  ;; don't do anything for cached results
  ;; TODO - we should test for this
  (if cached?
    rf
    (let [row-count (volatile! 0)]
      (fn execution-info-rf*
        ([]
         (rf))

        ([acc]
         (save-successful-query-execution-async! execution-info @row-count)
         (rf (if (map? acc)
               (success-response execution-info acc)
               acc)))

        ([result row]
         (vswap! row-count inc)
         (rf result row))))))

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
   :json_query        (cond-> (dissoc query :info)
                        (empty? (:parameters query)) (dissoc :parameters))
   :started_at        (t/zoned-date-time)
   :running_time      0
   :result_rows       0
   :start_time_millis (System/currentTimeMillis)})

(defn process-userland-query
  "Do extra handling 'userland' queries (i.e. ones ran as a result of a user action, e.g. an API call, scheduled Pulse,
  etc.). This includes recording QueryExecution entries and returning the results in an FE-client-friendly format."
  [qp]
  (fn [query rff {:keys [raisef], :as context}]
    (let [query          (assoc-in query [:info :query-hash] (qputil/query-hash query))
          execution-info (query-execution-info query)]
      (letfn [(rff* [metadata]
                (add-and-save-execution-info-xform! metadata execution-info (rff metadata)))
              (raisef* [^Throwable e context]
                (save-failed-query-execution-async! execution-info (.getMessage e))
                (raisef (ex-info (.getMessage e)
                          {:query-execution execution-info}
                          e)
                        context))]
        (try
          (qp query rff* (assoc context :raisef raisef*))
          (catch Throwable e
            (raisef* e context)))))))
