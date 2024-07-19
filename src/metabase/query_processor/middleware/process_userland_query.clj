(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process). These include things like saving QueryExecutions and
  adding query ViewLogs, storing exceptions and formatting the results.

  ViewLog recording is triggered indirectly by the call to [[events/publish-event!]] with the `:event/card-query`
  event -- see [[metabase.events.view-log]]."
  (:require
   [java-time.api :as t]
   [metabase.events :as events]
   #_
   [metabase.lib.core :as lib]
   #_
   [metabase.models.field-usage :as field-usage]
   [metabase.models.query :as query]
   [metabase.models.query-execution
    :as query-execution
    :refer [QueryExecution]]
   [metabase.query-processor.schema :as qp.schema]
   #_
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.grouper :as grouper]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
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

(def ^:private field-usage-interval-seconds 20)

(defonce ^:private
  field-usages-queue
  (delay (grouper/start!
          (fn [field-usages]
            (try
              (t2/insert! :model/FieldUsage field-usages)
              (catch Throwable e
                (log/error e "Error saving field usages"))))
          :capacity 500
          :interval (* field-usage-interval-seconds 1000))))

;; TODO - I'm not sure whether this should happen async as is currently the case, or should happen synchronously e.g.
;; in the completing arity of the rf
;;
;; Async seems like it makes sense from a performance standpoint, but should we have some sort of shared threadpool
;; for other places where we would want to do async saves (such as results-metadata for Cards?)
(defn- save-execution-metadata!*
  "Save a `QueryExecution` and update the average execution time for the corresponding `Query`."
  [{query :json_query, query-hash :hash, running-time :running_time, context :context :as query-execution} field-usages]
  (when-not (:cache_hit query-execution)
    (query/save-query-and-update-average-execution-time! query query-hash running-time))
  (if-not context
    (log/warn "Cannot save QueryExecution, missing :context")
    (let [qe-id (t2/insert-returning-pk! QueryExecution (dissoc query-execution :json_query))]
      (when (seq field-usages)
        (let [queue @field-usages-queue]
          (doseq [field-usage field-usages]
            (grouper/submit! queue (assoc field-usage :query_execution_id qe-id))))))))

(defn- save-execution-metadata!
  "Save a `QueryExecution` row containing `execution-info`. Done asynchronously when a query is finished."
  [execution-info field-usages]
  (qp.util/with-execute-async
    ;; 1. Asynchronously save QueryExecution, update query average execution time etc. using the Agent/pooledExecutor
    ;;    pool, which is a fixed pool of size `nthreads + 2`. This way we don't spin up a ton of threads doing unimportant
    ;;    background query execution saving (as `future` would do, which uses an unbounded thread pool by default)
    ;;
    ;; 2. This is on purpose! By *not* using `bound-fn` or `future`, any dynamic variables in play when the task is
    ;;    submitted, such as `db/*connection*`, won't be in play when the task is actually executed. That way we won't
    ;;    attempt to use closed DB connections
    (fn []
      (let [execution-info (add-running-time execution-info)]
        (log/trace "Saving QueryExecution info")
        (try
          (save-execution-metadata!* execution-info field-usages)
          (catch Throwable e
            (log/error e "Error saving query execution info")))))))

(defn- save-successful-execution-metadata! [cache-details is-sandboxed? query-execution result-rows field-usages]
  (let [qe-map (assoc query-execution
                      :cache_hit    (boolean (:cached cache-details))
                      :cache_hash   (:hash cache-details)
                      :result_rows  result-rows
                      :is_sandboxed (boolean is-sandboxed?))]
    (save-execution-metadata! qe-map field-usages)))

(defn- save-failed-query-execution! [query-execution message]
  (try
    (save-execution-metadata! (assoc query-execution :error (str message)) nil)
    (catch Throwable e
      (log/errorf e "Unexpected error saving failed query execution: %s" (ex-message e)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- success-response [{query-hash :hash, :as query-execution} {cache :cache/details :as result}]
  (merge
   (-> query-execution
       add-running-time
       (dissoc :error :hash :executor_id :action_id :is_sandboxed :card_id :dashboard_id :pulse_id :result_rows :native))
   (dissoc result :cache/details)
   {:cached                 (when (:cached cache) (:updated_at cache))
    :status                 :completed
    :average_execution_time (when (:cached cache)
                              (query/average-execution-time-ms query-hash))}))

(defn- add-and-save-execution-metadata-xform! [execution-info field-usages rf]
  {:pre [(fn? rf)]}
  ;; previously we did nothing for cached results, now we have `cache_hit?` column
  (let [row-count (volatile! 0)]
    (fn execution-info-rf*
      ([]
       (rf))

      ([acc]
       ;; We don't actually have a guarantee that it's from a card just because it's userland
       (when (integer? (:card_id execution-info))
         (events/publish-event! :event/card-query {:user-id (:executor_id execution-info)
                                                   :card-id (:card_id execution-info)
                                                   :context (:context execution-info)}))
       (save-successful-execution-metadata! (:cache/details acc) (get-in acc [:data :is_sandboxed]) execution-info @row-count field-usages)
       (rf (if (map? acc)
             (success-response execution-info acc)
             acc)))

      ([result row]
       (vswap! row-count inc)
       (rf result row)))))

(defn- query-execution-info
  "Return the info for the QueryExecution entry for this `query`."
  {:arglists '([query])}
  [{{:keys       [executed-by query-hash context action-id card-id dashboard-id pulse-id]
     :pivot/keys [original-query]} :info
    database-id                    :database
    query-type                     :type
    :as                            query}]
  {:pre [(bytes? query-hash)]}
  (let [json-query (if original-query
                     (-> original-query
                         (dissoc :info)
                         (assoc :was-pivot true))
                     (cond-> (dissoc query :info)
                       (empty? (:parameters query)) (dissoc :parameters)))]
    {:database_id       database-id
     :executor_id       executed-by
     :action_id         action-id
     :card_id           card-id
     :dashboard_id      dashboard-id
     :pulse_id          pulse-id
     :context           context
     :hash              query-hash
     :native            (= (keyword query-type) :native)
     :json_query        json-query
     :started_at        (t/zoned-date-time)
     :running_time      0
     :result_rows       0
     :start_time_millis (System/currentTimeMillis)}))

(mu/defn process-userland-query-middleware :- ::qp.schema/qp
  "Around middleware.

  Userland queries only:

  1. Record a `QueryExecution` entry in the application database when this query is finished running

  2. Record a ViewLog entry when running a query for a Card

  3. Add extra info like `running_time` and `started_at` to the results"
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::qp.schema/query
          rff   :- ::qp.schema/rff]
    (if-not (qp.util/userland-query? query)
      (qp query rff)
      (let [query          (assoc-in query [:info :query-hash] (qp.util/query-hash query))
            execution-info (query-execution-info query)]
        (letfn [(rff* [metadata]
                  (let [#_preprocessed-query #_(:preprocessed_query metadata)
                        ;; we only need the preprocessed query to find field usages, so make sure we don't return it
                        result             (rff (dissoc metadata :preprocessed_query))
                        ;; skip internal queries as it use honeysql, not mbql
                        ;; temporarily disabled because it impacts query performance
                        #_field-usages       #_(when-not (qp.util/internal-query? query)
                                                (field-usage/pmbql->field-usages
                                                 (lib/query (qp.store/metadata-provider) preprocessed-query)))]
                    (add-and-save-execution-metadata-xform! execution-info #_field-usages nil result)))]
          (try
            (qp query rff*)
            (catch Throwable e
              (save-failed-query-execution!
               execution-info
               (or
                (some-> e ex-cause ex-message)
                (ex-message e)))
              (throw (ex-info (ex-message e)
                              {:query-execution execution-info}
                              e)))))))))
