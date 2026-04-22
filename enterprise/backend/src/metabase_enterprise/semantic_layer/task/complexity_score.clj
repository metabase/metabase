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
  without unscheduling the job.

  Returns the score result (with `::complexity/snowplow-published?` metadata) when scoring ran, or
  nil when skipped / threw. The caller uses the metadata to gate fingerprint advancement: we only
  consider this run \"done\" when Snowplow actually accepted the event. Otherwise the next boot
  (or cron) needs to retry so telemetry doesn't silently stall behind a transient publish failure."
  []
  (if (settings/data-complexity-scoring-enabled)
    (try
      (let [result (complexity/complexity-scores :metabot-scope (metabot-scope/internal-metabot-scope))]
        (if (::complexity/snowplow-published? (meta result))
          (settings/data-complexity-scoring-last-fingerprint! (current-fingerprint))
          (log/warn "Data Complexity Score: Snowplow publish failed; leaving fingerprint unchanged so the next boot or cron retries"))
        result)
      (catch Throwable t
        (log/warn t "Data Complexity Score job failed")
        nil))
    (do (log/debug "Data Complexity Score job skipped — data-complexity-scoring-enabled is off")
        nil)))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Compute and publish the Data Complexity Score."}
  DataComplexityScoring [_ctx]
  (run-scoring!))

(defn- claim-boot-emission!
  "Cluster-safe claim: returns `{:prior-fingerprint <string>}` when this node wins the right to emit
  a boot-time score for the current config fingerprint, or nil when no claim is taken. Under a
  short app-db lock we re-check the persisted fingerprint and pre-update it to the current value,
  so sibling nodes acquiring the lock next see the updated value and skip. The prior fingerprint
  is returned so the caller can revert the claim if scoring or Snowplow publish fails, leaving the
  next boot free to retry instead of silently skipping on a stale telemetry fingerprint."
  []
  (cluster-lock/with-cluster-lock {:lock ::complexity-score-boot-emission
                                   :timeout-seconds 10}
    (when (and (settings/data-complexity-scoring-enabled)
               (not= (current-fingerprint)
                     (settings/data-complexity-scoring-last-fingerprint)))
      (let [prior (settings/data-complexity-scoring-last-fingerprint)]
        (settings/data-complexity-scoring-last-fingerprint! (current-fingerprint))
        {:prior-fingerprint prior}))))

(defn maybe-emit-boot-score!
  "Emit a Data Complexity Score at boot if the persisted fingerprint lags the live config. Cluster-
  safe via [[claim-boot-emission!]]; runs regardless of Quartz state so operators still get a score
  on nodes with `MB_DISABLE_SCHEDULER=true` or a failed scheduler init. Intended to be called from
  a startup hook on a background thread — see `metabase-enterprise.semantic-layer.init`.

  If scoring threw or Snowplow didn't accept the event, revert the pre-claimed fingerprint so the
  next boot (or daily cron) can retry instead of treating the stale fingerprint as up-to-date."
  []
  (try
    (when-let [{:keys [prior-fingerprint]} (claim-boot-emission!)]
      (log/info "Data Complexity Score: fingerprint changed, emitting boot-time score")
      (let [result (run-scoring!)]
        (when-not (and result (::complexity/snowplow-published? (meta result)))
          (log/warn "Data Complexity Score: boot-time emission did not publish; reverting claimed fingerprint so the next boot retries")
          (settings/data-complexity-scoring-last-fingerprint! prior-fingerprint))))
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
