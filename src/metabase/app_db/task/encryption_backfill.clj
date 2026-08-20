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
(def ^:private cursor-key "encryption-backfill-cursor")
(def ^:private done "done")

(def ^:private job-key (jobs/key "metabase.task.encryption-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.encryption-backfill.trigger"))

(defn- read-cursor []
  (let [raw (t2/select-one-fn :value :setting :key cursor-key)]
    (cond
      (nil? raw)   {}
      (= raw done) done
      :else        (json/decode+kw (encryption/maybe-decrypt raw)))))

(defn- save-cursor! [cursor]
  (let [value (if (= cursor done) done (encryption/maybe-encrypt (json/encode cursor)))]
    (when (zero? (t2/update! :setting {:key cursor-key} {:value value}))
      (t2/insert! :setting {:key cursor-key :value value}))))

(defn- readiness []
  (cond
    (not (encryption/default-encryption-enabled?)) :no-key
    (= done (read-cursor))                         :already-complete
    :else                                          :ready))

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
      (let [deadline        (+ (System/currentTimeMillis) (* 1000 (long run-seconds)))
            {:keys [cursor pages]} (mdb.encryption/rewrite-dwh-derived-columns!
                                    mdb.encryption/encrypt-value (read-cursor) deadline batch-size)]
        (save-cursor! (or cursor done))
        {:status (if cursor :more :complete) :pages pages :cursor cursor}))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Encrypt warehouse-derived columns left over from before the upgrade."}
  EncryptionBackfill [ctx]
  (let [{:keys [status] :as result} (run-batch!)]
    (log/info "Encryption backfill batch complete" result)
    (when (= status :more)
      (schedule-run! (.getScheduler ^JobExecutionContext ctx) continuation-delay-seconds))))

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
