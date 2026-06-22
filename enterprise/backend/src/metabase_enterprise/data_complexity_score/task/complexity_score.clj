(ns metabase-enterprise.data-complexity-score.task.complexity-score
  "Weekly Quartz job that computes and publishes the Data Complexity Score."
  (:require
   [clojure.edn :as edn]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.models.data-complexity-score :as data-complexity-score]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase-enterprise.data-complexity-score.synonym-source :as synonym-source]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key     (jobs/key "metabase.task.data-complexity-score.job"))
(def ^:private trigger-key (triggers/key "metabase.task.data-complexity-score.trigger"))

(defn current-fingerprint
  "String capturing everything that changes the meaning or shape of an emitted score.
  Includes `formula-version`, `format-version`, `weights`, `synonym-threshold`, and the synonym-axis fragment
  from [[synonym-source/fingerprint-fragment]] (source toggles, configured embedder, pgvector index swaps)."
  []
  (pr-str (into (sorted-map)
                (merge {:formula-version   complexity/formula-version
                        :format-version    complexity/format-version
                        :synonym-threshold complexity/synonym-similarity-threshold
                        :weights           complexity/weights}
                       (synonym-source/fingerprint-fragment)))))

(defn maybe-advance-last-fingerprint!
  "Advance [[settings/data-complexity-scoring-last-fingerprint]] only if Snowplow accepted the publish.
  On failure we leave it untouched so the next boot or cron retries.
  Shared by the cron, API recompute, and CLI appdb paths to keep all persisters in lockstep."
  [fingerprint result]
  (if (::complexity/snowplow-published? (meta result))
    (settings/data-complexity-scoring-last-fingerprint! fingerprint)
    (log/warn "Data Complexity Score: Snowplow publish failed; leaving fingerprint unchanged so the next boot or cron retries")))

(defn- run-scoring!
  "One scoring pass. Gated by [[settings/scoring-active?]] — the `:data-complexity-score` premium
  feature token is authoritative, with the deprecated `data-complexity-scoring-enabled` setting as
  a backward-compatible fallback — so the job can be silenced without unscheduling.

  `claim-fingerprint` is the fingerprint carried on the scoring claim that authorized this run.
  Using it (rather than re-sampling [[current-fingerprint]] at commit time) means a config change
  mid-run cannot make us stamp a fingerprint onto `last-fingerprint` that we didn't actually score.

  Returns the score result (with `::complexity/snowplow-published?` metadata) when scoring ran, or
  nil when skipped / threw. Only a confirmed Snowplow publish advances `last-fingerprint` — any
  other outcome leaves it untouched so the next boot or cron retries and telemetry doesn't
  silently stall behind a transient publish failure."
  [claim-fingerprint]
  (if (settings/scoring-active?)
    (try
      (let [result (complexity/complexity-scores
                    (assoc (synonym-source/complexity-scores-opts)
                           :metabot-scope (metabot-scope/internal-metabot-scope)))]
        (try
          (data-complexity-score/record-score! claim-fingerprint "appdb" result)
          (maybe-advance-last-fingerprint! claim-fingerprint result)
          (catch Throwable t
            (log/warn t "Data Complexity Score: failed to persist score snapshot; leaving fingerprint unchanged so the next boot or cron retries")))
        result)
      (catch Throwable t
        (log/warn t "Data Complexity Score run failed")
        nil))
    (log/debug "Data Complexity Score run skipped — scoring-active? is false")))

;; Long enough that any realistic scoring run finishes well inside it, short enough that a crashed
;; claimant unblocks the next tick's retry without operator intervention.
(def ^:private scoring-claim-ttl-ms (* 30 60 1000))

;; The weekly cron re-scores to capture catalog drift the fingerprint can't see, but a recompute for the
;; *same fingerprint* within this window — boot-time emission on a config change, an admin "recompute"
;; click, or a CLI appdb run — already produced an equivalent score, so the cron suppresses the recompute.
;; If that recent score was actually published the cron skips entirely; if the snapshot exists but its
;; publish lagged (`last-fingerprint` didn't advance) the cron re-emits the cached snapshot instead of
;; recomputing — see [[claim-scoring-run!]]'s `:mode`.
;; Fingerprint-scoped: a config change leaves no recent row for the new fingerprint, so the cron still
;; scores immediately.
(def ^:private cron-cooldown-hours 12)

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

  The returned claim carries a `:mode`. With `:cooldown-hours` set (the cron path) an appdb snapshot
  for the current fingerprint within that window means we skip the recompute, but the mode still
  distinguishes two cases: `:skip` (already published — `last-fingerprint` matches, no claim
  returned) versus `:republish` (scored but the publish lagged — re-emit the cached snapshot instead
  of recomputing). Outside the cooldown the mode is `:recompute`.

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
  [{:keys [require-fingerprint-change? cooldown-hours]}]
  (cluster-lock/with-cluster-lock {:lock ::complexity-score-run
                                   :timeout-seconds 10}
    (binding [config/*disable-setting-cache* true]
      (let [current (current-fingerprint)
            last-fp (settings/data-complexity-scoring-last-fingerprint)
            recent? (boolean (and cooldown-hours
                                  (data-complexity-score/scored-within-cooldown? current "appdb" cooldown-hours)))
            ;; A scored-but-unpublished fingerprint (last-fp still lags) re-emits the cached snapshot
            ;; rather than recomputing — the cooldown suppresses the recompute, not the publish retry.
            mode    (cond
                      (and recent? (= current last-fp)) :skip
                      recent?                           :republish
                      :else                             :recompute)]
        (when (and (settings/scoring-active?)
                   (not= mode :skip)
                   (or (not require-fingerprint-change?)
                       (not= current last-fp))
                   (not (scoring-claim-active?
                         (parse-scoring-claim (settings/data-complexity-scoring-claim))
                         current)))
          (let [claim {:fingerprint current
                       :mode        mode
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
  "Acquire a scoring claim, invoke `f` with the claim map, then release the claim via
  compare-and-clear. Returns nil when the claim couldn't be acquired (another path is scoring, or
  the fingerprint-change gate didn't fire). `opts` pass through to [[claim-scoring-run!]]."
  [opts f]
  (when-let [claim (claim-scoring-run! opts)]
    (try
      (f claim)
      (finally
        (release-scoring-claim! claim)))))

(defn- republish-cached-score!
  "Re-emit the latest cached appdb snapshot for `fingerprint` to Snowplow without recomputing, then
  advance `last-fingerprint` on a confirmed publish. Falls back to a full recompute if the snapshot
  the cooldown saw is already gone (manual delete / race)."
  [fingerprint]
  (if-let [cached (data-complexity-score/latest-score fingerprint "appdb")]
    (let [result (complexity/republish-score! cached)]
      (maybe-advance-last-fingerprint! fingerprint result)
      result)
    (run-scoring! fingerprint)))

(defn- run-claim!
  "Dispatch a claimed run by `:mode`:
  - `:republish` re-emits the cached snapshot
  - `:skip` is a no-op
  - anything else recomputes

  A `:skip` claim never reaches here — [[claim-scoring-run!]] returns nil in that mode — but the
  explicit branch keeps the dispatch total so a future caller can't silently recompute on it."
  [{:keys [mode fingerprint]}]
  (case mode
    :republish (republish-cached-score! fingerprint)
    :skip      nil
    (run-scoring! fingerprint)))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Compute and publish the Data Complexity Score."}
  DataComplexityScoring [_ctx]
  (with-scoring-claim! {:cooldown-hours cron-cooldown-hours} run-claim!))

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
      (fn [{:keys [fingerprint]}]
        (log/info "Data Complexity Score: fingerprint changed, emitting boot-time score")
        (run-scoring! fingerprint)))
    (catch Throwable t
      (log/warn t "Data Complexity Score: boot-time emission failed"))))

(defmethod task/init! ::DataComplexityScoring [_]
  (let [job     (jobs/build
                 (jobs/of-type DataComplexityScoring)
                 (jobs/store-durably)
                 (jobs/with-identity job-key)
                 (jobs/with-description "Data Complexity Score — weekly telemetry"))
        ;; Sundays at 03:17 UTC — off-hour to avoid cron-thundering-herd with other Metabase jobs.
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 17 3 ? * SUN *")
                   (cron/in-time-zone (java.util.TimeZone/getTimeZone "UTC"))
                   (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)))
