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
   [metabase.config.core :as config]
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

;; Stored as a raw `setting` row rather than a `defsetting`, for the same reason `encryption-check` is: the app-db
;; module can't depend on the settings module without a cycle.
(def ^:private cursor-key "encryption-backfill-cursor")
(def ^:private done "done")

(def ^:private job-key (jobs/key "metabase.task.encryption-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.encryption-backfill.trigger"))

(defn- batch-size []
  (or (config/config-int :mb-encryption-backfill-batch-size) 500))

(defn- run-seconds []
  (or (config/config-int :mb-encryption-backfill-run-seconds) 10))

(defn- delay-seconds []
  (or (config/config-int :mb-encryption-backfill-delay-seconds) 20))

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

(declare schedule-run!)

(defn- run-batch!
  "Convert for at most `run-seconds`. Returns true when there is more to do."
  []
  (let [cursor (read-cursor)]
    (if (= cursor done)
      false
      (let [deadline (+ (System/currentTimeMillis) (* 1000 (long (run-seconds))))
            next     (mdb.encryption/rewrite-dwh-derived-columns!
                      mdb.encryption/encrypt-value cursor deadline (batch-size))]
        (save-cursor! (or next done))
        (some? next)))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Encrypt warehouse-derived columns left over from before the upgrade."}
  EncryptionBackfill [ctx]
  (when (run-batch!)
    (schedule-run! (.getScheduler ^JobExecutionContext ctx) (delay-seconds))))

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
  (cond
    (not (encryption/default-encryption-enabled?))
    (log/debug "Skipping encryption backfill because MB_ENCRYPTION_SECRET_KEY is not set.")

    (= done (read-cursor))
    (log/debug "Encryption backfill already complete.")

    :else
    (schedule-run! (task/scheduler) (delay-seconds))))
