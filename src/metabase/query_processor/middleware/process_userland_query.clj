(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process). These include things like saving QueryExecutions and
  adding query ViewLogs, storing exceptions and formatting the results.

  ViewLog recording is triggered indirectly by the call to [[events/publish-event!]] with the `:event/card-query`
  event -- see [[metabase.view-log.events.view-log]]."
  (:refer-clojure :exclude [every? empty? get-in not-empty])
  (:require
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.common :as api]
   [metabase.batch-processing.core :as grouper]
   [metabase.events.core :as events]
   [metabase.lib.computed :as lib.computed]
   [metabase.queries.models.query :as query]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? empty? get-in not-empty]]
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

(def ^:private save-execution-metadata-interval-seconds 20)

(def ^:private save-execution-metadata-queue-capacity 500)

(defn- save-execution-metadata!*
  "Save a batch of `QueryExecution`s and update the average execution times for the corresponding `Query`s."
  [query-executions]
  (tracing/with-span :db-app "db-app.save-query-execution" {}
    (log/tracef "Saving %d QueryExecutions" (count query-executions))
    (when-let [entries (not-empty
                        (for [{query :json_query, query-hash :hash, running-time :running_time, :as query-execution} query-executions
                              :when (and (not (:cache_hit query-execution)) query-hash running-time)]
                          {:query query, :query-hash query-hash, :execution-time-ms running-time}))]
      (try
        (query/save-queries-and-update-average-execution-times! entries)
        (catch Throwable e
          (log/error e "Error updating query average execution times"))))
    (try
      (let [{with-context true, no-context false} (group-by (comp some? :context) query-executions)]
        (when (seq no-context)
          (log/warnf "Cannot save %d QueryExecution(s), missing :context" (count no-context)))
        (when (seq with-context)
          (t2/insert! :model/QueryExecution (map #(dissoc % :json_query) with-context))))
      (catch Throwable e
        (log/error e "Error saving query execution info")))))

(defonce ^:private save-execution-metadata-queue
  (delay (grouper/start!
          #'save-execution-metadata!*
          :capacity save-execution-metadata-queue-capacity
          :interval (* save-execution-metadata-interval-seconds 1000))))

(defn- save-execution-metadata!
  "Save a `QueryExecution` row containing `execution-info`. Saves are batched and written asynchronously, so they may
  not be visible for up to [[save-execution-metadata-interval-seconds]] (and may be lost on non-graceful shutdown);
  this is analytics data, so we consider that an acceptable trade for not paying for an INSERT per query execution.
  Tests can bind [[qp.util/*execute-async?*]] to `false` to save synchronously on the current thread."
  [execution-info]
  (let [;; Capture SDK info and compute the running time now, on the query execution thread: by the time the batch is
        ;; processed the request (and its dynamic bindings and clock) is long gone. `include-sdk-info` also runs in
        ;; the `before-insert` hook as a safety net for any code path that inserts QueryExecution directly (where
        ;; dynamic vars would still be bound).
        execution-info' (add-running-time (analytics.core/include-sdk-info execution-info))]
    (if qp.util/*execute-async?*
      (grouper/submit! @save-execution-metadata-queue execution-info')
      (save-execution-metadata!* [execution-info']))))

(defn- save-successful-execution-metadata! [cache-details is-sandboxed? query-execution result-rows]
  (let [qe-map (assoc query-execution
                      :cache_hit       (boolean (:cached cache-details))
                      :cache_hash      (:hash cache-details)
                      :result_rows     result-rows
                      :is_sandboxed    (boolean is-sandboxed?))]
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
       (dissoc :error :hash :executor_id :action_id :is_sandboxed :is_impersonated :is_db_routed :card_id :dashboard_id :transform_id :lens_id :lens_params :pulse_id :result_rows :native
               :parameterized :parameters))
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
       (save-successful-execution-metadata!
        (:cache/details acc) (get-in acc [:data :is_sandboxed]) execution-info @row-count)
       (rf (if (map? acc)
             (success-response execution-info acc)
             acc)))

      ([result row]
       (vswap! row-count inc)
       (rf result row)))))

(mu/defn- query-execution-info
  "Return the info for the QueryExecution entry for this `query`. Fields that depend on dynamic vars set by
  postprocessing middleware (`is_impersonated`, `is_db_routed`, the routed `database_id`) are NOT computed here —
  they're added later by [[enrich-with-execution-context]] from inside the postprocessing rff, where the bindings
  are still in effect. See PR #71386 — reading those values from the query map at the top of the around middleware
  was a timing bug because pre-processing hadn't yet run."
  {:arglists '([query])}
  [{{:keys       [executed-by query-hash context action-id card-id dashboard-id transform-id lens-id lens-params pulse-id]
     :pivot/keys [original-query]} :info
    database-id                    :database
    query-type                     :type
    parameters                     :parameters
    :as                            query} :- ::qp.schema/any-query]
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
     :tenant_id         (:tenant_id @api/*current-user*)
     :parameters        (when (and (seq parameters) (analytics.settings/analytics-pii-retention-enabled))
                          (json/encode parameters))
     :started_at        (t/zoned-date-time)
     :running_time      0
     :result_rows       0
     :start_time_millis (System/currentTimeMillis)}))

(defn- snapshot-execution-context
  "Reads the postprocessing-middleware dynamic vars (`*impersonation-role*`, `*destination-database-id*`) and
  returns a map of fields to merge into the QueryExecution row."
  []
  (let [destination-db-id (qp.middleware.enterprise/currently-destination-database-id)]
    (cond-> {:is_impersonated (qp.middleware.enterprise/currently-impersonated?)
             :is_db_routed    (qp.middleware.enterprise/currently-db-routed?)}
      destination-db-id (assoc :database_id destination-db-id))))

(def ^:dynamic ^:private *execution-context-ref*
  "Bound to an atom by [[process-userland-query-middleware]] for each userland query.
  [[capture-execution-context-middleware]] writes the snapshotted impersonation/db-routing context here while the
  EE postprocessing `binding` blocks are still on the stack. The around middleware reads it in both the
  success-path rff and the error-path catch — the latter is the whole point, since by the time control reaches
  that catch the EE bindings have already been popped during exception unwind.

  Why a shared mutable ref (atom) instead of just `set!` on the dynamic var: the QP can run on a thread spawned
  by the streaming response (via `bound-fn` / `binding-conveyor-fn`), and conveyed bindings on that thread are a
  snapshot — `set!` would mutate only the spawned thread's frame, not the caller's. A shared mutable cell that
  any thread holding a reference can read/write makes the value flow back to the caller correctly."
  nil)

(defn capture-execution-context-middleware
  "Execute middleware. Snapshots impersonation/db-routing dynamic-var values into [[*execution-context-ref*]] (if
  bound) and forwards. Must be positioned FIRST in the execute middleware list so it runs INNERMOST — i.e. inside
  the `binding` blocks established by `swap-destination-db-middleware` and
  `apply-impersonation-postprocessing-middleware`. See the comment block in
  [[metabase.query-processor.execute/middleware]] explaining the reduce order."
  [qp]
  (fn [query rff]
    (when *execution-context-ref*
      (reset! *execution-context-ref* (snapshot-execution-context)))
    (qp query rff)))

(defn- enrich-with-execution-context
  "Merges the snapshotted execution context (from [[*execution-context-ref*]]) into `execution-info`. Always
  includes `:is_impersonated` and `:is_db_routed` (defaulting to `false`) so the QueryExecution row has a stable
  shape even when the snapshot didn't run (e.g. tests that bypass [[capture-execution-context-middleware]])."
  [execution-info]
  (merge {:is_impersonated false
          :is_db_routed    false}
         execution-info
         (some-> *execution-context-ref* deref)))

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
    (analytics/set-gauge! :metabase.query-processor/computed-weak-map-queries (lib.computed/weak-map-population))
    (if-not (qp.util/userland-query? query)
      (qp query rff)
      ;; The atom is written from inside [[capture-execution-context-middleware]] (positioned in the execute
      ;; chain inside the EE postprocessing bindings) and read in both the success-path rff and the error-path
      ;; catch below. Reading the EE dynamic vars directly from the catch block does NOT work — Clojure pops the
      ;; EE `binding` blocks during stack unwind, so by the time control reaches the catch the values are gone.
      (binding [*execution-context-ref* (atom nil)]
        (let [query          (assoc-in query [:info :query-hash] (qp.util/query-hash query))
              execution-info (query-execution-info query)]
          (letfn [(rff* [metadata]
                    (let [;; we only need the preprocessed query to find field usages, so make sure we don't return it
                          result         (rff (dissoc metadata :preprocessed_query))
                          execution-info (enrich-with-execution-context execution-info)]
                      (add-and-save-execution-metadata-xform! execution-info result)))]
            (try
              (qp query rff*)
              (catch Throwable e
                (let [execution-info (enrich-with-execution-context execution-info)]
                  (save-failed-query-execution!
                   execution-info
                   (or
                    (some-> e ex-cause ex-message)
                    (ex-message e)))
                  (throw (ex-info (ex-message e)
                                  {:query-execution execution-info}
                                  e)))))))))))
