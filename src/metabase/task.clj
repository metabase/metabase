(ns metabase.task
  "Background task scheduling via Quartzite. Individual tasks are defined in `metabase.task.*`.

  ## Regarding Task Initialization:

  The most appropriate way to initialize tasks in any `metabase.task.*` namespace is to implement the `task-init`
  function which accepts zero arguments. This function is dynamically resolved and called exactly once when the
  application goes through normal startup procedures. Inside this function you can do any work needed and add your
  task to the scheduler as usual via `schedule-task!`."
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.scheduler :as qs]
            [metabase
             [db :as mdb]
             [util :as u]]
            [puppetlabs.i18n.core :refer [trs]]
            [schema.core :as s])
  (:import [org.quartz JobDetail JobKey Scheduler Trigger TriggerKey]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SCHEDULER INSTANCE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defonce ^:private quartz-scheduler
  (atom nil))

(defn- scheduler
  "Fetch the instance of our Quartz scheduler. Call this function rather than dereffing the atom directly because there
  are a few places (e.g., in tests) where we swap the instance out."
  ;; TODO - why can't we just swap the atom out in the tests?
  ^Scheduler []
  @quartz-scheduler)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            FINDING & LOADING TASKS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- find-and-load-tasks!
  "Search Classpath for namespaces that start with `metabase.tasks.`, then `require` them so initialization can happen."
  []
  (doseq [ns-symb @u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.task.")]
    (log/info (trs "Loading tasks namespace:") (u/format-color 'blue ns-symb) (u/emoji "📆"))
    (require ns-symb)
    ;; look for `task-init` function in the namespace and call it if it exists
    (when-let [init-fn (ns-resolve ns-symb 'task-init)]
      (init-fn))))


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

(defn start-scheduler!
  "Start our Quartzite scheduler which allows jobs to be submitted and triggers to begin executing."
  []
  (when-not @quartz-scheduler
    (set-jdbc-backend-properties!)
    (log/debug (trs "Starting Quartz Scheduler"))
    ;; keep a reference to our scheduler
    (reset! quartz-scheduler (qs/start (qs/initialize)))
    ;; look for job/trigger definitions
    (find-and-load-tasks!)))

(defn stop-scheduler!
  "Stop our Quartzite scheduler and shutdown any running executions."
  []
  (log/debug (trs "Stopping Quartz Scheduler"))
  ;; tell quartz to stop everything
  (when-let [scheduler (scheduler)]
    (qs/shutdown scheduler))
  ;; reset our scheduler reference
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
