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
   (java.util.concurrent LinkedBlockingQueue TimeUnit)
   (org.quartz CronTrigger JobDetail JobExecutionContext Scheduler SchedulerException)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; make sure we attempt to reschedule tasks so changes made in source are propogated to JDBC backend

(task/defjob TestJob [_])

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

(def ^:private ^LinkedBlockingQueue blocking-job-started (LinkedBlockingQueue.))

(def ^:private ^LinkedBlockingQueue blocking-job-release (LinkedBlockingQueue.))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true} BlockingJob [job-context]
  (.put blocking-job-started (.getName (.getKey (.getTrigger ^JobExecutionContext job-context))))
  (.take blocking-job-release))

(def ^:private blocking-job-key (jobs/key "metabase.task-test.blocking-job"))

(defn- blocking-job ^JobDetail []
  (jobs/build
   (jobs/of-type BlockingJob)
   (jobs/with-identity blocking-job-key)
   (jobs/store-durably)))

(defn- one-shot-trigger [trigger-name]
  (triggers/build
   (triggers/with-identity (triggers/key trigger-name))
   (triggers/for-job blocking-job-key)
   (triggers/start-now)))

(defn- next-blocking-job-start []
  (.poll blocking-job-started 5 TimeUnit/SECONDS))

(defn- test-schedule-once! []
  (.clear blocking-job-started)
  (.clear blocking-job-release)
  (testing "trigger with unused key runs"
    (is (true? (task/schedule-once! (blocking-job) (one-shot-trigger "first"))))
    (is (= "first" (next-blocking-job-start))))
  (dotimes [_ 3]
    (task/schedule-once! (blocking-job) (one-shot-trigger "first"))
    (task/schedule-once! (blocking-job) (one-shot-trigger "second")))
  (testing "no trigger starts while first run blocks"
    (is (nil? (.poll blocking-job-started 500 TimeUnit/MILLISECONDS))))
  (testing "triggers scheduled many times during run each run once after it"
    (dotimes [_ 3]
      (.put blocking-job-release :go))
    (is (= #{"first" "second"} (set [(next-blocking-job-start) (next-blocking-job-start)])))
    (is (nil? (.poll blocking-job-started 500 TimeUnit/MILLISECONDS)))))

(deftest schedule-once-test
  (mt/with-temp-scheduler!
    (test-schedule-once!)))

(deftest schedule-once-with-jdbc-job-store-test
  (with-jdbc-scheduler!
    (let [standby? (.isInStandbyMode (task/scheduler))]
      (try
        (task/add-job! (blocking-job))
        (qs/start (task/scheduler))
        (test-schedule-once!)
        (finally
          (qs/delete-job (task/scheduler) blocking-job-key)
          (when standby?
            (qs/standby (task/scheduler))))))))

(defn- blocking-job-of-its-own ^JobDetail [job-name]
  (jobs/build
   (jobs/of-type BlockingJob)
   (jobs/with-identity (jobs/key job-name))))

(defn- trigger-of-job [^JobDetail job trigger-name]
  (triggers/build
   (triggers/with-identity (triggers/key trigger-name))
   (triggers/for-job (.getKey job))
   (triggers/start-now)))

(deftest schedule-once-with-job-per-trigger-test
  (with-jdbc-scheduler!
    (let [standby? (.isInStandbyMode (task/scheduler))
          job-a    (blocking-job-of-its-own "metabase.task-test.blocking-job.a")
          job-b    (blocking-job-of-its-own "metabase.task-test.blocking-job.b")]
      (try
        (task/add-job! (blocking-job))
        (qs/start (task/scheduler))
        (.clear blocking-job-started)
        (.clear blocking-job-release)
        (task/schedule-once! job-a (trigger-of-job job-a "a"))
        (is (= "a" (next-blocking-job-start)))
        (testing "other job runs during run"
          (task/schedule-once! job-b (trigger-of-job job-b "b"))
          (is (= "b" (next-blocking-job-start))))
        (testing "same job scheduled during its run waits for it and runs once"
          (dotimes [_ 3]
            (task/schedule-once! job-a (trigger-of-job job-a "a")))
          (is (nil? (.poll blocking-job-started 500 TimeUnit/MILLISECONDS)))
          (dotimes [_ 2]
            (.put blocking-job-release :go))
          (is (= "a" (next-blocking-job-start)))
          (.put blocking-job-release :go)
          (is (nil? (.poll blocking-job-started 500 TimeUnit/MILLISECONDS))))
        (testing "job is deleted after its last run"
          (is (nil? (qs/get-job (task/scheduler) (.getKey job-a)))))
        (finally
          (dotimes [_ 3]
            (.put blocking-job-release :go))
          (qs/delete-jobs (task/scheduler) [blocking-job-key (.getKey job-a) (.getKey job-b)])
          (when standby?
            (qs/standby (task/scheduler))))))))

(deftest schedule-once-without-running-scheduler-test
  (tu/do-with-unstarted-temp-scheduler!
   (fn []
     (is (nil? (task/schedule-once! (blocking-job) (one-shot-trigger "first"))))
     (is (not (task/job-exists? blocking-job-key))))))

(deftest schedule-once-that-scheduler-refuses-test
  (let [refusing-scheduler (reify Scheduler
                             (isInStandbyMode [_] false)
                             (^void scheduleJob [_ ^JobDetail _job ^java.util.Set _triggers ^boolean _replace]
                               (throw (SchedulerException. "job store is down"))))]
    (binding [task.impl/*quartz-scheduler* (atom refusing-scheduler)]
      (is (nil? (task/schedule-once! (blocking-job) (one-shot-trigger "first")))))))
