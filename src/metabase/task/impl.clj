(ns metabase.task.impl
  "Background task scheduling via Quartzite. Individual tasks are defined in `metabase.<module>.task.*`.

  ## Regarding Task Initialization:

  The most appropriate way to initialize tasks in any `metabase.<module>.task.*` namespace is to implement
  the [[init!]] multimethod in your `<module>.task.<task>` namespace, then add that namespace to `<module>.init`, and
  add `<module>.init` to `core.init` (as needed). All implementations of this method are called when the application
  goes through normal startup procedures. Inside this function you can do any work needed and add your task to the
  scheduler as usual via `schedule-task!`.

  ## Documentation

  For more detailed information about using Quartz in Metabase, including examples and best practices,
  see the [QUARTZ.md](src/metabase/task/QUARTZ.md) documentation.

  ## Quartz JavaDoc

  Find the JavaDoc for Quartz here: http://www.quartz-scheduler.org/api/2.3.0/index.html"
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [environ.core :as env]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.quartz]
   [metabase.classloader.core :as classloader]
   [metabase.task.job-factory :as job-factory]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.quartz CronTrigger JobDetail JobExecutionContext JobExecutionException JobKey JobListener
               JobPersistenceException ObjectAlreadyExistsException Scheduler Trigger TriggerKey
               TriggerListener)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SCHEDULER INSTANCE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(defonce ^:dynamic ^{:doc "Override the global Quartz scheduler by binding this var."}
  *quartz-scheduler*
  (atom nil))

(defn scheduler
  "Fetch the instance of our Quartz scheduler."
  ^Scheduler []
  @*quartz-scheduler*)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            FINDING & LOADING TASKS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti init!
  "Initialize (i.e., schedule) Job(s) with a given name. All implementations of this method are called once and only
  once when the Quartz task scheduler is initialized. Task namespaces (`metabase.<module>.task.*`) should add new
  implementations of this method to schedule the jobs they define (i.e., with a call to `schedule-task!`.)

  The dispatch value for this function can be any unique keyword, but by convention is a namespaced keyword version of
  the name of the Job being initialized; for sake of consistency with the Job name itself, the keyword should be left
  CamelCased.

    (defmethod task/init! ::SendPulses [_]
      (task/schedule-task! my-job my-trigger))"
  {:arglists '([job-name-string])}
  keyword)

(defn- init-tasks!
  "Call all implementations of `init!`"
  []
  (doseq [[k f] (methods init!)]
    (try
      ;; don't bother logging namespace for now, maybe in the future if there's tasks of the same name in multiple
      ;; namespaces we can log it
      (log/info "Initializing task" (u/format-color 'green (name k)) (u/emoji "📆"))
      (f k)
      (catch Throwable e
        (log/errorf "Error initializing task %s: %s" k (ex-message e))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          STARTING/STOPPING SCHEDULER                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- set-jdbc-backend-properties! []
  (metabase.app-db.quartz/set-jdbc-backend-properties! (mdb/db-type)))

(defn- no-class-message
  "The log message for deleting the job under `job-key`, whose class can't be found."
  [job-key class-not-found-message]
  (let [{:keys [new-key release change]} (metabase.app-db.quartz/job-key-rename job-key)]
    (cond-> (format "Deleting job %s due to class not found (%s)" job-key class-not-found-message)
      new-key (str (format ". Its key was renamed to %s in %s. %s" new-key release change)))))

(defn- delete-jobs-with-no-class!
  "Delete any jobs that have been scheduled but whose class is no longer available."
  []
  (when-let [scheduler (scheduler)]
    (doseq [job-key (.getJobKeys scheduler nil)]
      (try
        (qs/get-job scheduler job-key)
        (catch JobPersistenceException e
          (when (instance? ClassNotFoundException (.getCause e))
            (log/warn (no-class-message (.getName ^JobKey job-key) (ex-message (.getCause e))))
            (qs/delete-job scheduler job-key)))))))

(defn- reset-errored-triggers!
  "Quartz does not play well with rolling updates. For example, if a new instance adds and schedules a new job, an older
  instance may pick this up, but be unable to construct the job. It will then put the trigger into the `ERROR` state,
  from which it will never recover.

  Actually fixing this odd and undesirable behavior would be the ideal solution, but as a stopgap, let's just
  automatically reset all `ERROR`ed triggers to `WAITING` on startup."
  [^Scheduler scheduler]
  (doseq [^TriggerKey tk (.getTriggerKeys scheduler nil)]
    ;; From dox: "Only affects triggers that are in ERROR state - if identified trigger is not
    ;; in that state then the result is a no-op."
    (.resetTriggerFromErrorState scheduler tk)))

(defn init-scheduler!
  "Initialize our Quartzite scheduler which allows jobs to be submitted and triggers to scheduled. Puts scheduler in
  standby mode. Call [[start-scheduler!]] to begin running scheduled tasks."
  []
  (classloader/the-classloader)
  (when-not @*quartz-scheduler*
    (set-jdbc-backend-properties!)
    (let [new-scheduler (qs/initialize)]
      (when (compare-and-set! *quartz-scheduler* nil new-scheduler)
        (qs/standby new-scheduler)
        (job-factory/add-to-scheduler new-scheduler)
        (log/info "Task scheduler initialized into standby mode.")
        ;; Register Prometheus listeners

        (delete-jobs-with-no-class!)
        (reset-errored-triggers! new-scheduler)
        (init-tasks!)))))

(defn scheduler-disabled?
  "Whether the task scheduler is explicitly disabled via the `MB_DISABLE_SCHEDULER` env var. When true the
  scheduler is still initialized (in standby mode, so the Quartz job store stays writable) but is never
  started, so no triggers ever fire on this node."
  []
  (boolean (some-> (env/env :mb-disable-scheduler) Boolean/parseBoolean)))

(defn start-scheduler!
  "Start the task scheduler. Tasks do not run before calling this function."
  []
  (if (scheduler-disabled?)
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

(mu/defn- reschedule-task!
  "Assuming that [[job]] is already registered, ensure that [[new-trigger]] is scheduled to trigger it."
  [^Scheduler scheduler   :- (ms/InstanceOfClass Scheduler)
   job         :- (ms/InstanceOfClass JobDetail)
   new-trigger :- (ms/InstanceOfClass Trigger)]
  (try
    (let [job-key          (.getKey ^JobDetail job)
          new-trigger-key  (.getKey ^Trigger new-trigger)
          triggers         (try (qs/get-triggers-of-job scheduler job-key) (catch Exception _))
          matching-trigger (first (filter (comp #{new-trigger-key} #(.getKey ^Trigger %)) triggers))
          replaced-trigger (or matching-trigger (first triggers))]
      (log/debugf "Rescheduling job %s" (.getName job-key))
      (if-not replaced-trigger
        (.scheduleJob scheduler new-trigger)
        (let [replaced-key (.getKey ^Trigger replaced-trigger)]
          (when-not matching-trigger
            (log/warnf "Replacing trigger %s with trigger %s%s"
                       (.getName replaced-key)
                       (.getName new-trigger-key)
                       (when (> (count triggers) 1)
                         ;; We probably want more intuitive rescheduling semantics for multi-trigger jobs...
                         ;; Ideally we would pass *all* the new triggers at once, so we can match them up atomically.
                         ;; The current behavior is especially confounding if replacing N triggers with M ones.
                         (str " (chosen randomly from " (count triggers) " existing ones)"))))
          (.rescheduleJob scheduler replaced-key new-trigger))))
    (catch Throwable e
      (log/errorf "Error rescheduling job: %s" (ex-message e)))))

(mu/defn reschedule-trigger!
  "Reschedule a trigger with the same key as the given trigger.

  Used to update trigger properties like priority."
  [trigger :- (ms/InstanceOfClass Trigger)]
  (when-let [scheduler (scheduler)]
    (.rescheduleJob scheduler (.getKey ^Trigger trigger) trigger)))

(mu/defn schedule-task!
  "Add a given job and trigger to our scheduler."
  ([job     :- (ms/InstanceOfClass JobDetail)
    trigger :- (ms/InstanceOfClass Trigger)]
   (schedule-task! (scheduler) job trigger))
  ([scheduler :- [:maybe (ms/InstanceOfClass Scheduler)]
    job       :- (ms/InstanceOfClass JobDetail)
    trigger   :- (ms/InstanceOfClass Trigger)]
   (when scheduler
     (try
       (qs/schedule scheduler job trigger)
       (catch ObjectAlreadyExistsException _
         (log/debug "Job already exists:" (-> ^JobDetail job .getKey .getName))
         (reschedule-task! scheduler job trigger))))))

(mu/defn trigger-now!
  "Immediately trigger execution of task"
  [job-key :- (ms/InstanceOfClass JobKey)]
  (try
    (when-let [scheduler (scheduler)]
      (.triggerJob scheduler job-key))
    (catch Throwable e
      (log/errorf "Failed to trigger immediate execution of task %s: %s" job-key (ex-message e)))))

(mu/defn delete-task!
  "Delete a task from the scheduler"
  [job-key :- (ms/InstanceOfClass JobKey) trigger-key :- (ms/InstanceOfClass TriggerKey)]
  (when-let [scheduler (scheduler)]
    (qs/delete-trigger scheduler trigger-key)
    (qs/delete-job scheduler job-key)))

(defn- job-definition
  "The parts of `job` that Quartz stores and reads back."
  [^JobDetail job]
  ;; Quartz also stores whether the class disallows concurrent execution and persists its job data.
  ;; It reads neither column back, and takes both from the loaded class's annotations, so they are left out.
  {:class              (.getJobClass job)
   :data               (into {} (.getJobDataMap job))
   :description        (.getDescription job)
   :durable?           (.isDurable job)
   :requests-recovery? (.requestsRecovery job)})

(defn- stored-as-is?
  "Whether `scheduler` already stores `job` exactly as it is."
  [^Scheduler scheduler ^JobDetail job]
  ;; a stored job whose class can't be loaded counts as not stored, so that it gets replaced
  (when-let [stored (try
                      (.getJobDetail scheduler (.getKey job))
                      (catch JobPersistenceException _
                        nil))]
    (= (job-definition stored) (job-definition job))))

(mu/defn add-job!
  "Add a job separately from a trigger. Replaces a stored job only when its definition has changed."
  [job :- (ms/InstanceOfClass JobDetail)]
  (when-let [scheduler (scheduler)]
    ;; Replacing a job writes its current class name, which old nodes in a rolling upgrade can't load.
    ;; An unchanged job therefore keeps its stored name: see [[metabase.app-db.quartz/job-history]].
    (when-not (stored-as-is? scheduler job)
      (qs/add-job scheduler job true))))

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

(mu/defn delete-all-triggers-of-job!
  "Delete all triggers for a given job key."
  [job-key :- (ms/InstanceOfClass JobKey)]
  (when-let [scheduler (scheduler)]
    (qs/delete-triggers scheduler (map #(.getKey ^Trigger %) (qs/get-triggers-of-job scheduler job-key)))))

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
   :data               (into {} (.getJobDataMap trigger))})

(defmethod trigger->info CronTrigger
  [^CronTrigger trigger]
  (assoc
   ((get-method trigger->info Trigger) trigger)
   :schedule
   (.getCronExpression trigger)
   :timezone
   (.getID (.getTimeZone trigger))
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

(defn job-exists?
  "Check whether there is a Job with the given key."
  [job-key]
  (boolean
   (let [s (scheduler)]
     (when (and s (not (.isShutdown s)))
       (qs/get-job s (->job-key job-key))))))

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
          (log/warnf "Error fetching details for Quartz Job %s: %s" (.getName job-key) (ex-message e)))))))

(defn- jobs-info []
  (->> (some-> (scheduler) (.getJobKeys nil))
       (sort-by #(.getName ^JobKey %))
       (map job-info)
       (filter some?)))

(defn existing-triggers
  "Get the existing triggers for a job by key name, if it exists."
  [job-key trigger-key]
  (filter #(= (:key %) (.getName ^TriggerKey trigger-key)) (:triggers (job-info job-key))))

(defn scheduler-info
  "Return raw data about all the scheduler and scheduled tasks (i.e. Jobs and Triggers). Primarily for debugging
  purposes."
  []
  {:scheduler (some-> (scheduler) .getMetaData .getSummary str/split-lines)
   :jobs      (jobs-info)})

(defmacro rerun-on-error
  "Retry the current Job if an exception is thrown by the enclosed code."
  {:style/indent 1}
  [^JobExecutionContext ctx & body]
  `(let [msg# (str (.getName (.getKey (.getJobDetail ~ctx))) " failed, but we will try it again.")]
     (try
       ~@body
       (catch Exception e#
         (log/error msg# (ex-message e#))
         (throw (JobExecutionException. msg# e# true))))))

(def ^:private job-option-annotations
  "The Quartz annotation that each boolean job option puts on the job class, and the value that asks for it."
  {:concurrent?   {:annotation 'org.quartz.DisallowConcurrentExecution, :when false}
   :persist-data? {:annotation 'org.quartz.PersistJobDataAfterExecution, :when true}})

(def ^:private job-option-keys
  (into #{:saved-class} (keys job-option-annotations)))

(defn- job-definition-error [macro-name type-name message data]
  (ex-info (format "Invalid (task/%s %s ...): %s" macro-name type-name message)
           (assoc data :type-name type-name)))

(defn- check-job-options!
  "Throws unless `options` is a valid options map for the job type `type-name`."
  [macro-name type-name options]
  (let [error        (partial job-definition-error macro-name type-name)
        unknown-keys (when (map? options)
                       (sort (remove job-option-keys (keys options))))
        saved-class  (:saved-class options)
        default-name (str (munge (ns-name *ns*)) "." type-name)]
    (cond
      (not (map? options))
      (throw (error (format (str "its options map is missing. It goes after the optional docstring, and needs"
                                 " the class name that Quartz stores for the job. For a new job, add:\n\n"
                                 "  {:saved-class %s}\n")
                            (pr-str default-name))
                    {}))

      (seq unknown-keys)
      (throw (error (format "unknown options %s. The options are %s."
                            (pr-str (vec unknown-keys)) (pr-str (vec (sort job-option-keys))))
                    {:unknown-keys unknown-keys}))

      (not (contains? options :saved-class))
      (throw (error (format (str "it needs the class name that Quartz stores for the job. For a new job, add"
                                 " this to its options map:\n\n"
                                 "  :saved-class %s\n\n"
                                 "For a job that moved or was renamed, put back the `:saved-class` it had.")
                            (pr-str default-name))
                    {}))

      (not (string? saved-class))
      (throw (error "its `:saved-class` must be a string literal." {:saved-class saved-class}))

      (not (re-matches #"[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)+" saved-class))
      (throw (error (format (str "its `:saved-class` %s is not a fully qualified Java class name, such as %s."
                                 " A namespace's `-` is a `_` in a class name.")
                            (pr-str saved-class) (pr-str default-name))
                    {:saved-class saved-class}))

      :else
      (doseq [k     (keys job-option-annotations)
              :let  [v (get options k)]
              :when (and (contains? options k) (not (boolean? v)))]
        (throw (error (format "its `%s` must be `true` or `false`." k) {k v}))))))

(defn- parse-job-definition
  "Splits the arguments of [[defjob]] or [[defjob-type]] after the type name into the `:docstring`, the valid
  `:options` and the `:more` that follows them."
  [macro-name type-name args]
  (let [[docstring args] (if (string? (first args))
                           [(first args) (rest args)]
                           [nil args])
        [options & more] args]
    (when-not (simple-symbol? type-name)
      (throw (job-definition-error macro-name type-name
                                   "its type name must be a symbol with no namespace."
                                   {})))
    ;; This refuses only the metadata that would be lost, where an annotation is a symbol key.
    ;; Other metadata is fine: some readers, such as Eastwood's, put the line and column on every symbol.
    (when (some #(or (symbol? %) (#{:doc :private} %)) (keys (meta type-name)))
      (throw (job-definition-error macro-name type-name
                                   (str "its type name has metadata. Put the description in the docstring,"
                                        " and ask for Quartz annotations with the `:concurrent?` and"
                                        " `:persist-data?` options.")
                                   {:metadata (meta type-name)})))
    (check-job-options! macro-name type-name options)
    {:docstring docstring, :options options, :more more}))

(defn- job-class-symbol
  "The class name in `options` as a symbol, with the annotations that the options ask for as its metadata."
  [options]
  (with-meta (symbol (:saved-class options))
             (into {}
                   (for [[k {:keys [annotation], wanted :when}] job-option-annotations
                         :when (and (contains? options k) (= wanted (get options k)))]
                     [annotation true]))))

(defn- job-type-form
  "The form that defines the job class for [[defjob]] and [[defjob-type]]."
  [type-name {:keys [docstring options]} specs]
  (let [class-symbol (job-class-symbol options)]
    ;; `deftype` names its class after the current namespace and then expands to `deftype*`, so this skips it.
    ;; The forms of a top-level `do` are compiled one at a time, so the code that follows can use `type-name`.
    `(do
       (deftype* ~(symbol (name (ns-name *ns*)) (name type-name)) ~class-symbol []
         :implements [~@(filter symbol? specs) clojure.lang.IType]
         ~@(filter seq? specs))
       (.importClass ^clojure.lang.Namespace *ns*
                     '~type-name
                     (clojure.lang.RT/classForNameNonLoading ~(:saved-class options)))
       ;; the factory function that `deftype` and `defrecord` define
       (defn ~(symbol (str "->" type-name))
         ~(or docstring (str "Returns a new `" type-name "` job."))
         []
         (new ~(with-meta class-symbol nil))))))

(defmacro defjob-type
  "Defines a Quartz job class from interfaces and method implementations, as `deftype` with no fields does.
  Prefer [[defjob]], and use this for a job that implements more than `org.quartz.Job`.
  Nothing is wrapped around the methods: add a log context or a tracing span yourself.

    (task/defjob-type MyJob
      \"What the job does.\"
      {:saved-class \"metabase.my_module.task.my_job.MyJob\"}
      org.quartz.Job
      (execute [_ ctx] ...)
      org.quartz.InterruptableJob
      (interrupt [_] ...))

  The docstring is optional, and the options are those of [[defjob]], with `:saved-class` required."
  {:arglists '([type-name docstring? options & specs])}
  [type-name & args]
  (let [{:keys [more], :as definition} (parse-job-definition "defjob-type" type-name args)]
    (job-type-form type-name definition more)))

(defn- job-body-form
  "The `body` of a [[defjob]], inside its log context and its tracing span."
  [type-name body]
  `(log/with-context {:quartz-job-type (quote ~type-name)}
     (tracing/with-span :tasks (str "task." (quote ~type-name)) {:task/name (str (quote ~type-name))}
       ~@body)))

(defmacro defjob
  "Defines a Quartz job class that runs `body` with a log context and an OpenTelemetry tracing span around it.
  Imports the class as `type-name`, and defines the `->type-name` function that returns a new job.

    (task/defjob MyJob
      \"What the job does.\"
      {:saved-class \"metabase.my_module.task.my_job.MyJob\"
       :concurrent? false}
      [job-context]
      ...)

  The docstring is optional. `args` is a vector of one binding, for the `JobExecutionContext`. Options:

  - `:saved-class` (required, a string literal): the exact name of the job's class.
    Quartz stores this name in the app DB, and finds the job's class by it.
    Keep it the same when the namespace or `type-name` changes, or stored jobs lose their class.
    A new job takes the name its namespace would give it, which the error for a missing `:saved-class` prints.
    To change a stored name on purpose, see `metabase.app-db.quartz/job-history`.
  - `:concurrent?` (default `true`): `false` stops Quartz running two executions of the job at once, as
    `org.quartz.DisallowConcurrentExecution` does.
  - `:persist-data?` (default `false`): `true` saves the job's data map again after each execution, as
    `org.quartz.PersistJobDataAfterExecution` does.

  For a job that implements more than `org.quartz.Job`, see [[defjob-type]]."
  {:arglists '([type-name docstring? options args & body])}
  [type-name & args]
  (if (vector? (first args))
    ;; the form without options, which names the class after its namespace, until every job is converted
    #_{:clj-kondo/ignore [:discouraged-var]}
    `(jobs/defjob ~type-name ~(first args)
       ~(job-body-form type-name (rest args)))
    (let [{[job-args & body] :more, :as definition} (parse-job-definition "defjob" type-name args)]
      (when-not (and (vector? job-args) (= 1 (count job-args)))
        (throw (job-definition-error "defjob" type-name
                                     "its argument vector takes one binding, for the `JobExecutionContext`."
                                     {:args job-args})))
      (job-type-form type-name
                     definition
                     `[org.quartz.Job
                       (~'execute [~'_this ~@job-args]
                                  ~(job-body-form type-name body))]))))

(defn add-job-listener!
  "Add a [Quartz Joblistener](https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/tutorial-lesson-07.html). That will
  be called turing Job activation."
  [^JobListener job-listener]
  (when-let [scheduler (scheduler)]
    (.. scheduler
        getListenerManager
        (addJobListener job-listener))))

(defn add-trigger-listener!
  "Add a [Quartz Trigger listener](https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/tutorial-lesson-07.html). That will
  be called turing trigger activation."
  [^TriggerListener trigger-listener]
  (when-let [scheduler (scheduler)]
    (.. scheduler
        getListenerManager
        (addTriggerListener trigger-listener))))
