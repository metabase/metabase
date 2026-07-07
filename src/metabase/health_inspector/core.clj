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
   [metabase.util.log :as log]
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

(defn- run-check
  "Run one check in isolation: a throwing check reads as degraded rather than aborting the whole report."
  [check-name f]
  (try
    (f)
    (catch Throwable e
      (log/error e "Health check errored" {:check check-name})
      {:health 0 :message (str "Health check errored: " (ex-message e))})))

(defn report
  "Run all registered checks and produce a report describing potential problems.
  Each check is isolated, so one that throws doesn't lose the others' results."
  []
  (into {} (for [[name f] @checks]
             [name (run-check name f)])))

(defn- persist-check-result!
  "Persist one check result, or nothing when `result` is nil.
  A nil result marks a check as not applicable on this instance, so it is omitted rather than recorded as
  a misleading healthy score."
  [check-name result]
  (when (some? result)
    (t2/insert! :health_inspector_runs (-> result
                                           (select-keys [:health :message])
                                           (assoc :check_name (name check-name))))))

(defn save-report
  "Run every registered check and persist the results; not-applicable (nil) checks are omitted."
  []
  (doseq [[check-name result] (report)]
    (persist-check-result! check-name result)))

(defn- latest-run
  [check-name]
  (t2/select-one :health_inspector_runs :check_name (name check-name) {:order-by [[:run_at :desc]]}))

(defn run-and-save-check!
  "Run one registered check by name and persist its result, so a change can be surfaced immediately rather
  than at the next daily report.
  A no-op unless the health inspector is enabled and the named check is registered and applicable (non-nil).
  Deduplicates against the check's most recent run: an unchanged result isn't re-persisted, so a flapping
  caller (e.g. a circuit breaker cycling open/half-open) can't flood the table and bury other checks."
  [check-name]
  (when (setting/health-inspector-enabled)
    (when-let [f (get @checks check-name)]
      (when-let [result (run-check check-name f)]
        (let [prev (latest-run check-name)]
          (when-not (and prev
                         (= (:health prev) (:health result))
                         (= (:message prev) (:message result)))
            (persist-check-result! check-name result)))))))

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
