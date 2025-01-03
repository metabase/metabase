(ns metabase-enterprise.task.cache
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.task :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Callable ExecutorService ThreadPoolExecutor TimeUnit SynchronousQueue)
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

(defn- refresh-task
  "Returns a function that serially reruns queries based on `refresh-defs`, and discards the results. Each refresh
  definition contains a card-id, an optional dashboard-id, and a list of queries to rerun."
  [refresh-defs]
  (fn []
    (doseq [{:keys [card-id dashboard-id queries]} refresh-defs
            query queries]
      (try
        (qp/process-query
         (qp/userland-query
          (assoc-in query [:middleware :ignore-cached-results?] true)
          {:executed-by  nil
           :context      :cache-refresh
           :card-id      card-id
           :dashboard-id dashboard-id}))
        (catch Exception e
          (log/debugf "Error refreshing cache for card %s: %s" card-id (ex-message e)))))))

(defn- duration-ago
  [{:keys [duration unit]}]
  (t/minus (t/offset-date-time)
           (t/duration duration (keyword unit))))

(defn- duration-queries-to-rerun-honeysql
  "HoneySQL query for selecting query definitions that should be rerun, given a list of :duration cache configs.
  Executed twice, once to find parameterized queries and once to find non-parameterized queries."
  [configs->card-ids parameterized?]
  (let [queries
        (for [[{:keys [config]} card-ids] configs->card-ids]
          (let [rerun-cutoff (duration-ago config)]
            {:nest
             {:select   [[:q.query :query]
                         [:qe.card_id :card-id]
                         [[:count :q.query_hash] :count]]
              :from     [[(t2/table-name :model/Query) :q]]
              :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]
                         [(t2/table-name :model/QueryCache) :qc] [:= :qc.query_hash :qe.cache_hash]]
              :where    [:and
                         [:in :qe.card_id (set card-ids)]
                         [:<= :qc.updated_at rerun-cutoff]
                         ;; This is a safety check so that we don't scan all of query_execution -- if a query
                         ;; has not been excuted at all in the last month (including cache hits) we won't bother
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
              :group-by [:q.query_hash :q.query :qe.card_id]}}))]
    {:select [:u.query :u.card-id :u.count]
     :from   [[{:union queries} :u]]}))

(defn- cache-configs->card-ids
  "Takes a list of cache configs and returns a map from cache configs to relevant card IDs. For cache configs defined on
  a dashboard, this includes all cards on the dashboard."
  [cache-configs]
  (let [dashboard-ids          (->> (filter #(= (:model %) "dashboard") cache-configs)
                                    (map :model_id))
        dashboards             (when (seq dashboard-ids)
                                 (-> (t2/select :model/Dashboard {:where [:in :id dashboard-ids]})
                                     (t2/hydrate :dashcards)))
        dashboard-id->card-ids (into {}
                                     (map (fn [dashboard] [(:id dashboard) (mapv :card_id (:dashcards dashboard))])
                                          dashboards))
        config-to-card-ids     (map (fn [config]
                                      (let [model (:model config)
                                            model-id (:model_id config)]
                                        [config
                                         (cond
                                           (= model "dashboard") (get dashboard-id->card-ids model-id [])
                                           (= model "question") [model-id]
                                           :else [])]))
                                    cache-configs)]
    (into {} config-to-card-ids)))

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
  (let [cache-configs     (t2/select :model/CacheConfig :strategy :duration :refresh_automatically true)]
    (when (seq cache-configs)
      (let [configs->card-ids     (cache-configs->card-ids cache-configs)
            base-queries          (t2/select :model/Query (duration-queries-to-rerun-honeysql configs->card-ids false))
            parameterized-queries (t2/select :model/Query (duration-queries-to-rerun-honeysql configs->card-ids true))]
        (concat base-queries (select-parameterized-queries parameterized-queries))))))

(defn- maybe-refresh-duration-caches!
  []
  (when-let [queries (seq (duration-queries-to-rerun))]
    (let [refresh-defs (->> queries
                            (group-by :card-id)
                            (map (fn [[card-id queries]]
                                   {:card-id card-id
                                    :queries (map :query queries)})))
          task         (refresh-task refresh-defs)]
      (if *run-cache-refresh-async*
        (submit-refresh-task-async! task)
        (task)))))

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
            ;; This is a safety check so that we don't scan all of query_execution -- if a query has not been excuted at
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
        card-ids     (apply concat (vals (cache-configs->card-ids [cache-config])))
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

(defn- refresh-cache-configs!
  "Update `invalidated_at` for every cache config with `:schedule` strategy, and maybe rerun cached queries
  for both `:schedule` and `:duration` caches if preemptive caching is enabled."
  []
  (let [now (t/offset-date-time)
        invalidated-count
        (count
         (for [{:keys [id config refresh_automatically] :as cache-config} (select-ready-to-run :schedule)]
           (do
             (t2/update! :model/CacheConfig
                         {:id id}
                         {:next_run_at    (calc-next-run (:schedule config) now)
                          :invalidated_at now})
             (when (and (premium-features/enable-preemptive-caching?)
                        refresh_automatically)
               (refresh-schedule-cache! cache-config)))))]
    (when (premium-features/enable-preemptive-caching?)
      (maybe-refresh-duration-caches!))
    invalidated-count))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
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

(defenterprise init-cache-task!
  "Inits periodical task checking for cache expiration"
  :feature :cache-granular-controls
  []
  (task/schedule-task! cache-job cache-trigger))
