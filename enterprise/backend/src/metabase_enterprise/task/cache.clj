(ns metabase-enterprise.task.cache
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Callable ExecutorService Executors)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)
   (org.quartz.spi MutableTrigger)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Preemptive Caching ----------------------------------------------------

(defsetting preemptive-caching-thread-pool-size
  (deferred-tru "The size of the thread pool used to preemptively re-run cached queries.")
  :default    5
  :export?    false
  :type       :integer
  :visibility :internal)

(defonce ^:private pool
  (delay (Executors/newFixedThreadPool
          (preemptive-caching-thread-pool-size)
          (.build
           (doto (BasicThreadFactory$Builder.)
             (.namingPattern "preemptive-caching-thread-pool-%d"))))))

(def ^:dynamic *queries-to-rerun-per-card*
  "Number of query variations (e.g. with different parameters) to run for a single cached card."
  10)

(defn- submit-refresh-task!
  "Submits a job to the thread pool to run a sequence of queries for a single card or dashboard being refreshed.
  This is best-effort; we try each query once and discard failures."
  [refresh-defs]
  (.submit ^ExecutorService @pool ^Callable
           (fn []
             (doseq [{:keys [card-id dashboard-id queries]} refresh-defs
                     query queries]
               (qp/process-query
                (qp/userland-query
                 (assoc-in query [:middleware :ignore-cached-results?] true)
                 {:executed-by  nil
                  :context      :cache-refresh
                  :card-id      card-id
                  :dasbhoard-id dashboard-id}))))))

#_(defn- refresh-duration-caches!
    "Finds any caches with the :duration cache strategy")

(defn- queries-to-rerun
  "Returns a list containing all of the query definitions that we should preemptively rerun for a given card that uses
  :schedule-strategy caching."
  [card rerun-cutoff]
  (let [queries (t2/select :model/Query
                           {:select   [:q.query_hash :q.query [[:count :q.query_hash]]]
                            :from     [[(t2/table-name :model/Query) :q]]
                            :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
                            :where    [:and
                                       [:not= :qe.context (name :cache-refresh)]
                                       [:= :qe.card_id (u/the-id card)]
                                       [:>= :started_at rerun-cutoff]]
                            :group-by [:q.query_hash :q.query]
                            :order-by [[[:count :q.query_hash] :desc]
                                       [[:min :qe.started_at] :asc]]
                            :limit    *queries-to-rerun-per-card*})]
    (map :query queries)))

(defn- cards-to-refresh
  [model model-id]
  (case model
    "question"  (t2/select :model/Card :id model-id)
    "dashboard" (let [dashcards (-> (t2/select-one :model/Dashboard :id model-id)
                                    (t2/hydrate [:dashcards :card])
                                    :dashcards)]
                  ;; Only re-run an identical card once per dashboard
                  (m/distinct-by :id (map :card dashcards)))
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
        cards        (cards-to-refresh model model-id)
        dashboard-id (when (= model "dashboard") model-id)
        refresh-defs (dedupe
                      (map
                       (fn [card]
                         {:dashboard-id dashboard-id
                          :card-id      (u/the-id card)
                          :queries      (queries-to-rerun card rerun-cutoff)})
                       cards))]
    (submit-refresh-task! refresh-defs)))

(comment
 (refresh-schedule-cache! (t2/select-one :model/CacheConfig :model_id 242)))

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

(defn- refresh-schedule-configs!
  "Update `invalidated_at` for every cache config with `:schedule` strategy, and maybe rerun cached queries."
  []
  (let [now (t/offset-date-time)]
    (count
     (for [{:keys [id config refresh_automatically] :as cache-config} (select-ready-to-run :schedule)]
       (do
         (t2/update! :model/CacheConfig {:id id}
                     {:next_run_at     (calc-next-run (:schedule config) now)
                      :invalidated_at now})
         (when refresh_automatically (refresh-schedule-cache! cache-config)))))))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc                                   "Refresh 'schedule' caches"}
  Cache [_ctx]
  (refresh-schedule-configs!))

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
