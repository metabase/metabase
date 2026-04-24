(ns metabase-enterprise.data-complexity-score.task.complexity-score
  "Daily Quartz job that computes and publishes the Data Complexity Score."
  (:require
   [clojure.edn :as edn]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.metrics.nominal :as metrics.nominal]
   [metabase-enterprise.data-complexity-score.metrics.scale :as metrics.scale]
   [metabase-enterprise.data-complexity-score.metrics.semantic :as metrics.semantic]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key     (jobs/key "metabase.task.data-complexity-score.job"))
(def ^:private trigger-key (triggers/key "metabase.task.data-complexity-score.trigger"))

(defn- current-fingerprint
  "String capturing everything that changes the meaning of an emitted score.

  Mirrors the Snowplow `formula_version` + `parameters` fields.
  `weights` is included so re-tuning forces a re-score without a `formula-version` bump;
  only structural scoring-algorithm changes need that.

  `:embedding-model` and `:text-variant` are fixed synonym-axis descriptors — stable across
  pgvector state changes, so the fingerprint doesn't drift when the search index is rebuilt
  or unreachable, but a swap to a different model or preprocessing variant does force a
  re-score."
  []
  (pr-str (into (sorted-map)
                {:formula-version   complexity/formula-version
                 :synonym-threshold metrics.semantic/synonym-similarity-threshold
                 :weights           {:scale    metrics.scale/weights
                                     :nominal  metrics.nominal/weights
                                     :semantic metrics.semantic/weights}
                 :embedding-model   embedders/default-synonym-model
                 :text-variant      embedders/default-text-variant})))

(defn- run-scoring!
  "One scoring pass. Gated by [[settings/data-complexity-scoring-enabled]] so admins can silence
  scoring without unscheduling the job.

  `claim-fingerprint` is the fingerprint carried on the scoring claim that authorized this run.
  Using it (rather than re-sampling [[current-fingerprint]] at commit time) means a config change
  mid-run cannot make us stamp a fingerprint onto `last-fingerprint` that we didn't actually score.

  Returns the score result (with `::complexity/snowplow-published?` metadata) when scoring ran, or
  nil when skipped / threw. Only a confirmed Snowplow publish advances `last-fingerprint` — any
  other outcome leaves it untouched so the next boot or cron retries and telemetry doesn't
  silently stall behind a transient publish failure."
  [claim-fingerprint]
  (if (settings/data-complexity-scoring-enabled)
    (try
      (let [result (complexity/complexity-scores :metabot-scope (metabot-scope/internal-metabot-scope))]
        (if (::complexity/snowplow-published? (meta result))
          (settings/data-complexity-scoring-last-fingerprint! claim-fingerprint)
          (log/warn "Data Complexity Score: Snowplow publish failed; leaving fingerprint unchanged so the next boot or cron retries"))
        result)
      (catch Throwable t
        (log/warn t "Data Complexity Score run failed")))
    (log/debug "Data Complexity Score run skipped — data-complexity-scoring-enabled is off")))

;; Long enough that any realistic scoring run finishes well inside it, short enough that a crashed
;; claimant unblocks the next tick's retry without operator intervention.
(def ^:private scoring-claim-ttl-ms (* 30 60 1000))

(defn- now-ms [] (System/currentTimeMillis))

(defn- parse-scoring-claim
  "Parse the persisted claim string into `{:fingerprint <str> :claimed-at <long> :owner <str>}` or
  nil when the setting is empty/garbled."
  [s]
  (when (and s (seq s))
    (try
      (let [v (edn/read-string s)]
        (when (map? v) v))
      (catch Throwable _ nil))))

(defn- scoring-claim-active?
  "True when a persisted claim for the same fingerprint we'd score now is still within the TTL —
  meaning another path (sibling boot, cron tick) is already computing and publishing for it, so
  this caller should skip."
  [claim current-fp]
  (boolean
   (and claim
        (= current-fp (:fingerprint claim))
        (when-let [ts (:claimed-at claim)]
          (and (int? ts)
               (< (- (now-ms) (long ts)) scoring-claim-ttl-ms))))))

(defn- claim-scoring-run!
  "Cluster-safe claim on one Data Complexity Score run — shared by the cron job and the boot-time
  startup hook so the two paths cannot compute and publish in parallel. Returns the claim map
  (including a unique `:owner` token) when this caller wins the right to run, or nil when another
  node/path already holds an active claim for the current fingerprint — or, when
  `:require-fingerprint-change?` is true, when the live fingerprint still matches the last
  successfully-published one (boot's extra gate so restarts at an unchanged config don't re-emit).

  The returned claim must be passed back to [[release-scoring-claim!]] so the release is a
  compare-and-clear — a sibling that took over after a TTL-based expiry keeps its own claim.

  We do not advance [[settings/data-complexity-scoring-last-fingerprint]] here — only `run-scoring!`
  does, after confirmed Snowplow publish. Instead we write a separate
  [[settings/data-complexity-scoring-claim]] marker (fingerprint + timestamp + owner) so that:

  - other nodes/paths acquiring the lock next see an active claim and skip (no duplicate scoring);
  - a scoring/publish failure or crash mid-run leaves the success fingerprint untouched, so the
    next boot or cron retries instead of treating the fingerprint as up-to-date;
  - the TTL on `:claimed-at` means even a hard JVM crash doesn't permanently suppress scoring;
  - the `:owner` token lets a slow claimant distinguish its own claim from a sibling's takeover.

  Reads inside the lock bypass the in-process settings cache via `config/*disable-setting-cache*`
  so values freshly committed by sibling nodes are always visible — the cache is only refreshed
  periodically and without bypass two nodes could both pass the check and both score."
  [{:keys [require-fingerprint-change?]}]
  (cluster-lock/with-cluster-lock {:lock ::complexity-score-run
                                   :timeout-seconds 10}
    (binding [config/*disable-setting-cache* true]
      (let [current (current-fingerprint)]
        (when (and (settings/data-complexity-scoring-enabled)
                   (or (not require-fingerprint-change?)
                       (not= current (settings/data-complexity-scoring-last-fingerprint)))
                   (not (scoring-claim-active?
                         (parse-scoring-claim (settings/data-complexity-scoring-claim))
                         current)))
          (let [claim {:fingerprint current
                       :claimed-at  (now-ms)
                       :owner       (str (random-uuid))}]
            (settings/data-complexity-scoring-claim! (pr-str claim))
            claim))))))

(defn- release-scoring-claim!
  "Best-effort compare-and-clear of the caller's scoring claim. Only clears the persisted value
  when its `:owner` still matches `claim` — protecting against the case where our run outlived the
  TTL and a sibling legitimately took over the claim in the meantime. Failure is non-fatal: the TTL
  on the claim timestamp ensures the next boot/cron can retry either way."
  [claim]
  (try
    (cluster-lock/with-cluster-lock {:lock ::complexity-score-run
                                     :timeout-seconds 10}
      (binding [config/*disable-setting-cache* true]
        (let [persisted (parse-scoring-claim (settings/data-complexity-scoring-claim))]
          (if (and persisted (= (:owner persisted) (:owner claim)))
            (settings/data-complexity-scoring-claim! "")
            (log/info "Data Complexity Score: skipping claim release — persisted claim no longer belongs to this node (sibling takeover after TTL)")))))
    (catch Throwable t
      (log/warn t "Data Complexity Score: failed to clear scoring claim; it will expire via TTL"))))

(defn- with-scoring-claim!
  "Acquire a scoring claim, invoke `f` with the claim's fingerprint, then release the claim via
  compare-and-clear. Returns nil when the claim couldn't be acquired (another path is scoring, or
  the fingerprint-change gate didn't fire). `opts` pass through to [[claim-scoring-run!]]."
  [opts f]
  (when-let [claim (claim-scoring-run! opts)]
    (try
      (f (:fingerprint claim))
      (finally
        (release-scoring-claim! claim)))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Compute and publish the Data Complexity Score."}
  DataComplexityScoring [_ctx]
  (with-scoring-claim! {} run-scoring!))

(defn maybe-emit-boot-score!
  "Run one scoring pass at boot when the persisted fingerprint lags the live config. Shares the
  cluster-wide scoring claim with the cron job (see [[claim-scoring-run!]]) so a restart that
  lands on top of a 03:17 UTC cron tick can't double-publish. Runs regardless of Quartz state so
  operators still get a score on nodes with `MB_DISABLE_SCHEDULER=true` or a failed scheduler init.
  Intended to be called from a startup hook on a background thread — see
  `metabase-enterprise.data-complexity-score.init`.

  Success advances the last-successful fingerprint inside `run-scoring!`; any other outcome (skip,
  throw, publish failure) leaves it untouched so the next boot or cron retries. The claim is
  released (compare-and-clear on `:owner`) after the run so other paths can proceed without
  waiting for the TTL — unless our run outlived the TTL and another path took over the claim."
  []
  (try
    (with-scoring-claim! {:require-fingerprint-change? true}
      (fn [fp]
        (log/info "Data Complexity Score: fingerprint changed, emitting boot-time score")
        (run-scoring! fp)))
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
