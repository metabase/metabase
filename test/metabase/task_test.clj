(ns metabase.task-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.task.core :as task]
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.lang.annotation Annotation)
   (java.time Duration Instant)
   (java.util Date)
   (org.quartz CronTrigger InterruptableJob Job JobDetail)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; make sure we attempt to reschedule tasks so changes made in source are propogated to JDBC backend

(task/defjob TestJob
  {:saved-class "metabase.task_test.TestJob"}
  [_])

(defn- job ^JobDetail []
  (jobs/build
   (jobs/of-type TestJob)
   (jobs/with-identity (jobs/key "metabase.task-test.job"))))

(defn- trigger-1 ^CronTrigger []
  (triggers/build
   (triggers/with-identity (triggers/key "metabase.task-test.trigger"))
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule "0 0 * * * ? *") ; every hour
     (cron/with-misfire-handling-instruction-do-nothing)))))

(defn- trigger-2 ^CronTrigger []
  (triggers/build
   (triggers/with-identity (triggers/key "metabase.task-test.trigger"))
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule "0 0 6 * * ? *") ; at 6 AM every day
     (cron/with-misfire-handling-instruction-ignore-misfires)))))

(defn- do-with-temp-scheduler-and-cleanup! [f]
  (mt/with-temp-scheduler!
    (try
      (f)
      (finally
        (task/delete-task! (.getKey (job)) (.getKey (trigger-1)))))))

(defmacro ^:private with-temp-scheduler-and-cleanup! [& body]
  `(do-with-temp-scheduler-and-cleanup! (fn [] ~@body)))

(defn- triggers []
  (set
   (for [^CronTrigger trigger (qs/get-triggers-of-job (#'task/scheduler) (.getKey (job)))]
     {:cron-expression     (.getCronExpression trigger)
      :misfire-instruction (.getMisfireInstruction trigger)})))

(deftest job-exists?-test
  (with-temp-scheduler-and-cleanup!
    (is (false? (task/job-exists? (.getKey (job)))))
    (task/schedule-task! (job) (trigger-1))
    (is (true? (task/job-exists? (.getKey (job)))))
    (is (false? (task/job-exists? "not-found")))))

(deftest schedule-job-test
  (testing "can we schedule a job?"
    (with-temp-scheduler-and-cleanup!
      (task/schedule-task! (job) (trigger-1))
      (is (= #{{:cron-expression     "0 0 * * * ? *"
                :misfire-instruction CronTrigger/MISFIRE_INSTRUCTION_DO_NOTHING}}
             (triggers))))))

(deftest reschedule-job-test
  (testing "does scheduling a job a second time work without throwing errors?"
    (with-temp-scheduler-and-cleanup!
      (task/schedule-task! (job) (trigger-1))
      (task/schedule-task! (job) (trigger-1))
      (is (= #{{:cron-expression     "0 0 * * * ? *"
                :misfire-instruction CronTrigger/MISFIRE_INSTRUCTION_DO_NOTHING}}
             (triggers))))))

(deftest reschedule-and-replace-job-test
  (testing "does scheduling a job with a *new* trigger replace the original? (can we reschedule a job?)"
    (with-temp-scheduler-and-cleanup!
      (task/schedule-task! (job) (trigger-1))
      (task/schedule-task! (job) (trigger-2))
      (is (= #{{:cron-expression     "0 0 6 * * ? *"
                :misfire-instruction CronTrigger/MISFIRE_INSTRUCTION_IGNORE_MISFIRE_POLICY}}
             (triggers))))))

(deftest scheduler-info-test
  (testing "Make sure scheduler-info doesn't explode and returns info in the general shape we expect"
    (mt/with-temp-scheduler!
      (is (malli= [:map {:closed true}
                   [:scheduler [:+ :string]]
                   [:jobs      [:sequential
                                [:and
                                 [:map-of :keyword :any]
                                 [:map
                                  [:key         ms/NonBlankString]
                                  [:description ms/NonBlankString]
                                  [:triggers    [:sequential
                                                 [:and
                                                  [:map-of :keyword :any]
                                                  [:map
                                                   [:key ms/NonBlankString]
                                                   [:description ms/NonBlankString]
                                                   [:misfire-instruction ms/NonBlankString]
                                                   [:state ms/NonBlankString]]]]]]]]]]
                  (task/scheduler-info))))))

(deftest start-scheduler-no-op-with-env-var-test
  (tu/do-with-unstarted-temp-scheduler!
   (^:once fn* []
     (testing "task/start-scheduler! should no-op When MB_DISABLE_SCHEDULER is set"
       (testing "Sanity check"
         (is (not (qs/started? (#'task/scheduler)))))
       (mt/with-temp-env-var-value! ["MB_DISABLE_SCHEDULER" "TRUE"]
         (task/start-scheduler!)
         (is (not (qs/started? (#'task/scheduler)))))
       (testing "Should still be able to 'schedule' tasks even if scheduler is unstarted"
         (is (some? (task/schedule-task! (job) (trigger-1)))))
       (mt/with-temp-env-var-value! ["MB_DISABLE_SCHEDULER" "FALSE"]
         (task/start-scheduler!)
         (is (qs/started? (#'task/scheduler))))))))

(defn- capitalize-if-mysql [s]
  (cond-> (name s)
    (= :mysql (mdb.connection/db-type))
    u/upper-case-en
    true keyword))

(deftest no-class-message-test
  (is (= {:renamed-key (str "Deleting job metabase-enterprise.transforms.timeout due to class not found"
                            " (a.Class). Its key was renamed to metabase.transforms.timeout in x.59.1."
                            " Moved out of enterprise, with no change to the job.")
          :other-key   "Deleting job some.job due to class not found (a.Class)"}
         {:renamed-key (#'task.impl/no-class-message "metabase-enterprise.transforms.timeout" "a.Class")
          :other-key   (#'task.impl/no-class-message "some.job" "a.Class")})))

(deftest start-scheduler-will-cleanup-jobs-without-class-test
  ;; we can't use the temp scheduler in this test because the temp scheduler use an in-memory jobstore
  ;; and we need update the job class in the database to trigger the cleanup
  (let [scheduler-initialized? (some? (#'task/scheduler))]
    (try
      (when-not scheduler-initialized?
        (task/start-scheduler!))
      (task/schedule-task! (job) (trigger-1))
      (testing "make sure the job is in the database before we start the scheduler"
        (is (t2/exists? (capitalize-if-mysql :qrtz_job_details) (capitalize-if-mysql :job_name) "metabase.task-test.job")))
      ;; update the job class to a non-existent class
      (t2/update! (capitalize-if-mysql :qrtz_job_details) (capitalize-if-mysql :job_name) "metabase.task-test.job"
                  {(capitalize-if-mysql :job_class_name) "NOT_A_REAL_CLASS"})
      ;; stop the scheduler then restart so [[task/delete-jobs-with-no-class!]] is triggered
      (task/stop-scheduler!)
      (task/start-scheduler!)
      (testing "the job should be removed from the database when the scheduler starts"
        (is (not (t2/exists? (capitalize-if-mysql :qrtz_job_details) (capitalize-if-mysql :job_name) "metabase.task-test.job"))))
      (finally
        ;; restore the state of scheduler before we start the test
        (if scheduler-initialized?
          (task/start-scheduler!)
          (task/stop-scheduler!))))))

(defmacro ^:private with-jdbc-scheduler!
  "Runs `body` with a JDBC-backed scheduler, and stops it afterwards unless one was already running.
  A scheduler that this starts stays in standby: it stores and loads jobs, and fires no trigger."
  [& body]
  `(let [running?# (some? (#'task/scheduler))]
     (when-not running?#
       ;; the tasks' initializers start threads that outlive the scheduler, so only the scheduler starts
       (mt/with-dynamic-fn-redefs [task.impl/init-tasks! (constantly nil)]
         (task/init-scheduler!)))
     (try
       ~@body
       (finally
         (when-not running?#
           (task/stop-scheduler!))))))

(def ^:private old-upgrade-checks-class-name "metabase.task.upgrade_checks.CheckForNewVersions")

(def ^:private upgrade-checks-class-name "metabase.version.task.upgrade_checks.CheckForNewVersions")

(defn- stored-job-class-name []
  (t2/select-one-fn (capitalize-if-mysql :job_class_name)
                    (capitalize-if-mysql :qrtz_job_details)
                    (capitalize-if-mysql :job_name) "metabase.task-test.job"))

(defn- set-stored-job-class-name! [class-name]
  (t2/update! (capitalize-if-mysql :qrtz_job_details)
              (capitalize-if-mysql :job_name) "metabase.task-test.job"
              {(capitalize-if-mysql :job_class_name) class-name}))

(defn- trigger-that-starts-next-week
  "An hourly trigger like [[trigger-1]] that can't fire while a test runs."
  ^CronTrigger []
  (triggers/build
   (triggers/with-identity (triggers/key "metabase.task-test.trigger"))
   (triggers/start-at (Date/from (.plus (Instant/now) (Duration/ofDays 7))))
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule "0 0 * * * ? *")
     (cron/with-misfire-handling-instruction-do-nothing)))))

(deftest startup-cleanup-keeps-a-job-stored-under-an-old-class-name-test
  ;; Old nodes in a rolling upgrade still load the stored name, so the row must survive startup and keep it.
  ;; Upgraded nodes load the current class under it.
  (require 'metabase.version.task.upgrade-checks)
  (with-jdbc-scheduler!
    (try
      ;; Once the old name is stored, this row loads as the real version-check job, which must not run here.
      ;; A scheduler that this test started is in standby and fires nothing.
      ;; One that was already running could fire an hourly trigger, so the trigger starts next week.
      (task/schedule-task! (job) (trigger-that-starts-next-week))
      (set-stored-job-class-name! old-upgrade-checks-class-name)
      (#'task.impl/delete-jobs-with-no-class!)
      ;; the trigger survives too, which matters for per-database sync schedules, as no `init!` recreates them
      (is (= {:stored-class-name old-upgrade-checks-class-name
              :loaded-class-name upgrade-checks-class-name
              :triggers          #{{:cron-expression     "0 0 * * * ? *"
                                    :misfire-instruction CronTrigger/MISFIRE_INSTRUCTION_DO_NOTHING}}}
             {:stored-class-name (stored-job-class-name)
              :loaded-class-name (-> ^JobDetail (qs/get-job (#'task/scheduler) (.getKey (job)))
                                     .getJobClass
                                     .getName)
              :triggers          (triggers)}))
      (finally
        (task/delete-task! (.getKey (job)) (.getKey (trigger-1)))))))

(defn- upgrade-checks-job ^JobDetail [{:keys [data description requests-recovery?]}]
  (jobs/build
   (jobs/of-type (Class/forName upgrade-checks-class-name))
   (jobs/with-identity (jobs/key "metabase.task-test.job"))
   (jobs/with-description (or description "a job"))
   (jobs/using-job-data (or data {}))
   ;; the `jobs/build` macro threads the builder in as the first argument
   (cond-> requests-recovery? jobs/request-recovery)
   (jobs/store-durably)))

(defn- class-name-after-add-job!
  "Returns the class name stored after [[task/add-job!]] adds a job built with `job-options`.
  The default job is stored under `stored-class-name` first."
  [[stored-class-name job-options]]
  (task/add-job! (upgrade-checks-job {}))
  (set-stored-job-class-name! stored-class-name)
  (task/add-job! (upgrade-checks-job job-options))
  (stored-job-class-name))

(deftest add-job!-replaces-a-stored-job-only-when-it-changed-test
  ;; Replacing a stored job writes its current class name, which old nodes in a rolling upgrade can't load
  (require 'metabase.version.task.upgrade-checks)
  (with-jdbc-scheduler!
    (let [old-name old-upgrade-checks-class-name]
      (try
        (is (= {:unchanged               old-name
                :new-description         upgrade-checks-class-name
                :new-data                upgrade-checks-class-name
                :new-recovery-request    upgrade-checks-class-name
                :unloadable-stored-class upgrade-checks-class-name}
               (update-vals {:unchanged               [old-name {}]
                             :new-description         [old-name {:description "a new description"}]
                             :new-data                [old-name {:data {"a" "b"}}]
                             :new-recovery-request    [old-name {:requests-recovery? true}]
                             :unloadable-stored-class ["metabase.task_test.NotAClass" {}]}
                            class-name-after-add-job!)))
        (finally
          (qs/delete-job (#'task/scheduler) (jobs/key "metabase.task-test.job")))))))

;;; ------------------------------------------------- defjob --------------------------------------------------

(task/defjob AnnotatedJob
  "A job with both Quartz annotations."
  {:saved-class   "metabase.task_test.AnnotatedJob"
   :concurrent?   false
   :persist-data? true}
  [_])

(task/defjob DefaultsJob
  {:saved-class "metabase.task_test.DefaultsJob", :concurrent? true, :persist-data? false}
  [_])

(task/defjob-type InterruptableTestJob
  "A job that implements more than `org.quartz.Job`."
  {:saved-class "metabase.task_test.InterruptableTestJob", :concurrent? false}
  org.quartz.Job
  (execute [_ _])
  org.quartz.InterruptableJob
  (interrupt [_]))

(defn- annotation-names [^Class c]
  (into #{} (map #(.getSimpleName (.annotationType ^Annotation %))) (.getAnnotations c)))

(deftest defjob-options-put-quartz-annotations-on-the-class-test
  (is (= {:annotated     {:class-name                       "metabase.task_test.AnnotatedJob"
                          :annotations                      #{"DisallowConcurrentExecution"
                                                              "PersistJobDataAfterExecution"}
                          :concurrent-execution-disallowed? true
                          :persist-job-data?                true}
          :defaults      {:class-name                       "metabase.task_test.DefaultsJob"
                          :annotations                      #{}
                          :concurrent-execution-disallowed? false
                          :persist-job-data?                false}
          :interruptable {:class-name                       "metabase.task_test.InterruptableTestJob"
                          :annotations                      #{"DisallowConcurrentExecution"}
                          :concurrent-execution-disallowed? true
                          :persist-job-data?                false}}
         (update-vals {:annotated     AnnotatedJob
                       :defaults      DefaultsJob
                       :interruptable InterruptableTestJob}
                      (fn [^Class c]
                        (let [^JobDetail detail (jobs/build (jobs/of-type c))]
                          {:class-name                       (.getName c)
                           :annotations                      (annotation-names c)
                           :concurrent-execution-disallowed? (.isConcurrentExectionDisallowed detail)
                           :persist-job-data?                (.isPersistJobDataAfterExecution detail)}))))))

(deftest defjob-defines-a-factory-test
  ;; Kondo lints `task/defjob` as a `defn`, so it does not know the factory of a job defined with it.
  (let [->annotated-job (ns-resolve 'metabase.task-test '->AnnotatedJob)]
    (is (= {:job?           true
            :interruptable? true
            :docstring      "A job with both Quartz annotations."}
           {:job?           (instance? Job (->annotated-job))
            :interruptable? (instance? InterruptableJob (->InterruptableTestJob))
            :docstring      (:doc (meta ->annotated-job))}))))

(defn- definition-error
  "Returns the message of the error that expanding the job definition `form` in this namespace throws."
  [form]
  (binding [*ns* (the-ns 'metabase.task-test)]
    (try
      (when (macroexpand-1 form)
        nil)
      (catch Throwable e
        (ex-message (or (ex-cause e) e))))))

(deftest defjob-rejects-an-invalid-definition-test
  (is (=? {;; the entry to paste, with the class name that this namespace gives the type
           :no-saved-class   #"(?s).*\n\n  :saved-class \"metabase\.task_test\.NewJob\"\n\n.*"
           :no-options       #"(?s).*\n\n  \{:saved-class \"metabase\.task_test\.NewJob\"\}\n"
           :unknown-option   #".*unknown options \[:durable\?\]\. The options are \[.*\]\."
           :not-a-literal    #".*its `:saved-class` must be a string literal\."
           :not-a-class-name #".*\"metabase\.task-test\.NewJob\" is not a fully qualified Java class name.*"
           :no-package       #".*\"NewJob\" is not a fully qualified Java class name.*"
           :not-a-boolean    #".*its `:concurrent\?` must be `true` or `false`\."
           :metadata         #".*its type name has metadata\..*"
           :two-arguments    #".*its argument vector takes one binding.*"
           :valid            nil}
          (update-vals
           '{:no-saved-class   (task/defjob NewJob {:concurrent? false} [_])
             :no-options       (task/defjob NewJob [_])
             :unknown-option   (task/defjob NewJob {:saved-class "a.NewJob", :durable? true} [_])
             :not-a-literal    (task/defjob NewJob {:saved-class (str "a." "NewJob")} [_])
             :not-a-class-name (task/defjob NewJob {:saved-class "metabase.task-test.NewJob"} [_])
             :no-package       (task/defjob-type NewJob {:saved-class "NewJob"} org.quartz.Job)
             :not-a-boolean    (task/defjob NewJob {:saved-class "a.NewJob", :concurrent? nil} [_])
             :metadata         (task/defjob ^{:doc "A job."} NewJob {:saved-class "a.NewJob"} [_])
             :two-arguments    (task/defjob NewJob {:saved-class "a.NewJob"} [_ _])
             :valid            (task/defjob NewJob "A job." {:saved-class "a.NewJob"} [_])}
           definition-error))))

(deftest defjob-allows-the-position-metadata-of-a-reader-test
  ;; Eastwood reads the source with a reader that puts the line and column on every symbol.
  (is (nil? (definition-error (list 'task/defjob
                                    (with-meta 'NewJob {:line 1, :column 14})
                                    {:saved-class "a.NewJob"}
                                    '[_])))))
