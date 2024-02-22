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

(defn- refresh-schedule-configs []
  (let [now (t/offset-date-time)]
    (doseq [item (t2/select :model/CacheConfig :strategy :schedule {:where [:or
                                                                            [:= :next_run_at nil]
                                                                            [:<= :next_run_at [:now]]]})
            :let [cron     (-> (cron/cron-schedule (-> item :config :schedule))
                               cron/finalize)
                  ;; needed by the tests, or the cron will use it's own current date
                  _        (.setStartTime ^MutableTrigger cron (t/java-date))
                  next-run (-> (.getFireTimeAfter ^MutableTrigger cron (t/java-date (t/offset-date-time)))
                               (t/offset-date-time (t/zone-offset)))]]
      (t2/update! :model/CacheConfig {:id (:id item)} {:updated_at  now
                                                       :next_run_at next-run}))))

(defn- refresh-query-configs []
  (let [now     (t/offset-date-time)
        configs (t2/select :model/CacheConfig :strategy :query {:where [:or
                                                                        [:= :next_run_at nil]
                                                                        [:<= :next_run_at [:now]]]})
        fields  (m/index-by :id
                            (t2/select :model/Field :id [:in (map #(-> % :config :field_id) configs)]))
        tables  (m/index-by :id
                            (t2/select :model/Table :id [:in (map :table_id (vals fields))]))]
    (doseq [item configs
            :let [config   (:config item)
                  field    (get fields (:field_id config))
                  table    (get tables (:table_id field))
                  cron     (-> (cron/cron-schedule (:schedule config))
                               cron/finalize)
                  ;; needed by the tests, or the cron will use it's own current date
                  _        (.setStartTime ^MutableTrigger cron (t/java-date))
                  next-run (-> (.getFireTimeAfter ^MutableTrigger cron (t/java-date (t/offset-date-time)))
                               (t/offset-date-time (t/zone-offset)))
                  query    {:database (:db_id table)
                            :type     :query
                            :query    {:source-table (:table_id field)
                                       :aggregation  [(:aggregation config)
                                                      [:field (:id field) nil]]}}
                  result   (-> (qp/process-query query) :data :rows ffirst)]]
      (when (not= result (:payload item))
        (t2/update! :model/CacheConfig {:id (:id item)} {:updated_at  now
                                                         :next_run_at next-run
                                                         :payload     result})))))

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
