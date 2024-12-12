(ns metabase-enterprise.task.cache
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.task :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Callable ExecutorService Executors)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)
   (org.quartz.spi MutableTrigger)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Preemptive Caching ----------------------------------------------------

(defsetting preemptive-caching-thread-pool-size
  (deferred-tru "The size of the thread pool used to preemptively re-run cached queries.")
  :default    10
  :export?    false
  :type       :integer
  :visibility :internal)

(defonce ^:private pool
  (delay (Executors/newFixedThreadPool
          (preemptive-caching-thread-pool-size)
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

(defn- duration-base-queries-to-rerun-honeysql-honeysql
  "HoneySQL query for finding the the base query definitions we should run for a set of cards (i.e. the unparameterized
  queries)."
  [cache-configs]
  {:select-distinct [:q.query [:qe.card_id :card-id]]
   :from            [[(t2/table-name :model/Query) :q]]
   :join            [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]
                     [(t2/table-name :model/QueryCache) :qc] [:= :qc.query_hash :qe.cache_hash]]
   :where           [:and
                     (into [:or]
                           (map
                            (fn [{:keys [config model model_id]}]
                              (let [rerun-cutoff (duration-ago config)]
                                [:and
                                 ;; Is the query_execution row associated with a cached card or dashboard?
                                 (if (= model "question")
                                   [:= :qe.card_id model_id]
                                   [:= :qe.dashboard_id model_id])
                                 ;; Is the existing cache entry for the query expired?
                                 [:<= :qc.updated_at rerun-cutoff]
                                 ;; This is a safety check so that we don't scan all of query_execution -- if a query
                                 ;; has not been excuted at all in the last month (including cache hits) we won't bother
                                 ;; refreshing it again.
                                 [:>= :qe.started_at (duration-ago {:duration 30 :unit "days"})]]))
                            cache-configs))
                     [:= :qe.parameterized false]
                     [:= :qe.error nil]
                     [:= :qe.is_sandboxed false]]})

(defn- duration-parameterized-queries-to-rerun-honeysql
  "HoneySQL query for selecting parameterized query definitions that should be rerun, given a list of :duration cache configs."
  [cache-configs]
  (let [queries
        (for [{:keys [config model model_id]} cache-configs]
          (let [rerun-cutoff (duration-ago config)]
            {:nest
             {:select   [[:q.query :query]
                         [:qe.card_id :card-id]
                         [[:count :q.query_hash] :count]]
              :from     [[(t2/table-name :model/Query) :q]]
              :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]
                         [(t2/table-name :model/QueryCache) :qc] [:= :qc.query_hash :qe.cache_hash]]
              :where    [:and
                         (if (= model "question")
                           [:= :qe.card_id model_id]
                           [:= :qe.dashboard_id model_id])
                         [:<= :qc.updated_at rerun-cutoff]
                         ;; This is a safety check so that we don't scan all of query_execution -- if a query
                         ;; has not been excuted at all in the last month (including cache hits) we won't bother
                         ;; refreshing it again.
                         [:>= :qe.started_at (duration-ago {:duration 30 :unit "days"})]
                         [:= :qe.parameterized true]
                         [:= :qe.cache_hit true]
                         [:not= :qe.context (name :cache-refresh)]
                         [:= :qe.error nil]
                         [:= :qe.is_sandboxed false]]
              :group-by [:q.query_hash :q.query :qe.card_id]
              :order-by [[[:count :q.query_hash] :desc]]
              :limit    *parameterized-queries-to-rerun-per-card*}}))]
    {:select [:u.query :u.card-id]
     :from   [[{:union queries} :u]]}))

(defn- duration-queries-to-rerun
  []
  (let [cache-configs (t2/select :model/CacheConfig :strategy :duration :refresh_automatically true)]
    (when (seq cache-configs)
      (let [base-queries          (t2/select :model/Query (duration-base-queries-to-rerun-honeysql-honeysql cache-configs))
            parameterized-queries (t2/select :model/Query (duration-parameterized-queries-to-rerun-honeysql cache-configs))]
        (concat base-queries parameterized-queries)))))

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
            [:>= :qe.started_at (t/minus (t/offset-date-time) (t/days 30))]
            [:not= :qe.context (name :cache-refresh)]
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
  {:select   [:q.query_hash :q.query [[:count :q.query_hash]]]
   :from     [[(t2/table-name :model/Query) :q]]
   :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
   :where    [:and
              [:= :qe.card_id card-id]
              [:>= :qe.started_at rerun-cutoff]
              [:not= :qe.context (name :cache-refresh)]
              [:= :parameterized true]
              [:= :qe.error nil]
              [:= :qe.is_sandboxed false]]
   :group-by [:q.query_hash :q.query]
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

(defn- card-ids-to-refresh
  [model model-id]
  (case model
    "question"  [model-id]
    "dashboard" (let [dashcards (-> (t2/select-one :model/Dashboard :id model-id)
                                    (t2/hydrate [:dashcards :card])
                                    :dashcards)]
                  ;; Only re-run an identical card once per dashboard
                  (dedupe (map :id (map :card dashcards))))
    (throw (ex-info "Unsupported model type for preemptive caching"
                    {:model-id model-id
                     :model model}))))

(defn- refresh-schedule-cache!
  "Given a cache config with the :schedule strategy, preemptively rerun the query (and a fixed number of parameterized
  variants) so that fresh results are cached."
  [{model       :model
    model-id    :model_id
    strategy    :strategy
    last-run-at :last_run_at
    created-at  :created_at}]
  (assert (= strategy :schedule))
  (let [rerun-cutoff (or last-run-at created-at)
        card-ids     (card-ids-to-refresh model model-id)
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
