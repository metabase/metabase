(ns metabase.health-inspector.core
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.health-inspector.settings :as setting]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema :as schema]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- validate-query [{:keys [total valid]} {:keys [dataset_query]}]
  (let [timer (u/start-timer)
        query (lib-be/normalize-query (json/decode dataset_query keyword))
        valid? (mr/validate ::schema/query query)]
    (Thread/sleep ^Long (u/since-ms timer))
    {:total (inc total)
     :valid (if valid?
              (inc valid)
              valid)}))

(defn- percent [n] (int (* 100 n)))

(defn ^:internal validate-queries
  "Determine how many saved queries are valid according to the malli schema."
  []
  (let [queries (t2/reducible-select :report_card {:where [:= :archived false]})
        {:keys [total valid]} (reduce validate-query {:total 0 :valid 0} queries)
        ratio (if (zero? total)
                1
                (/ valid total))]
    {:health (percent ratio)
     :message (if (= 1 ratio)
                "All queries valid."
                "Some queries are invalid.")}))

(defonce ^:private checks (atom {:validate-queries validate-queries}))

(defn register-check!
  "Register a new check function with a given name.
  Check functions take no args and return a map with a :health ratio and :description string."
  [name check-fn]
  (swap! checks assoc name check-fn))

(defn report
  "Run all registered checks and produce a report describing potential problems."
  []
  (into {} (for [[name f] @checks]
             [name (f)])))

(defn save-report
  "Run a health inspector report and save it to the DB."
  []
  (doseq [[check-name result] (report)]
    (t2/insert! :health_inspector_runs (-> result
                                           (select-keys [:health :message])
                                           (assoc :check_name (name check-name))))))

(defn list-runs
  "Return the most recent health inspector runs from the DB."
  [limit]
  (t2/select :health_inspector_runs {:limit limit :order-by [[:run_at :desc]]}))

(task/defjob ^:private ^{org.quartz.DisallowConcurrentExecution true} SaveReport [_]
  (when (setting/health-inspector-enabled)
    ;; background job should always be the lowest priority
    (.setPriority (Thread/currentThread) 1)
    ;; quartz doesn't have support for jitter, so we fake it with a sleep
    (Thread/sleep ^Long (rand-int 60000))
    (save-report)))

(defmethod task/init! ::SaveReport [_]
  (let [job-key (jobs/key "metabase.health-inspector.job")
        trigger-key (triggers/key "metabase.health-inspector.trigger")
        job (jobs/build
             (jobs/of-type SaveReport)
             (jobs/with-identity job-key)
             (jobs/with-description "Gather health checks.")
             (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/start-now)
                 ;; 2:28AM every day
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 28 2 * * ? *")
                   (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
