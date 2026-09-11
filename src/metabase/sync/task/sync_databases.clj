(ns metabase.sync.task.sync-databases
  "Scheduled tasks for syncing metadata/analyzing and caching FieldValues for connected Databases.

  There always UpdateFieldValues and SyncAndAnalyzeDatabase jobs present. Databases add triggers to these jobs. And
  those triggers include a database id."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [java-time.api :as t]
   [metabase.audit-app.core :as audit]
   [metabase.config.core :as config]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.db :as sync.db]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.task.sync-databases-trigger :as sync-databases-trigger]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.core :as warehouses])
  (:import
   (org.quartz
    JobDetail)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   JOB LOGIC                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- job-context->database-id :- [:maybe ::lib.schema.id/database]
  "Get the Database ID referred to in `job-context`."
  [job-context]
  (u/the-id (get (qc/from-job-data job-context) "db-id")))

;; The DisallowConcurrentExecution on the two defrecords below attaches an annotation to the generated class that will
;; constrain the job execution to only be one at a time. Other triggers wanting the job to run will misfire.

(def ^:private analyze-duration-threshold-for-refingerprinting
  "If the `analyze-db!` step is shorter than this number of `minutes`, then we may refingerprint fields."
  5)

(defn- should-refingerprint-fields?
  "Whether to refingerprint fields in the database. Looks at the runtime of the last analysis and if any fields were
  fingerprinted. If no fields were fingerprinted and the run was shorter than the threshold, it will re-fingerprint
  some fields."
  [{:keys [start-time end-time steps] :as _analyze-results}]
  (let [attempted (some->> steps
                           (filter (fn [[step-name _results]] (= step-name "fingerprint-fields")))
                           first
                           second
                           :fingerprints-attempted)]
    (and (number? attempted)
         (zero? attempted)
         start-time
         end-time
         (< (.toMinutes (t/duration start-time end-time)) analyze-duration-threshold-for-refingerprinting))))

(defn- sync-and-analyze-database*!
  [database-id]
  (log/infof "Starting sync task for Database %d." database-id)
  (when-let [database (or (sync.db/database database-id)
                          (do
                            (sync-databases-trigger/unschedule-tasks-for-db! (mi/instance :model/Database {:id database-id}))
                            (log/warnf "Cannot sync Database %d: Database does not exist." database-id)))]
    (if-let [ex (try
                  ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
                  ;; purposes of creating a new H2 database.
                  (binding [driver.settings/*allow-testing-h2-connections* true
                            driver.settings/*allow-testing-sqlite-connections* true]
                    (driver.u/can-connect-with-details? (:engine database) (:details database) :throw-exceptions))
                  nil
                  (catch Throwable e
                    e))]
      (log/warnf "Cannot sync Database %d: %s" database-id (ex-message ex))
      (database-routing/with-database-routing-off
        (let [db-id            (:id database)
              metadata-results (tracing/with-span :sync "sync.metadata" {:db/id db-id}
                                 (sync-metadata/sync-db-metadata! database))
              analyze-results  (when (:is_full_sync database)
                                 (tracing/with-span :sync "sync.analyze" {:db/id db-id}
                                   (analyze/analyze-db! database)))
              refingerprint-results (when (and (:refingerprint database)
                                               (should-refingerprint-fields? analyze-results))
                                      (tracing/with-span :sync "sync.refingerprint" {:db/id db-id}
                                        (analyze/refingerprint-db! database)))]
          (cond-> {:metadata-results metadata-results}
            analyze-results (assoc :analyze-results analyze-results)
            refingerprint-results (assoc :refingerprint-results refingerprint-results)))))))

(defn- sync-and-analyze-database!
  "The sync and analyze database job, as a function that can be used in a test"
  [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (cond
      (warehouses/disable-auto-sync)
      (log/debugf "Skipping scheduled sync for Database %d: disable-auto-sync is on." database-id)

      (= audit/audit-db-id database-id)
      (do
        (log/warn "Cannot sync Database: It is the audit db.")
        (when-not config/is-prod?
          (throw (ex-info "Cannot sync Database: It is the audit db."
                          {:database-id database-id
                           :raw-job-context job-context
                           :job-context (pr-str job-context)}))))

      (sync.db/database-stub? database-id)
      (log/warnf "Skipping scheduled sync for Database %d: it is a stub." database-id)

      :else
      (sync-and-analyze-database*! database-id))))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Sync and analyze the database"}
  SyncAndAnalyzeDatabase [job-context]
  (sync-and-analyze-database! job-context))

(defn- update-field-values!
  "The update field values job, as a function that can be used in a test"
  [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (if (warehouses/disable-auto-sync)
      (log/debugf "Skipping scheduled field-values update for Database %d: disable-auto-sync is on." database-id)
      (do
        (log/infof "Update Field values task triggered for Database %d." database-id)
        (when-let [database (or (sync.db/database database-id)
                                (do
                                  (sync-databases-trigger/unschedule-tasks-for-db! (mi/instance :model/Database {:id database-id}))
                                  (log/warnf "Cannot update Field values for Database %d: Database does not exist." database-id)))]
          (if (:is_full_sync database)
            (sync.field-values/update-field-values! database)
            (log/infof "Skipping update, automatic Field value updates are disabled for Database %d." database-id)))))))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Update field values"}
  UpdateFieldValues [job-context]
  (update-field-values! job-context))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                JOB DEFINITIONS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(mr/def ::class
  [:fn {:error/message "a Class"} class?])

(mu/defn- job :- (ms/InstanceOfClass JobDetail)
  "Build a durable Quartz Job for `task-info`. Durable in Quartz allows the job to exist even if there are no triggers
  for it."
  ^JobDetail [task-info :- sync-databases-trigger/TaskInfo
              job-class :- ::class]
  (jobs/build
   (jobs/with-description (sync-databases-trigger/job-description task-info))
   (jobs/of-type job-class)
   (jobs/with-identity (sync-databases-trigger/job-key task-info))
   (jobs/store-durably)))

(def ^:private sync-analyze-job (job sync-databases-trigger/sync-analyze-task-info SyncAndAnalyzeDatabase))
(def ^:private field-values-job (job sync-databases-trigger/field-values-task-info UpdateFieldValues))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              TASK INITIALIZATION                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- job-init
  "Separated from `task-init` primarily as it's useful in testing. Adds the sync and field-values job that all of the
  triggers will use"
  []
  (task/add-job! sync-analyze-job)
  (task/add-job! field-values-job))

(defn- metabase-controls-schedule?
  "Predicate returning if the user does not manually set sync schedules and leaves it to metabase."
  [database]
  (not (-> database :details :let-user-control-scheduling)))

(defn- randomize-db-schedules-if-needed!
  []
  ;; todo: when we can use json operations on h2 we can check details in the query and drop the transducer
  (transduce (comp (map (partial mi/do-after-select :model/Database))
                   (filter metabase-controls-schedule?))
             (fn
               ([] 0)
               ([counter]
                (log/infof "Updated default schedules for %d databases" counter)
                counter)
               ([counter db]
                (try
                  (sync.db/update-database! (u/the-id db)
                                            (sync.schedules/schedule-map->cron-strings
                                             ;; TODO (edpaget): this can go away after this patch is deployed to cloud
                                             (if (= sync.schedules/old-sample-metadata-sync-schedule-cron-string
                                                    (:metadata_sync_schedule db))
                                               (sync.schedules/default-randomized-schedule {:excluded-minute 43})
                                               (sync.schedules/default-randomized-schedule))))
                  (inc counter)
                  (catch Exception e
                    (log/warnf "Error updating database %d for randomized schedules: %s" (u/the-id db) (ex-message e))
                    counter))))
             (sync.db/databases-with-schedules-reducible
              sync.schedules/old-sample-metadata-sync-schedule-cron-string
              sync.schedules/default-metadata-sync-schedule-cron-strings
              sync.schedules/default-cache-field-values-schedule-cron-strings)))

(defmethod task/init! ::SyncDatabases
  [_]
  (job-init)
  (randomize-db-schedules-if-needed!))
