(ns metabase-enterprise.task.caching
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.task :as task]
   [toucan2.core :as t2])
  (:import
   (org.quartz.spi MutableTrigger)))

(set! *warn-on-reflection* true)

(defn- select-ready-to-run
  "Fetch whatever cache configs are ready to be updated."
  [strategy]
  (t2/select :model/CacheConfig :strategy strategy {:where [:or
                                                            [:= :next_run_at nil]
                                                            [:<= :next_run_at (t/offset-date-time)]]}))

(defn- calc-next-run
  "Calculate when a next run should happen based on a cron schedule"
  [^String schedule]
  (let [^MutableTrigger cron (cron/finalize (cron/cron-schedule schedule))]
    ;; Synchronize cron runner to our app time, which may be mocked in tests
    (.setStartTime cron (t/java-date))
    (-> (.getFireTimeAfter cron (t/java-date (t/offset-date-time)))
        (t/offset-date-time (t/zone-offset)))))

(defn- refresh-schedule-configs
  "Update `last_expired_at` for every cache config with `:schedule` strategy"
  []
  (count
   (for [{:keys [id config]} (select-ready-to-run :schedule)]
     (t2/update! :model/CacheConfig {:id id}
                 {:next_run_at     (calc-next-run (:schedule config))
                  :last_expired_at (t/offset-date-time)}))))

(defn- refresh-query-configs
  "Fetches `:query`-strategy configs wants to re-check their queries, runs those queries and updates `last_expired_at`
  where `(:marker state)` is not equal to the result of the query."
  []
  (if-let [configs (seq (select-ready-to-run :query))]
    (let [fields (m/index-by :id (t2/select :model/Field :id [:in (map #(-> % :config :field_id) configs)]))
          tables (m/index-by :id (t2/select :model/Table :id [:in (map :table_id (vals fields))]))]
      (count
       (for [{:keys [id config] :as item} configs
             :let [field       (get fields (:field_id config))
                   table       (get tables (:table_id field))
                   query       {:database (:db_id table)
                                :type     :query
                                :query    {:source-table (:table_id field)
                                           :aggregation  [(:aggregation config) [:field (:id field) nil]]}}
                   result      (-> (qp/process-query query) :data :rows ffirst)
                   next-run-at (calc-next-run (:schedule config))
                   marker      (:marker (:state item))]]
         (t2/update! :model/CacheConfig {:id id}
                     (cond-> {:next_run_at next-run-at}
                       (not= marker result) (assoc :state {:marker result}
                                                   :last_expired_at (t/offset-date-time)))))))
    0))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc                                   "Refresh 'schedule' caches"}
  Caching [_ctx]
  (refresh-schedule-configs)
  (refresh-query-configs))

(def ^:private caching-job
  (jobs/build
    (jobs/with-description "Schedule Caches refresh task")
    (jobs/of-type Caching)
    (jobs/with-identity (jobs/key "metabase-enterprise.Caching.job"))
    (jobs/store-durably)))

(def ^:private caching-trigger
  (triggers/build
    (triggers/with-identity (triggers/key "metabase-enterprise.Caching.trigger"))
    (triggers/start-now)
    (triggers/with-schedule
      (cron/schedule
        ;; run every minute
        (cron/cron-schedule "0 * * * * ? *")))))

(defenterprise init-caching-task!
  "Inits periodical task checking for cache expiration"
  :feature :cache-granular-controls
  []
  (task/schedule-task! caching-job caching-trigger))
