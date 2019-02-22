(ns metabase.task
  "Background task scheduling via Quartzite. Individual tasks are defined in `metabase.task.*`.

  ## Regarding Task Initialization:

  The most appropriate way to initialize tasks in any `metabase.task.*` namespace is to implement the `task-init`
  function which accepts zero arguments. This function is dynamically resolved and called exactly once when the
  application goes through normal startup procedures. Inside this function you can do any work needed and add your
  task to the scheduler as usual via `schedule-task!`."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.scheduler :as qs]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import [org.quartz JobDetail JobKey Scheduler Trigger TriggerKey]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SCHEDULER INSTANCE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defonce ^:private quartz-scheduler
  (atom nil))

;; whenever the value of `quartz-scheduler` changes:
;;
;; 1.  shut down the old scheduler, if there was one
;; 2.  start the new scheduler, if there is one
(add-watch
 quartz-scheduler
 ::quartz-scheduler-watcher
 (fn [_ _ old-scheduler new-scheduler]
   (when-not (identical? old-scheduler new-scheduler)
     (when old-scheduler
       (log/debug (trs "Stopping Quartz Scheduler {0}" old-scheduler))
       (qs/shutdown old-scheduler))
     (when new-scheduler
       (log/debug (trs "Starting Quartz Scheduler {0}" new-scheduler))
       (qs/start new-scheduler)))))

(defn- scheduler
  "Fetch the instance of our Quartz scheduler. Call this function rather than dereffing the atom directly because there
  are a few places (e.g., in tests) where we swap the instance out."
  ;; TODO - why can't we just swap the atom out in the tests?
  ^Scheduler []
  @quartz-scheduler)


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

(defn- find-and-load-tasks!
  "Search Classpath for namespaces that start with `metabase.tasks.`, then `require` them so initialization can happen."
  []
  ;; first, load all the task namespaces
  (doseq [ns-symb @u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.task.")]
    (try
      (log/debug (trs "Loading tasks namespace:") (u/format-color 'blue ns-symb))
      (require ns-symb)
      (catch Throwable e
        (log/error e (trs "Error loading tasks namespace {0}" ns-symb)))))
  ;; next, call all implementations of `init!`
  (doseq [[k f] (methods init!)]
    (try
      ;; don't bother logging namespace for now, maybe in the future if there's tasks of the same name in multiple
      ;; namespaces we can log it
      (log/info (trs "Initializing task {0}" (u/format-color 'green (name k))) (u/emoji "📆"))
      (f k)
      (catch Throwable e
        (log/error e (trs "Error initializing task {0}" k))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          STARTING/STOPPING SCHEDULER                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)"
  []
  (let [{:keys [classname user password subname subprotocol type]} (mdb/jdbc-details)]
    ;; If we're using a Postgres application DB the driverDelegateClass has to be the Postgres-specific one rather
    ;; than the Standard JDBC one we define in `quartz.properties`
    (when (= type :postgres)
      (System/setProperty "org.quartz.jobStore.driverDelegateClass" "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate"))
    ;; set other properties like URL, user, and password so Quartz knows how to connect
    (doseq [[k, ^String v] {:driver   classname
                            :URL      (str "jdbc:" subprotocol \: subname)
                            :user     user
                            :password password}]
      (when v
        (System/setProperty (str "org.quartz.dataSource.db." (name k)) v)))))

(def ^:private start-scheduler-lock (Object.))

(defn start-scheduler!
  "Start our Quartzite scheduler which allows jobs to be submitted and triggers to begin executing."
  []
  (when-not @quartz-scheduler
    (locking start-scheduler-lock
      (when-not @quartz-scheduler
        (set-jdbc-backend-properties!)
        ;; keep a reference to our scheduler
        (reset! quartz-scheduler (qs/initialize))
        ;; look for job/trigger definitions
        (find-and-load-tasks!)))))

(defn stop-scheduler!
  "Stop our Quartzite scheduler and shutdown any running executions."
  []
  ;; setting `quartz-scheduler` to nil will cause it to shut down via the watcher on it
  (reset! quartz-scheduler nil))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           SCHEDULING/DELETING TASKS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn schedule-task!
  "Add a given job and trigger to our scheduler."
  [job :- JobDetail, trigger :- Trigger]
  (when-let [scheduler (scheduler)]
    (try
      (qs/schedule scheduler job trigger)
      (catch org.quartz.ObjectAlreadyExistsException _
        (log/info (trs "Job already exists:") (-> job .getKey .getName))))))

(s/defn delete-task!
  "delete a task from the scheduler"
  [job-key :- JobKey, trigger-key :- TriggerKey]
  (when-let [scheduler (scheduler)]
    (qs/delete-trigger scheduler trigger-key)
    (qs/delete-job scheduler job-key)))

(s/defn add-job!
  "Add a job separately from a trigger, replace if the job is already there"
  [job :- JobDetail]
  (when-let [scheduler (scheduler)]
    (qs/add-job scheduler job true)))

(s/defn add-trigger!
  "Add a trigger. Assumes the trigger is already associated to a job (i.e. `trigger/for-job`)"
  [trigger :- Trigger]
  (when-let [scheduler (scheduler)]
    (qs/add-trigger scheduler trigger)))

(s/defn delete-trigger!
  "Remove `trigger-key` from the scheduler"
  [trigger-key :- TriggerKey]
  (when-let [scheduler (scheduler)]
    (qs/delete-trigger scheduler trigger-key)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Scheduler Info                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- job-detail->info [^JobDetail job-detail]
  {:key                                (-> (.getKey job-detail) .getName)
   :class                              (-> (.getJobClass job-detail) .getCanonicalName)
   :description                        (.getDescription job-detail)
   :concurrent-executation-disallowed? (.isConcurrentExectionDisallowed job-detail)
   :durable?                           (.isDurable job-detail)
   :requests-recovery?                 (.requestsRecovery job-detail)})

(defn- trigger->info [^Trigger trigger]
  {:description        (.getDescription trigger)
   :end-time           (.getEndTime trigger)
   :final-fire-time    (.getFinalFireTime trigger)
   :key                (-> (.getKey trigger) .getName)
   :state              (some->> (.getKey trigger) (.getTriggerState (scheduler)) str)
   :next-fire-time     (.getNextFireTime trigger)
   :previous-fire-time (.getPreviousFireTime trigger)
   :priority           (.getPriority trigger)
   :start-time         (.getStartTime trigger)
   :may-fire-again?    (.mayFireAgain trigger)})

(defn scheduler-info
  "Return raw data about all the scheduler and scheduled tasks (i.e. Jobs and Triggers). Primarily for debugging
  purposes."
  []
  {:scheduler
   (str/split-lines (.getSummary (.getMetaData (scheduler))))

   :jobs
   (for [^JobKey job-key (->> (.getJobKeys (scheduler) nil)
                              (sort-by #(.getName ^JobKey %) ))]
     (assoc (job-detail->info (qs/get-job (scheduler) job-key))
       :triggers (for [trigger (->> (qs/get-triggers-of-job (scheduler) job-key)
                                    (sort-by #(-> ^Trigger % .getKey .getName)))]
                   (trigger->info trigger))))})
