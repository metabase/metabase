(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process).
  These include things like saving QueryExecutions and adding query ViewLogs, storing exceptions and formatting the results."
  (:require
   [java-time.api :as t]
   [metabase.events :as events]
   [metabase.models.query :as query]
   [metabase.models.query-execution
    :as query-execution
    :refer [QueryExecution]]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
(defn- save-query-execution!*
  "Save a `QueryExecution` and update the average execution time for the corresponding `Query`."
  [{query :json_query, query-hash :hash, running-time :running_time, context :context :as query-execution}]
  (when-not (:cache_hit query-execution)
    (query/save-query-and-update-average-execution-time! query query-hash running-time))
  (if-not context
    (log/warn (trs "Cannot save QueryExecution, missing :context"))
    (t2/insert! QueryExecution (dissoc query-execution :json_query))))

(defn- save-query-execution!
  "Save a `QueryExecution` row containing `execution-info`. Done asynchronously when a query is finished."
  [execution-info]
  (let [execution-info (add-running-time execution-info)]
    ;; 1. Asynchronously save QueryExecution, update query average execution time etc. using the Agent/pooledExecutor
    ;;    pool, which is a fixed pool of size `nthreads + 2`. This way we don't spin up a ton of threads doing unimportant
    ;;    background query execution saving (as `future` would do, which uses an unbounded thread pool by default)
    ;;
    ;; 2. This is on purpose! By *not* using `bound-fn` or `future`, any dynamic variables in play when the task is
    ;;    submitted, such as `db/*connection*`, won't be in play when the task is actually executed. That way we won't
    ;;    attempt to use closed DB connections
    (.submit clojure.lang.Agent/pooledExecutor ^Runnable (fn []
                                                           (log/trace "Saving QueryExecution info")
                                                           (try
                                                             (save-query-execution!* execution-info)
                                                             (catch Throwable e
                                                               (log/error e (trs "Error saving query execution info"))))))))

(defn- save-successful-query-execution! [cache-details is_sandboxed? query-execution result-rows]
  (let [qe-map (assoc query-execution
                      :cache_hit    (boolean (:cached cache-details))
                      :cache_hash   (:hash cache-details)
                      :result_rows  result-rows
                      :is_sandboxed (boolean is_sandboxed?))]
    (save-query-execution! qe-map)))

(defn- save-failed-query-execution! [query-execution message]
  (save-query-execution! (assoc query-execution :error (str message))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- success-response [{query-hash :hash, :as query-execution} {cache :cache/details :as result}]
  (merge
   (-> query-execution
       add-running-time
       (dissoc :error :hash :executor_id :action_id :is_sandboxed :card_id :dashboard_id :pulse_id :result_rows :native))
   (dissoc result :cache/details)
   {:cached                 (boolean (:cached cache))
    :status                 :completed
    :average_execution_time (when (:cached cache)
                              (query/average-execution-time-ms query-hash))}))

(defn- add-and-save-execution-info-xform! [execution-info rf]
  {:pre [(fn? rf)]}
  ;; previously we did nothing for cached results, now we have `cache_hit?` column
  (let [row-count (volatile! 0)]
    (fn execution-info-rf*
      ([]
       (rf))

      ([acc]
       ;; We don't actually have a guarantee that it's from a card just because it's userland
       (when (integer? (:card_id execution-info))
         (events/publish-event! :event/card-query {:user-id      (:executor_id execution-info)
                                                   :card-id      (:card_id execution-info)
                                                   :context      (:context execution-info)}))
       (save-successful-query-execution! (:cache/details acc) (get-in acc [:data :is_sandboxed]) execution-info @row-count)
       (rf (if (map? acc)
             (success-response execution-info acc)
             acc)))

      ([result row]
       (vswap! row-count inc)
       (rf result row)))))

(defn- query-execution-info
  "Return the info for the QueryExecution entry for this `query`."
  {:arglists '([query])}
  [{{:keys [executed-by query-hash context action-id card-id dashboard-id pulse-id]} :info
    database-id                                                                      :database
    query-type                                                                       :type
    :as                                                                              query}]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  {:database_id       database-id
   :executor_id       executed-by
   :action_id         action-id
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
    (let [query          (assoc-in query [:info :query-hash] (qp.util/query-hash query))
          execution-info (query-execution-info query)]
      (letfn [(rff* [metadata]
                (add-and-save-execution-info-xform! execution-info (rff metadata)))
              (raisef* [^Throwable e context]
                (save-failed-query-execution!
                  execution-info
                  (or
                    (some-> e (.getCause) (.getMessage))
                    (.getMessage e)))
                (raisef (ex-info (.getMessage e)
                          {:query-execution execution-info}
                          e)
                        context))]
        (try
          (qp query rff* (assoc context :raisef raisef*))
          (catch Throwable e
            (raisef* e context)))))))
