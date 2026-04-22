(ns metabase-enterprise.semantic-layer.task.complexity-score
  "Daily Quartz job that emits the Data Complexity Score.
  Shared jobstore + `DisallowConcurrentExecution` → one node per cluster per tick.
  On boot we `trigger-now!` when the fingerprint setting doesn't match current config, so first-ever
  runs and parameter bumps don't wait for next cron."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase-enterprise.semantic-layer.metabot-scope :as metabot-scope]
   [metabase-enterprise.semantic-layer.settings :as settings]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key     (jobs/key "metabase-enterprise.semantic-layer.task.complexity-score.job"))
(def ^:private trigger-key (triggers/key "metabase-enterprise.semantic-layer.task.complexity-score.trigger"))

(defn- current-fingerprint
  "String capturing everything that changes the meaning of an emitted score — mirror of the Snowplow
  `formula_version` + `parameters` fields."
  []
  (pr-str (into (sorted-map)
                (cond-> {:formula-version   complexity/formula-version
                         :synonym-threshold complexity/synonym-similarity-threshold}
                  (semantic-search/active-embedding-model)
                  (assoc :embedding-model (semantic-search/active-embedding-model))))))

(defn- run-scoring!
  "One scoring pass. Gated by [[settings/data-complexity-scoring-enabled]] so admins can silence it
  without unscheduling the job."
  []
  (if (settings/data-complexity-scoring-enabled)
    (try
      (complexity/complexity-scores :metabot-scope (metabot-scope/internal-metabot-scope))
      (settings/data-complexity-scoring-last-fingerprint! (current-fingerprint))
      (catch Throwable t
        (log/warn t "Data Complexity Score job failed")))
    (log/debug "Data Complexity Score job skipped — data-complexity-scoring-enabled is off")))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Compute and publish the Data Complexity Score."}
  DataComplexityScoring [_ctx]
  (run-scoring!))

(defn- needs-immediate-fire?
  "True when the persisted fingerprint lags behind the live config — first-ever run or a bump since
  the last successful emission."
  []
  (and (settings/data-complexity-scoring-enabled)
       (not= (current-fingerprint)
             (settings/data-complexity-scoring-last-fingerprint))))

(defmethod task/init! ::DataComplexityScoring [_]
  (let [job     (jobs/build
                 (jobs/of-type DataComplexityScoring)
                 (jobs/store-durably)
                 (jobs/with-identity job-key)
                 (jobs/with-description "Data Complexity Score — daily telemetry"))
        ;; 03:17 UTC — off-hour to avoid cron-thundering-herd with other Metabase jobs.
        ;; No `start-now`: the fingerprint check below handles first-fire without double-firing.
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 17 3 * * ? *")
                   (cron/in-time-zone (java.util.TimeZone/getTimeZone "UTC"))
                   (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)
    (when (needs-immediate-fire?)
      (log/info "Data Complexity Score: fingerprint changed, firing immediately")
      (task/trigger-now! job-key))))
