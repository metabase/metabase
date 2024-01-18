(ns metabase.task
  "Background task scheduling via Quartzite. Individual tasks are defined in `metabase.task.*`.

  ## Regarding Task Initialization:

  The most appropriate way to initialize tasks in any `metabase.task.*` namespace is to implement the `task-init`
  function which accepts zero arguments. This function is dynamically resolved and called exactly once when the
  application goes through normal startup procedures. Inside this function you can do any work needed and add your
  task to the scheduler as usual via `schedule-task!`.

  ## Quartz JavaDoc

  Find the JavaDoc for Quartz here: http://www.quartz-scheduler.org/api/2.3.0/index.html"
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.scheduler :as qs]
   [environ.core :as env]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.quartz CronTrigger JobDetail JobKey Scheduler Trigger TriggerKey)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SCHEDULER INSTANCE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defonce ^:dynamic ^{:doc "Override the global Quartz scheduler by binding this var."}
  *quartz-scheduler*
  (atom nil))

(defn- scheduler
  "Fetch the instance of our Quartz scheduler."
  ^Scheduler []
  @*quartz-scheduler*)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            FINDING & LOADING TASKS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti init!
  "Initialize (i.e., schedule) Job(s) with a given name. All implementations of this method are called once and only
  once when the Quartz task scheduler is initialized. Task namespaces (`metabase.task.*`) should add new
  implementations of this method to schedule the jobs they define (i.e., with a call to `schedule-task!`.)

  The dispatch value for this function can be any unique keyword, but by convention is a namespaced keyword version of
  the name of the Job being initialized; for sake of consistency with the Job name itself, the keyword should be left
  CamelCased.

    (defmethod task/init! ::SendPulses [_]
      (task/schedule-task! my-job my-trigger))"
  {:arglists '([job-name-string])}
  keyword)

(defn- find-and-load-task-namespaces!
  "Search Classpath for namespaces that start with `metabase.tasks.`, then `require` them so initialization can happen."
  []
  (doseq [ns-symb u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.task.")]
    (try
      (log/debug "Loading tasks namespace:" (u/format-color 'blue ns-symb))
      (classloader/require ns-symb)
      (catch Throwable e
        (log/errorf e "Error loading tasks namespace %s" ns-symb)))))

(defn- init-tasks!
  "Call all implementations of `init!`"
  []
  (doseq [[k f] (methods init!)]
    (try
      ;; don't bother logging namespace for now, maybe in the future if there's tasks of the same name in multiple
      ;; namespaces we can log it
      (log/infof "Initializing task %s" (u/format-color 'green (name k)) (u/emoji "📆"))
      (f k)
      (catch Throwable e
        (log/error e "Error initializing task {0}" k)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Quartz Scheduler Connection Provider                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Custom `ConnectionProvider` implementation that uses our application DB connection pool to provide connections.

(defrecord ^:private ConnectionProvider []
  org.quartz.utils.ConnectionProvider
  (initialize [_])
  (getConnection [_]
    ;; get a connection from our application DB connection pool. Quartz will close it (i.e., return it to the pool)
    ;; when it's done
    ;;
    ;; very important! Fetch a new connection from the connection pool rather than using currently bound Connection if
    ;; one already exists -- because Quartz will close this connection when done, we don't want to screw up the
    ;; calling block
    ;;
    ;; in a perfect world we could just check whether we're creating a new Connection or not, and if using an existing
    ;; Connection, wrap it in a delegating proxy wrapper that makes `.close()` a no-op but forwards all other methods.
    ;; Now that would be a useful macro!
    (.getConnection mdb.connection/*application-db*))
  (shutdown [_]))

(when-not *compile-files*
  (System/setProperty "org.quartz.dataSource.db.connectionProvider.class" (.getName ConnectionProvider)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Quartz Scheduler Class Load Helper                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- load-class ^Class [^String class-name]
  (Class/forName class-name true (classloader/the-classloader)))

(defrecord ^:private ClassLoadHelper []
  org.quartz.spi.ClassLoadHelper
  (initialize [_])
  (getClassLoader [_]
    (classloader/the-classloader))
  (loadClass [_ class-name]
    (load-class class-name))
  (loadClass [_ class-name _]
    (load-class class-name)))

(when-not *compile-files*
  (System/setProperty "org.quartz.scheduler.classLoadHelper.class" (.getName ClassLoadHelper)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          STARTING/STOPPING SCHEDULER                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)"
  []
  (when (= (mdb/db-type) :postgres)
    (System/setProperty "org.quartz.jobStore.driverDelegateClass" "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate")))

(defn- init-scheduler!
  "Initialize our Quartzite scheduler which allows jobs to be submitted and triggers to scheduled. Puts scheduler in
  standby mode. Call [[start-scheduler!]] to begin running scheduled tasks."
  []
  (classloader/the-classloader)
  (when-not @*quartz-scheduler*
    (set-jdbc-backend-properties!)
    (let [new-scheduler (qs/initialize)]
      (when (compare-and-set! *quartz-scheduler* nil new-scheduler)
        (find-and-load-task-namespaces!)
        (qs/standby new-scheduler)
        (log/info "Task scheduler initialized into standby mode.")
        (init-tasks!)))))

;;; this is a function mostly to facilitate testing.
(defn- disable-scheduler? []
  (some-> (env/env :mb-disable-scheduler) Boolean/parseBoolean))

(defn start-scheduler!
  "Start the task scheduler. Tasks do not run before calling this function."
  []
  (if (disable-scheduler?)
    (log/warn  "Metabase task scheduler disabled. Scheduled tasks will not be ran.")
    (do (init-scheduler!)
        (qs/start (scheduler))
        (log/info "Task scheduler started"))))

(defn stop-scheduler!
  "Stop our Quartzite scheduler and shutdown any running executions."
  []
  (let [[old-scheduler] (reset-vals! *quartz-scheduler* nil)]
    (when old-scheduler
      (qs/shutdown old-scheduler))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           SCHEDULING/DELETING TASKS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private reschedule-task!
  [job :- (ms/InstanceOfClass JobDetail) new-trigger :- (ms/InstanceOfClass Trigger)]
  (try
    (when-let [scheduler (scheduler)]
      (when-let [[^Trigger old-trigger] (seq (qs/get-triggers-of-job scheduler (.getKey ^JobDetail job)))]
        (log/debugf "Rescheduling job %s" (-> ^JobDetail job .getKey .getName))
        (.rescheduleJob scheduler (.getKey old-trigger) new-trigger)))
    (catch Throwable e
      (log/error e "Error rescheduling job"))))

(mu/defn schedule-task!
  "Add a given job and trigger to our scheduler."
  [job :- (ms/InstanceOfClass JobDetail) trigger :- (ms/InstanceOfClass Trigger)]
  (when-let [scheduler (scheduler)]
    (try
      (qs/schedule scheduler job trigger)
      (catch org.quartz.ObjectAlreadyExistsException _
        (log/debug "Job already exists:" (-> ^JobDetail job .getKey .getName))
        (reschedule-task! job trigger)))))

(mu/defn delete-task!
  "delete a task from the scheduler"
  [job-key :- (ms/InstanceOfClass JobKey) trigger-key :- (ms/InstanceOfClass TriggerKey)]
  (when-let [scheduler (scheduler)]
    (qs/delete-trigger scheduler trigger-key)
    (qs/delete-job scheduler job-key)))

(mu/defn add-job!
  "Add a job separately from a trigger, replace if the job is already there"
  [job :- (ms/InstanceOfClass JobDetail)]
  (when-let [scheduler (scheduler)]
    (qs/add-job scheduler job true)))

(mu/defn add-trigger!
  "Add a trigger. Assumes the trigger is already associated to a job (i.e. `trigger/for-job`)"
  [trigger :- (ms/InstanceOfClass Trigger)]
  (when-let [scheduler (scheduler)]
    (qs/add-trigger scheduler trigger)))

(mu/defn delete-trigger!
  "Remove `trigger-key` from the scheduler"
  [trigger-key :- (ms/InstanceOfClass TriggerKey)]
  (when-let [scheduler (scheduler)]
    (qs/delete-trigger scheduler trigger-key)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Scheduler Info                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- job-detail->info [^JobDetail job-detail]
  {:key                              (-> (.getKey job-detail) .getName)
   :class                            (-> (.getJobClass job-detail) .getCanonicalName)
   :description                      (.getDescription job-detail)
   :concurrent-execution-disallowed? (.isConcurrentExectionDisallowed job-detail)
   :durable?                         (.isDurable job-detail)
   :requests-recovery?               (.requestsRecovery job-detail)})

(defmulti ^:private trigger->info
  {:arglists '([trigger])}
  class)

(defmethod trigger->info Trigger
  [^Trigger trigger]
  {:description        (.getDescription trigger)
   :end-time           (.getEndTime trigger)
   :final-fire-time    (.getFinalFireTime trigger)
   :key                (-> (.getKey trigger) .getName)
   :state              (some->> (.getKey trigger) (.getTriggerState (scheduler)) str)
   :next-fire-time     (.getNextFireTime trigger)
   :previous-fire-time (.getPreviousFireTime trigger)
   :priority           (.getPriority trigger)
   :start-time         (.getStartTime trigger)
   :may-fire-again?    (.mayFireAgain trigger)
   :data               (.getJobDataMap trigger)})

(defmethod trigger->info CronTrigger
  [^CronTrigger trigger]
  (assoc
   ((get-method trigger->info Trigger) trigger)
   :schedule
   (.getCronExpression trigger)

   :misfire-instruction
   ;; not 100% sure why `case` doesn't work here...
   (condp = (.getMisfireInstruction trigger)
     CronTrigger/MISFIRE_INSTRUCTION_IGNORE_MISFIRE_POLICY "IGNORE_MISFIRE_POLICY"
     CronTrigger/MISFIRE_INSTRUCTION_SMART_POLICY          "SMART_POLICY"
     CronTrigger/MISFIRE_INSTRUCTION_FIRE_ONCE_NOW         "FIRE_ONCE_NOW"
     CronTrigger/MISFIRE_INSTRUCTION_DO_NOTHING            "DO_NOTHING"
     (format "UNKNOWN: %d" (.getMisfireInstruction trigger)))))

(defn- ->job-key ^JobKey [x]
  (cond
    (instance? JobKey x) x
    (string? x)          (JobKey. ^String x)))

(defn job-info
  "Get info about a specific Job (`job-key` can be either a String or `JobKey`).

    (task/job-info \"metabase.task.sync-and-analyze.job\")"
  [job-key]
  (when-let [scheduler (scheduler)]
    (let [job-key (->job-key job-key)]
      (try
        (assoc (job-detail->info (qs/get-job scheduler job-key))
               :triggers (for [trigger (sort-by #(-> ^Trigger % .getKey .getName)
                                                (qs/get-triggers-of-job scheduler job-key))]
                           (trigger->info trigger)))
        (catch ClassNotFoundException _
          (log/infof "Class not found for Quartz Job %s. This probably means that this job was removed or renamed." (.getName job-key)))
        (catch Throwable e
          (log/warnf e "Error fetching details for Quartz Job: %s" (.getName job-key)))))))

(defn- jobs-info []
  (->> (some-> (scheduler) (.getJobKeys nil))
       (sort-by #(.getName ^JobKey %))
       (map job-info)
       (filter some?)))

(defn scheduler-info
  "Return raw data about all the scheduler and scheduled tasks (i.e. Jobs and Triggers). Primarily for debugging
  purposes."
  []
  {:scheduler (some-> (scheduler) .getMetaData .getSummary str/split-lines)
   :jobs      (jobs-info)})
