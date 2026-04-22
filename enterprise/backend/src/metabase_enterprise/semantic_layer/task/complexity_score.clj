(ns metabase-enterprise.semantic-layer.task.complexity-score
  "Daily Quartz job that emits the Data Complexity Score.
  Shared jobstore + `DisallowConcurrentExecution` → one node per cluster per tick.
  Boot-time emission (for first-ever runs and parameter bumps) is driven separately by the startup
  hook in `metabase-enterprise.semantic-layer.init`, which runs regardless of scheduler state and is
  guarded by a cluster lock so only one node per cluster emits per fingerprint change."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase-enterprise.semantic-layer.metabot-scope :as metabot-scope]
   [metabase-enterprise.semantic-layer.settings :as settings]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.app-db.cluster-lock :as cluster-lock]
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

(defn- claim-boot-emission!
  "Cluster-safe claim: returns true when this node wins the right to emit a boot-time score for the
  current config fingerprint. Under a short app-db lock we re-check the persisted fingerprint and
  pre-update it to the current value, so sibling nodes acquiring the lock next see the updated
  value and skip. Pre-claiming means scoring failures aren't retried on the same node, but the
  daily cron will catch up, which is preferable to the duplicate-burst behaviour of per-node
  `trigger-now!`."
  []
  (cluster-lock/with-cluster-lock {:lock ::complexity-score-boot-emission
                                   :timeout-seconds 10}
    (when (and (settings/data-complexity-scoring-enabled)
               (not= (current-fingerprint)
                     (settings/data-complexity-scoring-last-fingerprint)))
      (settings/data-complexity-scoring-last-fingerprint! (current-fingerprint))
      true)))

(defn maybe-emit-boot-score!
  "Emit a Data Complexity Score at boot if the persisted fingerprint lags the live config. Cluster-
  safe via [[claim-boot-emission!]]; runs regardless of Quartz state so operators still get a score
  on nodes with `MB_DISABLE_SCHEDULER=true` or a failed scheduler init. Intended to be called from
  a startup hook on a background thread — see `metabase-enterprise.semantic-layer.init`."
  []
  (try
    (when (claim-boot-emission!)
      (log/info "Data Complexity Score: fingerprint changed, emitting boot-time score")
      (run-scoring!))
    (catch Throwable t
      (log/warn t "Data Complexity Score: boot-time emission failed"))))

(defmethod task/init! ::DataComplexityScoring [_]
  (let [job     (jobs/build
                 (jobs/of-type DataComplexityScoring)
                 (jobs/store-durably)
                 (jobs/with-identity job-key)
                 (jobs/with-description "Data Complexity Score — daily telemetry"))
        ;; 03:17 UTC — off-hour to avoid cron-thundering-herd with other Metabase jobs.
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 17 3 * * ? *")
                   (cron/in-time-zone (java.util.TimeZone/getTimeZone "UTC"))
                   (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)))
