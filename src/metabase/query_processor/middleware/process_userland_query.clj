(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process). These include things like saving QueryExecutions and
  adding query ViewLogs, storing exceptions and formatting the results.

  ViewLog recording is triggered indirectly by the call to [[events/publish-event!]] with the `:event/card-query`
  event -- see [[metabase.view-log.events.view-log]]."
  (:refer-clojure :exclude [every? empty? get-in])
  (:require
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.batch-processing.core :as grouper]
   [metabase.events.core :as events]
   [metabase.lib.computed :as lib.computed]
   [metabase.queries.models.query :as query]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? empty? get-in]]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- add-running-time [{start-time-ms :start_time_millis, :as query-execution}]
  (-> query-execution
      (assoc :running_time (when start-time-ms
                             ;; Consider having `:start_time_nanos` instead, to avoid the pitfalls of system clocks.
                             (u/since-ms-wall-clock start-time-ms)))
      (dissoc :start_time_millis)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Save Query Execution                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------- Batched Query Execution Saves ----------------------------------------
;; QueryExecution inserts and avg execution time updates are batched via grouper to reduce
;; appdb connection pool pressure. Instead of N independent async DB ops per dashboard load,
;; items are buffered and flushed as single multi-row SQL statements.

(defn- batch-insert-query-executions!
  "Batch function for the grouper queue. Receives a seq of query-execution maps and does a single
  multi-row INSERT. Uses raw HoneySQL to bypass per-row toucan hooks (transforms are applied at
  submission time)."
  [execution-infos]
  (when (seq execution-infos)
    (try
      (t2/insert! :model/QueryExecution execution-infos)
      (catch Throwable e
        (log/error e "Error batch-inserting query executions")))))

(defonce ^:private query-execution-queue
  (delay (grouper/start! #'batch-insert-query-executions!
                         :capacity 500
                         :interval 1000)))

(defonce ^:private avg-execution-time-queue
  (delay (grouper/start! #'query/batch-save-query-and-update-average-execution-time!
                         :capacity 500
                         :interval 1000)))

(defn- save-execution-metadata!
  "Save a `QueryExecution` and update average execution time. Items are submitted to grouper queues
  and flushed in batches to reduce connection pool pressure."
  [execution-info]
  (let [execution-info' (-> execution-info
                            analytics/include-sdk-info
                            add-running-time)]
    (when (and (not (:cache_hit execution-info'))
               (:running_time execution-info'))
      (grouper/submit! @avg-execution-time-queue
                       {:query      (:json_query execution-info')
                        :query-hash (:hash execution-info')
                        :running-time (:running_time execution-info')}))
    (if-not (:context execution-info')
      (log/warn "Cannot save QueryExecution, missing :context")
      (grouper/submit! @query-execution-queue
                       (dissoc execution-info' :json_query)))))

(defn- save-successful-execution-metadata! [cache-details is-sandboxed? query-execution result-rows]
  (let [qe-map (assoc query-execution
                      :cache_hit    (boolean (:cached cache-details))
                      :cache_hash   (:hash cache-details)
                      :result_rows  result-rows
                      :is_sandboxed (boolean is-sandboxed?))]
    (save-execution-metadata! qe-map)))

(defn- save-failed-query-execution! [query-execution message]
  (try
    (save-execution-metadata! (assoc query-execution :error (str message)))
    (catch Throwable e
      (log/errorf e "Unexpected error saving failed query execution: %s" (ex-message e)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- success-response [{query-hash :hash, :as query-execution} {cache :cache/details :as result}]
  (merge
   (-> query-execution
       add-running-time
       (dissoc :error :hash :executor_id :action_id :is_sandboxed :card_id :dashboard_id :transform_id :lens_id :lens_params :pulse_id :result_rows :native
               :parameterized))
   (dissoc result :cache/details)
   {:cached                 (when (:cached cache) (:updated_at cache))
    :status                 :completed
    :average_execution_time (when (:cached cache)
                              (query/average-execution-time-ms query-hash))}))

(defn- add-and-save-execution-metadata-xform! [execution-info rf]
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
       (save-successful-execution-metadata! (:cache/details acc) (get-in acc [:data :is_sandboxed]) execution-info @row-count)
       (rf (if (map? acc)
             (success-response execution-info acc)
             acc)))

      ([result row]
       (vswap! row-count inc)
       (rf result row)))))

(mu/defn- query-execution-info
  "Return the info for the QueryExecution entry for this `query`."
  {:arglists '([query])}
  [{{:keys       [executed-by query-hash context action-id card-id dashboard-id transform-id lens-id lens-params pulse-id]
     :pivot/keys [original-query]} :info
    database-id                    :database
    query-type                     :type
    parameters                     :parameters
    destination-database-id        :destination-database/id
    :as                            query} :- ::qp.schema/any-query]
  {:pre [(bytes? query-hash)]}
  (let [json-query (if original-query
                     (-> original-query
                         (dissoc :info)
                         (assoc :was-pivot true))
                     (cond-> (dissoc query :info)
                       (empty? (:parameters query)) (dissoc :parameters)))]
    {:database_id       (or destination-database-id database-id)
     :executor_id       executed-by
     :action_id         action-id
     :card_id           card-id
     :dashboard_id      dashboard-id
     :transform_id      transform-id
     :lens_id           lens-id
     :lens_params       lens-params
     :pulse_id          pulse-id
     :context           context
     :hash              query-hash
     :parameterized     (and (boolean (seq parameters))
                             (every? #(some? (:value %)) parameters))
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

  3. Add extra info like `running_time` and `started_at` to the results

  4. Submit a background job to analyze field usages"
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::qp.schema/any-query
          rff   :- ::qp.schema/rff]
    ;; Update a gauge metric with the present number of queries in the WeakHashMap it maintains.
    ;; This has to live somewhere and while processing each query seems like a natural place.
    (analytics/set! :metabase.query-processor/computed-weak-map-queries (lib.computed/weak-map-population))
    (if-not (qp.util/userland-query? query)
      (qp query rff)
      (let [query          (assoc-in query [:info :query-hash] (qp.util/query-hash query))
            execution-info (query-execution-info query)]
        (letfn [(rff* [metadata]
                  (let [;; we only need the preprocessed query to find field usages, so make sure we don't return it
                        result (rff (dissoc metadata :preprocessed_query))]
                        ;; temporarily disabled because it impacts query performance
                    (add-and-save-execution-metadata-xform! execution-info result)))]
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
