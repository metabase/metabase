(ns ^:mb/once metabase.task-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.db.connection :as mdb.connection]
   [metabase.task :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (org.quartz CronTrigger JobDetail)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; make sure we attempt to reschedule tasks so changes made in source are propogated to JDBC backend

(jobs/defjob TestJob [_])

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

(defn- do-with-temp-scheduler-and-cleanup [f]
  (mt/with-temp-scheduler
    (try
      (f)
      (finally
        (task/delete-task! (.getKey (job)) (.getKey (trigger-1)))))))

(defmacro ^:private with-temp-scheduler-and-cleanup [& body]
  `(do-with-temp-scheduler-and-cleanup (fn [] ~@body)))

(defn- triggers []
  (set
   (for [^CronTrigger trigger (qs/get-triggers-of-job (#'task/scheduler) (.getKey (job)))]
     {:cron-expression     (.getCronExpression trigger)
      :misfire-instruction (.getMisfireInstruction trigger)})))

(deftest schedule-job-test
  (testing "can we schedule a job?"
    (with-temp-scheduler-and-cleanup
      (task/schedule-task! (job) (trigger-1))
      (is (= #{{:cron-expression     "0 0 * * * ? *"
                :misfire-instruction CronTrigger/MISFIRE_INSTRUCTION_DO_NOTHING}}
             (triggers))))))

(deftest reschedule-job-test
  (testing "does scheduling a job a second time work without throwing errors?"
    (with-temp-scheduler-and-cleanup
      (task/schedule-task! (job) (trigger-1))
      (task/schedule-task! (job) (trigger-1))
      (is (= #{{:cron-expression     "0 0 * * * ? *"
                :misfire-instruction CronTrigger/MISFIRE_INSTRUCTION_DO_NOTHING}}
             (triggers))))))

(deftest reschedule-and-replace-job-test
  (testing "does scheduling a job with a *new* trigger replace the original? (can we reschedule a job?)"
    (with-temp-scheduler-and-cleanup
      (task/schedule-task! (job) (trigger-1))
      (task/schedule-task! (job) (trigger-2))
      (is (= #{{:cron-expression     "0 0 6 * * ? *"
                :misfire-instruction CronTrigger/MISFIRE_INSTRUCTION_IGNORE_MISFIRE_POLICY}}
             (triggers))))))

(deftest scheduler-info-test
  (testing "Make sure scheduler-info doesn't explode and returns info in the general shape we expect"
    (mt/with-temp-scheduler
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
  (tu/do-with-unstarted-temp-scheduler
   (^:once fn* []
    (testing (format "task/start-scheduler! should no-op When MB_DISABLE_SCHEDULER is set")
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
