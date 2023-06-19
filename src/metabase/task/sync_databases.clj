(ns metabase.task.sync-databases
  "Scheduled tasks for syncing metadata/analyzing and caching FieldValues for connected Databases.

  There always UpdateFieldValues and SyncAndAnalyzeDatabase jobs present. Databases add triggers to these jobs. And
  those triggers include a database id."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time :as t]
   [metabase.db.query :as mdb.query]
   [metabase.models.database :as database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.field-values :as field-values]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (org.quartz CronTrigger JobDetail JobKey TriggerKey)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   JOB LOGIC                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare unschedule-tasks-for-db!)

(s/defn ^:private job-context->database-id :- (s/maybe su/IntGreaterThanZero)
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

(defn- sync-and-analyze-database!
  "The sync and analyze database job, as a function that can be used in a test"
  [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (log/info (trs "Starting sync task for Database {0}." database-id))
    (when-let [database (or (t2/select-one Database :id database-id)
                            (do
                              (unschedule-tasks-for-db! (mi/instance Database {:id database-id}))
                              (log/warn (trs "Cannot sync Database {0}: Database does not exist." database-id))))]
      (sync-metadata/sync-db-metadata! database)
      ;; only run analysis if this is a "full sync" database
      (when (:is_full_sync database)
        (let [results (analyze/analyze-db! database)]
          (when (and (:refingerprint database) (should-refingerprint-fields? results))
            (analyze/refingerprint-db! database)))))))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Sync and analyze the database"}
  SyncAndAnalyzeDatabase [job-context]
  (sync-and-analyze-database! job-context))

(defn- update-field-values!
  "The update field values job, as a function that can be used in a test"
  [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (log/info (trs "Update Field values task triggered for Database {0}." database-id))
    (when-let [database (or (t2/select-one Database :id database-id)
                            (do
                              (unschedule-tasks-for-db! (mi/instance Database {:id database-id}))
                              (log/warn "Cannot update Field values for Database {0}: Database does not exist." database-id)))]
      (if (:is_full_sync database)
        (field-values/update-field-values! database)
        (log/info (trs "Skipping update, automatic Field value updates are disabled for Database {0}." database-id))))))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Update field values"}
  UpdateFieldValues [job-context]
  (update-field-values! job-context))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         TASK INFO AND GETTER FUNCTIONS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private TaskInfo
  "One-off schema for information about the various sync tasks we run for a DB."
  {:key                s/Keyword
   :db-schedule-column s/Keyword
   :job-class          Class})

(s/def ^:private sync-analyze-task-info :- TaskInfo
  {:key                :sync-and-analyze
   :db-schedule-column :metadata_sync_schedule
   :job-class          SyncAndAnalyzeDatabase})

(s/def ^:private field-values-task-info :- TaskInfo
  {:key                :update-field-values
   :db-schedule-column :cache_field_values_schedule
   :job-class          UpdateFieldValues})


;; These getter functions are not strictly necessary but are provided primarily so we can get some extra validation by
;; using them

(s/defn ^:private job-key :- JobKey
  "Return an appropriate string key for the job described by `task-info` for `database-or-id`."
  [task-info :- TaskInfo]
  (jobs/key (format "metabase.task.%s.job" (name (:key task-info)))))

(s/defn ^:private trigger-key :- TriggerKey
  "Return an appropriate string key for the trigger for `task-info` and `database-or-id`."
  [database :- (mi/InstanceOf Database) task-info :- TaskInfo]
  (triggers/key (format "metabase.task.%s.trigger.%d" (name (:key task-info)) (u/the-id database))))

(s/defn ^:private cron-schedule :- u.cron/CronScheduleString
  "Fetch the appropriate cron schedule string for `database` and `task-info`."
  [database :- (mi/InstanceOf Database) task-info :- TaskInfo]
  (get database (:db-schedule-column task-info)))

(s/defn ^:private job-class :- Class
  "Get the Job class for `task-info`."
  [task-info :- TaskInfo]
  (:job-class task-info))

(s/defn ^:private trigger-description :- s/Str
  "Return an appropriate description string for a job/trigger for Database described by `task-info`."
  [database :- (mi/InstanceOf Database) task-info :- TaskInfo]
  (format "%s Database %d" (name (:key task-info)) (u/the-id database)))

(s/defn ^:private job-description :- s/Str
  "Return an appropriate description string for a job"
  [task-info :- TaskInfo]
  (format "%s for all databases" (name (:key task-info))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            DELETING TASKS FOR A DB                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private delete-task!
  "Cancel a single sync task for `database-or-id` and `task-info`."
  [database :- (mi/InstanceOf Database) task-info :- TaskInfo]
  (let [trigger-key (trigger-key database task-info)]
    (log/debug (u/format-color 'red
                   (trs "Unscheduling task for Database {0}: trigger: {1}" (u/the-id database) (.getName trigger-key))))
    (task/delete-trigger! trigger-key)))

(s/defn unschedule-tasks-for-db!
  "Cancel *all* scheduled sync and FieldValues caching tasks for `database-or-id`."
  [database :- (mi/InstanceOf Database)]
  (doseq [task [sync-analyze-task-info field-values-task-info]]
    (delete-task! database task)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         (RE)SCHEDULING TASKS FOR A DB                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private job :- JobDetail
  "Build a durable Quartz Job for `task-info`. Durable in Quartz allows the job to exist even if there are no triggers
  for it."
  [task-info :- TaskInfo]
  (jobs/build
   (jobs/with-description (job-description task-info))
   (jobs/of-type (job-class task-info))
   (jobs/with-identity (job-key task-info))
   (jobs/store-durably)))

(s/def ^:private sync-analyze-job (job sync-analyze-task-info))
(s/def ^:private field-values-job (job field-values-task-info))

(s/defn ^:private trigger :- CronTrigger
  "Build a Quartz Trigger for `database` and `task-info`."
  [database :- (mi/InstanceOf Database) task-info :- TaskInfo]
  (triggers/build
   (triggers/with-description (trigger-description database task-info))
   (triggers/with-identity (trigger-key database task-info))
   (triggers/using-job-data {"db-id" (u/the-id database)})
   (triggers/for-job (job-key task-info))
   (triggers/start-now)
   (triggers/with-schedule
     (cron/schedule
      (cron/cron-schedule (cron-schedule database task-info))
      ;; if we miss a sync for one reason or another (such as system being down) do not try to run the sync again.
      ;; Just wait until the next sync cycle.
      ;;
      ;; See https://www.nurkiewicz.com/2012/04/quartz-scheduler-misfire-instructions.html for more info
      (cron/with-misfire-handling-instruction-do-nothing)))))

;; called [[from metabase.models.database/schedule-tasks!]] from the post-insert and the pre-update
#_ {:clj-kondo/ignore [:unused-private-var]}
(s/defn ^:private check-and-schedule-tasks-for-db!
  "Schedule a new Quartz job for `database` and `task-info` if it doesn't already exist or is incorrect."
  [database :- (mi/InstanceOf Database)]
  (let [sync-job (task/job-info (job-key sync-analyze-task-info))
        fv-job   (task/job-info (job-key field-values-task-info))

        sync-trigger (trigger database sync-analyze-task-info)
        fv-trigger   (trigger database field-values-task-info)

        existing-sync-trigger (some (fn [trigger] (when (= (:key trigger) (.. sync-trigger getKey getName))
                                                    trigger))
                                    (:triggers sync-job))
        existing-fv-trigger   (some (fn [trigger] (when (= (:key trigger) (.. fv-trigger getKey getName))
                                                    trigger))
                                    (:triggers fv-job))]

    (doseq [{:keys [existing-trigger existing-schedule ti trigger description]}
            [{:existing-trigger  existing-sync-trigger
              :existing-schedule (:metadata_sync_schedule database)
              :ti                sync-analyze-task-info
              :trigger           sync-trigger
              :description       "sync/analyze"}
             {:existing-trigger  existing-fv-trigger
              :existing-schedule (:cache_field_values_schedule database)
              :ti                field-values-task-info
              :trigger           fv-trigger
              :description       "field-values"}]]
      (when (or (not existing-trigger)
                (not= (:schedule existing-trigger) existing-schedule))
        (delete-task! database ti)
        (log/info
         (u/format-color 'green "Scheduling %s for database %d: trigger: %s"
                         description (u/the-id database) (.. ^org.quartz.Trigger trigger getKey getName)))
        ;; now (re)schedule the task
        (task/add-trigger! trigger)))))


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

(defn- randomize-db-schedules-if-needed
  []
  ;; todo: when we can use json operations on h2 we can check details in the query and drop the transducer
  (transduce (comp (map (partial mi/do-post-select Database))
                   (filter metabase-controls-schedule?))
             (fn
               ([] 0)
               ([counter]
                (log/info (trs "Updated default schedules for {0} databases" counter))
                counter)
               ([counter db]
                (try
                  (t2/update! Database (u/the-id db)
                    (sync.schedules/schedule-map->cron-strings
                     (sync.schedules/default-randomized-schedule)))
                  (inc counter)
                  (catch Exception e
                    (log/warn e
                              (trs "Error updating database {0} for randomized schedules"
                                   (u/the-id db)))
                    counter))))
             (mdb.query/reducible-query
              {:select [:id :details]
               :from   [:metabase_database]
               :where  [:or
                        [:in
                         :metadata_sync_schedule
                         sync.schedules/default-metadata-sync-schedule-cron-strings]
                        [:in
                         :cache_field_values_schedule
                         sync.schedules/default-cache-field-values-schedule-cron-strings]]})))

(defmethod task/init! ::SyncDatabases
  [_]
  (job-init)
  (randomize-db-schedules-if-needed))
