(ns metabase.app-db.task.encryption-backfill
  "Encrypts the warehouse-derived columns that already existed when an instance upgraded to v64.

  An instance that already had `MB_ENCRYPTION_SECRET_KEY` set never re-runs `encrypt-db`, so those rows would
  otherwise stay in the clear until something happened to rewrite them, which for a stable schema may be never. It
  runs here rather than as a migration because `metabase_field` can hold millions of rows, and a migration that long
  blocks startup, holds the changelog lock, and can trip container startup probes."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.task.core :as task]
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private batch-size
  "Rows per page. Bounded by memory rather than throughput: a page of `metabase_fieldvalues` can be ~50MB."
  500)

(def ^:private run-seconds
  "How long one run works for. A budget rather than a page count, because a fingerprint page takes ~45ms and a field
  values page ~2s."
  10)

(def ^:private startup-delay-seconds 30)
(def ^:private continuation-delay-seconds 20)

;; Stored as a raw `setting` row rather than a `defsetting`, for the same reason `encryption-check` is: the app-db
;; module can't depend on the settings module without a cycle.
(def ^:private progress-key "encryption-backfill-progress")
(def ^:private job-key (jobs/key "metabase.task.encryption-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.encryption-backfill.trigger"))

(defn- read-progress
  "Per-column progress, or nil to start from scratch. Stored as JSON with plain string keys and values, so it survives
  the round trip unchanged, and read back through `maybe-decrypt` because key rotation re-encrypts every `setting`
  row including this one."
  []
  (when-let [raw (t2/select-one-fn :value :setting :key progress-key)]
    (try
      (json/decode (encryption/maybe-decrypt raw))
      (catch Throwable e
        ;; unreadable progress just means starting over; the sweep skips rows it already converted
        (log/warn e "Could not read encryption backfill progress, starting from the beginning")
        nil))))

(defn- save-progress! [progress]
  (let [value (encryption/maybe-encrypt (json/encode progress))]
    (when (zero? (t2/update! :setting {:key progress-key} {:value value}))
      (t2/insert! :setting {:key progress-key :value value}))))

(defn- readiness []
  (cond
    (not (encryption/default-encryption-enabled?))         :no-key
    (mdb.encryption/sweep-complete? (read-progress))       :already-complete
    :else                                                  :ready))

(defn- log-skip [reason]
  (case reason
    :no-key           (log/debug "Skipping encryption backfill because MB_ENCRYPTION_SECRET_KEY is not set.")
    :already-complete (log/debug "Encryption backfill already complete.")
    nil))

(declare schedule-run!)

(defn- run-batch!
  "Convert for at most [[run-seconds]]. Returns a result map whose `:status` drives rescheduling."
  []
  (let [reason (readiness)]
    (if (not= reason :ready)
      {:status :skipped :reason reason}
      (let [deadline (+ (System/currentTimeMillis) (* 1000 (long run-seconds)))
            {:keys [progress pages]} (mdb.encryption/rewrite-dwh-derived-columns!
                                      mdb.encryption/encrypt-value (read-progress) deadline batch-size)]
        (save-progress! progress)
        {:status (if (mdb.encryption/sweep-complete? progress) :complete :more)
         :pages  pages
         :progress progress}))))

(def ^:private retry-delay-seconds
  "Backoff after a failed batch, so a deterministic failure retries occasionally rather than every few seconds."
  (* 15 60))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Encrypt warehouse-derived columns left over from before the upgrade."}
  EncryptionBackfill [ctx]
  ;; reschedule on the way out of a failure too, then rethrow. The trigger is one-shot, so without this a single bad
  ;; page would end the sweep until the next restart.
  (let [scheduler (.getScheduler ^JobExecutionContext ctx)
        {:keys [status] :as result} (try
                                      (run-batch!)
                                      (catch Throwable e
                                        (schedule-run! scheduler retry-delay-seconds)
                                        (throw e)))]
    (if (= status :more)
      (do (log/debug "Encryption backfill batch complete" result)
          (schedule-run! scheduler continuation-delay-seconds))
      (log/info "Encryption backfill finished" result))))

(defn- build-job []
  (jobs/build
   (jobs/with-description "Encrypt warehouse-derived columns left over from before the upgrade")
   (jobs/of-type EncryptionBackfill)
   (jobs/with-identity job-key)))

(defn- build-trigger [delay-seconds]
  (triggers/build
   (triggers/with-identity trigger-key)
   (triggers/for-job job-key)
   (triggers/start-at (Date/from (.plusSeconds (Instant/now) (long delay-seconds))))
   (triggers/with-schedule
    (simple/schedule (simple/with-misfire-handling-instruction-fire-now)))))

(defn- schedule-run! [scheduler delay-seconds]
  (task/schedule-task! scheduler (build-job) (build-trigger delay-seconds)))

(defmethod task/init! ::EncryptionBackfill
  [_]
  (let [reason (readiness)]
    (if (= reason :ready)
      (schedule-run! (task/scheduler) startup-delay-seconds)
      (log-skip reason))))
