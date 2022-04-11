(ns metabase.task-test
  (:require [clojure.test :refer :all]
            [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clojurewerkz.quartzite.scheduler :as qs]
            [clojurewerkz.quartzite.triggers :as triggers]
            [metabase.task :as task]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import [org.quartz CronTrigger JobDetail]))

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
   (for [^CronTrigger trigger (qs/get-triggers-of-job (#'metabase.task/scheduler) (.getKey (job)))]
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
      (is (schema= {:scheduler (su/non-empty [s/Str])
                    :jobs      [{:key         su/NonBlankString
                                 :description su/NonBlankString
                                 :triggers    [{:key                 su/NonBlankString
                                                :description         su/NonBlankString
                                                :misfire-instruction su/NonBlankString
                                                :state               su/NonBlankString
                                                s/Keyword            s/Any}]
                                 s/Keyword    s/Any}]}
                   (task/scheduler-info))))))
