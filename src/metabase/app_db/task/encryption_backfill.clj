(ns metabase.app-db.task.encryption-backfill
  "Encrypts the warehouse-derived columns that already existed when an instance upgraded to v64. Nothing else
  converts them, and there can be millions, so it runs in the background rather than on the boot path."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.task.core :as task]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private batch-size
  "Rows per page. Bounded by memory rather than throughput: a page of `metabase_fieldvalues` can be ~50MB."
  500)

(def ^:private run-seconds
  "How long one run works for. A budget rather than a page count, because a fingerprint page takes ~45ms and a field
  values page ~2s."
  10)

(def ^:private startup-delay-seconds 30)

(def ^:private interval-seconds
  "How often the job fires. `DisallowConcurrentExecution` keeps a slow run from overlapping the next fire."
  20)

(def ^:private job-key (jobs/key "metabase.task.encryption-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.encryption-backfill.trigger"))

(defn- readiness []
  (cond
    (not (encryption/default-encryption-enabled?))                    :no-key
    (mdb.encryption/sweep-complete? (mdb.encryption/read-backfill-progress))   :already-complete
    :else                                                             :ready))

(defn- log-skip [reason]
  (case reason
    :no-key           (log/debug "Skipping encryption backfill because MB_ENCRYPTION_SECRET_KEY is not set.")
    :already-complete (log/debug "Encryption backfill already complete.")
    nil))

(defn- run-batch!
  "Convert for at most [[run-seconds]]. Returns a result map whose `:status` says whether there is work left."
  []
  (let [reason (readiness)]
    (if (not= reason :ready)
      {:status :skipped :reason reason}
      (let [deadline (+ (System/currentTimeMillis) (* 1000 (long run-seconds)))
            {:keys [progress] :as result} (mdb.encryption/rewrite-dwh-derived-columns!
                                           mdb.encryption/encrypt-value (mdb.encryption/read-backfill-progress) deadline batch-size)]
        (mdb.encryption/save-backfill-progress! progress)
        (assoc result :status (if (mdb.encryption/sweep-complete? progress) :complete :more))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Encrypt warehouse-derived columns left over from before the upgrade."}
  EncryptionBackfill [_ctx]
  (let [{:keys [status reason] :as result} (run-batch!)]
    (case status
      ;; the trigger repeats, so there is nothing to reschedule; just stop it once there is no more work
      :more     (log/info "Encryption backfill in progress" (dissoc result :status))
      :complete (do (log/info "Encryption backfill finished" (dissoc result :status))
                    (task/delete-task! job-key trigger-key))
      :skipped  (do (log-skip reason)
                    (task/delete-task! job-key trigger-key)))))

(defn- build-job []
  (jobs/build
   (jobs/with-description "Encrypt warehouse-derived columns left over from before the upgrade")
   (jobs/of-type EncryptionBackfill)
   (jobs/with-identity job-key)))

(defn- build-trigger []
  (triggers/build
   (triggers/with-identity trigger-key)
   (triggers/for-job job-key)
   (triggers/start-at (Date/from (.plusSeconds (Instant/now) (long startup-delay-seconds))))
   (triggers/with-schedule
    (simple/schedule
     (simple/with-interval-in-seconds interval-seconds)
     (simple/repeat-forever)))))

(defmethod task/init! ::EncryptionBackfill
  [_]
  (let [reason (readiness)]
    (if (= reason :ready)
      (task/schedule-task! (build-job) (build-trigger))
      (log-skip reason))))
