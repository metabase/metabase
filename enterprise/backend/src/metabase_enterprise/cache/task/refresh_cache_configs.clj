(ns metabase-enterprise.cache.task.refresh-cache-configs
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.cache.strategies :as strategies]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Callable ExecutorService SynchronousQueue ThreadPoolExecutor TimeUnit)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)
   (org.quartz.spi MutableTrigger)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Preemptive Caching ----------------------------------------------------

(defonce ^:private pool
  (delay
    (ThreadPoolExecutor.
     0                     ;; core pool size
     10                    ;; max pool size (upper limit)
     100 TimeUnit/SECONDS  ;; keep-alive time for idle threads
     (SynchronousQueue.)   ;; direct handoff
     (.build
      (doto (BasicThreadFactory$Builder.)
        (.namingPattern "preemptive-caching-thread-pool-%d"))))))

(def ^:dynamic *parameterized-queries-to-rerun-per-card*
  "Number of query variations (e.g. with different parameters) to run for a single cached card."
  10)

(def ^:dynamic *run-cache-refresh-async*
  "Should cache refresh jobs be run asynchronously? Defaults to true, can be set to false for testing."
  true)

(defn- submit-refresh-task-async!
  "Submits a job to the thread pool to run a sequence of queries for a single card or dashboard being refreshed.
  This is best-effort; we try each query once and discard failures."
  [refresh-task-fn]
  (.submit ^ExecutorService @pool ^Callable refresh-task-fn))

(defn discarding-rff
  "Returns a reducing function that discards result rows"
  [metadata]
  (fn discarding-rf
    ([] {:data metadata})
    ([result] result)
    ([result _row] result)))

(defn- refresh-task
  "Returns a function that serially reruns queries based on `refresh-defs`, and discards the results. Each refresh
  definition contains a card-id, an optional dashboard-id, and a list of queries to rerun."
  [refresh-defs]
  (fn []
    (let [card-ids    (into #{} (map :card-id refresh-defs))
          cards-by-id (t2/select-pk->fn identity :model/Card :id [:in card-ids])]
      (doseq [{:keys [card-id dashboard-id queries]} refresh-defs]
        ;; Annotate the query with its cache strategy in the format expected by the QP
        (let [cache-strategy (strategies/cache-strategy (get cards-by-id card-id) dashboard-id)]
          (doseq [query queries]
            (try
              (qp/process-query
               (qp/userland-query
                (-> query
                    (assoc-in [:middleware :ignore-cached-results?] true)
                    (assoc :cache-strategy cache-strategy))
                {:executed-by  nil
                 :context      :cache-refresh
                 :card-id      card-id
                 :dashboard-id dashboard-id})
               discarding-rff)
              (catch Exception e
                (log/debugf "Error refreshing cache for card %s: %s" card-id (ex-message e))))))))))

(defn- duration-ago
  [{:keys [duration unit]}]
  (t/minus (t/offset-date-time)
           (t/duration duration (keyword unit))))

(defn- duration-queries-to-rerun-honeysql
  "HoneySQL query for selecting query definitions that should be rerun, given a list of :duration cache configs.
  Executed twice, once to find parameterized queries and once to find non-parameterized queries."
  [cache-configs parameterized?]
  (let [queries
        (for [{:keys [model model_id config]} cache-configs]
          (let [rerun-cutoff (duration-ago config)]
            {:nest
             {:select   [[:q.query :query]
                         [:qc.query_hash :cache-hash]
                         [:qe.card_id :card-id]
                         [:qe.dashboard_id :dashboard-id]
                         [[:count :q.query_hash] :count]]
              :from     [[(t2/table-name :model/Query) :q]]
              :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]
                         [(t2/table-name :model/QueryCache) :qc] [:= :qc.query_hash :qe.cache_hash]]
              :where    [:and
                         (case model
                           "question" [:= :qe.card_id model_id]
                           "dashboard" [:= :qe.dashboard_id model_id])
                         [:<= :qc.updated_at rerun-cutoff]
                         ;; This is a safety check so that we don't scan all of query_execution -- if a query
                         ;; has not been executed at all in the last month (including cache hits) we won't bother
                         ;; refreshing it again.
                         [:>= :qe.started_at (duration-ago {:duration 30 :unit "days"})]
                         [:= :qe.error nil]
                         [:= :qe.is_sandboxed false]
                         (if parameterized?
                           [:and
                            [:= :qe.parameterized true]
                             ;; Only rerun a parameterized query if it's had a cache hit within the last caching window
                            [:= :qe.cache_hit true]
                             ;; Don't factor the last cache refresh into whether we should rerun a parameterized query
                            [:not= :qe.context (name :cache-refresh)]]
                           [:= :qe.parameterized false])]
              :group-by [:q.query_hash :q.query :qc.query_hash :qe.card_id :qe.dashboard_id]}}))]
    {:select [:u.query :u.cache-hash :u.card-id :u.dashboard-id :u.count]
     :from   [[{:union queries} :u]]}))

(defn- select-parameterized-queries
  "Given a list of parameterized query definitions from the Query table with additional :count and :card-id keys,
  selects the 10 most common queries for each card ID that we should rerun."
  [parameterized-queries]
  (apply concat
         (-> (group-by :card-id parameterized-queries)
             (update-vals
              (fn [queries]
                (->> queries
                     (sort-by :count >)
                     (take *parameterized-queries-to-rerun-per-card*))))
             vals)))

(defn- duration-queries-to-rerun
  []
  (let [cache-configs (t2/select :model/CacheConfig :strategy :duration :refresh_automatically true)]
    (when (seq cache-configs)
      (let [base-queries          (t2/select :model/Query (duration-queries-to-rerun-honeysql cache-configs false))
            parameterized-queries (t2/select :model/Query (duration-queries-to-rerun-honeysql cache-configs true))]
        (concat base-queries (select-parameterized-queries parameterized-queries))))))

(defn- clear-caches-for-queries!
  "Deletes any existing cache entries for queries that we are about to re-run, so that subsequent tasks don't also try
  to re-run them before the cache has been refreshed. "
  [queries]
  (doseq [batch (partition 1000 1000 nil queries)]
    (t2/delete! :model/QueryCache :query_hash [:in (map :cache-hash batch)])))

(defn- maybe-refresh-duration-caches!
  "Detects caches with strategy=duration that are eligible for refreshing, and returns a count of the refresh jobs that
  were generated (i.e. the number of different cards refreshed, with each card potentially having multiple queries)."
  []
  (if-let [queries (seq (duration-queries-to-rerun))]
    (let [refresh-defs (->> queries
                            (group-by (juxt :card-id :dashboard-id))
                            (map (fn [[[card-id dashboard-id] queries]]
                                   {:card-id card-id
                                    :dashboard-id dashboard-id
                                    :queries (map :query queries)})))
          task         (refresh-task refresh-defs)]
      (clear-caches-for-queries! queries)
      (if *run-cache-refresh-async*
        (submit-refresh-task-async! task)
        (task))
      (count refresh-defs))
    0))

(defn- scheduled-base-query-to-rerun-honeysql
  "HoneySQL query for finding the the base query definition we should run for a card ID (i.e. the unparameterized
  query)."
  [card-id]
  {:select [:q.query [:qe.card_id :card-id]]
   :from   [[(t2/table-name :model/Query) :q]]
   :join   [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
   :where  [:and
            [:= :qe.card_id card-id]
            [:= :qe.parameterized false]
            [:= :qe.error nil]
            [:= :qe.is_sandboxed false]
            ;; Was the query executed at least once in the last month?
            ;; This is a safety check so that we don't scan all of query_execution -- if a query has not been executed at
            ;; all in the last month (including cache hits) we won't bother refreshing it again.
            [:>= :qe.started_at (duration-ago {:duration 30 :unit "days"})]]
   :order-by [[:qe.started_at :desc]]
   :limit  1})

(defn- scheduled-parameterized-queries-to-rerun-honeysql
  [card-id rerun-cutoff]
  {:select   [:q.query [:qe.card_id :card-id]]
   :from     [[(t2/table-name :model/Query) :q]]
   :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
   :where    [:and
              [:= :qe.card_id card-id]
              [:>= :qe.started_at rerun-cutoff]
              ;; Don't factor the last cache refresh into whether we should rerun a parameterized query
              [:not= :qe.context (name :cache-refresh)]
              [:= :parameterized true]
              [:= :qe.error nil]
              [:= :qe.is_sandboxed false]]
   :group-by [:q.query_hash :q.query :qe.card_id]
   :order-by [[[:count :q.query_hash] :desc]
              [[:min :qe.started_at] :asc]]
   :limit    *parameterized-queries-to-rerun-per-card*})

(defn- scheduled-queries-to-rerun
  "Returns a list containing all of the parameterized query definitions that we should preemptively rerun for a given
  card that uses :schedule caching."
  [card-id rerun-cutoff]
  (let [base-query (t2/select-one :model/Query (scheduled-base-query-to-rerun-honeysql card-id))
        parameterized-queries (t2/select :model/Query (scheduled-parameterized-queries-to-rerun-honeysql card-id rerun-cutoff))]
    (->> (concat (when base-query [base-query])
                 parameterized-queries)
         (map :query)
         distinct)))

(defn- schedule-cache-config->card-ids
  "Takes a schedule cache config and returns a sequence of card IDs to rerun."
  [{:keys [model_id model]}]
  (case model
    "question" [model_id]
    "dashboard" (let [dashboard (-> (t2/select-one :model/Dashboard :id model_id)
                                    (t2/hydrate :dashcards))]
                  (distinct (keep :card_id (:dashcards dashboard))))))

(defn- refresh-schedule-cache!
  "Given a cache config with the :schedule strategy, preemptively rerun the query (and a fixed number of parameterized
  variants) so that fresh results are cached."
  [{model       :model
    model-id    :model_id
    strategy    :strategy
    last-run-at :last_run_at
    created-at  :created_at
    :as cache-config}]
  (assert (= strategy :schedule))
  (let [rerun-cutoff (or last-run-at created-at)
        card-ids     (schedule-cache-config->card-ids cache-config)
        dashboard-id (when (= model "dashboard") model-id)
        refresh-defs (distinct
                      (map
                       (fn [card-id]
                         {:dashboard-id dashboard-id
                          :card-id      card-id
                          :queries      (scheduled-queries-to-rerun card-id rerun-cutoff)})
                       card-ids))
        task         (refresh-task refresh-defs)]
    (if *run-cache-refresh-async*
      (submit-refresh-task-async! task)
      (task))))

;;; ------------------------------------------- Cache invalidation task ------------------------------------------------

(defn- select-ready-to-run
  "Fetch whatever cache configs for a given `strategy` are ready to be updated."
  [strategy]
  (t2/select :model/CacheConfig
             :strategy strategy
             {:where [:or
                      [:= :next_run_at nil]
                      [:<= :next_run_at (t/offset-date-time)]]}))

(defn- calc-next-run
  "Calculate when a next run should happen based on a cron schedule"
  [^String schedule now]
  (let [^MutableTrigger cron (cron/finalize (cron/cron-schedule schedule))]
    ;; Synchronize cron runner to our app time, which may be mocked in tests
    (.setStartTime cron (t/java-date))
    (-> (.getFireTimeAfter cron (t/java-date now))
        (t/offset-date-time (t/zone-offset)))))

(defenterprise refresh-cache-configs!
  "Update `invalidated_at` for every cache config with `:schedule` strategy, and maybe rerun cached queries
  for both `:schedule` and `:duration` caches if preemptive caching is enabled."
  :feature :none
  []
  (let [now (t/offset-date-time)
        schedule-caches-to-invalidate (select-ready-to-run :schedule)
        schedule-refresh-count
        (reduce
         (fn [refreshed-count {:keys [id config refresh_automatically] :as cache-config}]
           (t2/update! :model/CacheConfig
                       {:id id}
                       {:next_run_at    (calc-next-run (:schedule config) now)
                        :invalidated_at now})
           (if (and (premium-features/enable-preemptive-caching?) refresh_automatically)
             (do
               (refresh-schedule-cache! cache-config)
               (inc refreshed-count))
             refreshed-count))
         0
         schedule-caches-to-invalidate)
        duration-refresh-count
        (if (premium-features/enable-preemptive-caching?)
          (maybe-refresh-duration-caches!)
          0)]
    {:schedule-invalidated (count schedule-caches-to-invalidate)
     :schedule-refreshed   schedule-refresh-count
     :duration-refreshed   duration-refresh-count}))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc                                   "Refresh 'schedule' caches"}
  Cache [_ctx]
  (refresh-cache-configs!))

(def ^:private cache-job
  (jobs/build
   (jobs/with-description "Schedule Caches refresh task")
   (jobs/of-type Cache)
   (jobs/with-identity (jobs/key "metabase-enterprise.cache.job"))
   (jobs/store-durably)))

(def ^:private cache-trigger
  (triggers/build
   (triggers/with-identity (triggers/key "metabase-enterprise.cache.trigger"))
   (triggers/start-now)
   (triggers/with-schedule
    (cron/cron-schedule "0 * * * * ? *"))))

(defmethod task/init! ::RefreshCacheConfigs [_]
  (when (premium-features/has-feature? :cache-granular-controls)
    (task/schedule-task! cache-job cache-trigger)))
