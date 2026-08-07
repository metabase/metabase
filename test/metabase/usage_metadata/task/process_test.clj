(ns metabase.usage-metadata.task.process-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.jobs :as jobs]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.usage-metadata.batch]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]
   [metabase.usage-metadata.task.process :as usage-metadata.task.process]))

(set! *warn-on-reflection* true)

(defn- scheduled-job []
  (first (filter #(= "metabase.task.usage-metadata-process.job" (:key %))
                 (mt/scheduler-current-tasks))))

(deftest init!-schedules-usage-metadata-job-test
  (mt/with-temp-scheduler!
    (mt/with-temporary-setting-values [usage-metadata-schedule "0 15 2 * * ? *"]
      (task/init! ::usage-metadata.task.process/UsageMetadataProcess)
      (let [job (scheduled-job)]
        (is (= "metabase.task.usage-metadata-process.job" (:key job)))
        (is (= "0 15 2 * * ? *"
               (get-in job [:triggers 0 :cron-schedule])))))))

(deftest usage-metadata-job-respects-enabled-setting-test
  (mt/with-temp-scheduler!
    (task/init! ::usage-metadata.task.process/UsageMetadataProcess)
    (let [ran? (promise)]
      (with-redefs [metabase.usage-metadata.batch/run-batch! (fn []
                                                               (deliver ran? true))
                    candidate-refresh/queue-refresh! (constantly nil)]
        (mt/with-temporary-setting-values [usage-metadata-enabled? false]
          (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
          (Thread/sleep 200)
          (is (= ::timeout (deref ran? 50 ::timeout))))
        (mt/with-temporary-setting-values [usage-metadata-enabled? true]
          (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
          (is (true? (deref ran? 5000 ::timeout))))))))

(deftest scheduled-candidate-refresh-delegates-recovery-to-queue-test
  (mt/with-temp-scheduler!
    (task/init! ::usage-metadata.task.process/UsageMetadataProcess)
    (let [replacement-run {:id 2, :status :queued}
          queued-args     (promise)
          submitted-run   (promise)]
      (with-redefs [premium-features/has-feature?              (constantly true)
                    metabase.usage-metadata.batch/run-batch!   (constantly nil)
                    candidate-refresh/queue-refresh!   (fn [trigger requested-by]
                                                         (deliver queued-args [trigger requested-by])
                                                         replacement-run)
                    candidate-refresh/run-refresh!     #(deliver submitted-run %)]
        (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
        (is (= [:scheduled nil] (deref queued-args 5000 ::timeout)))
        (is (= replacement-run (deref submitted-run 5000 ::timeout)))))))

(deftest scheduled-candidate-refresh-leaves-active-run-alone-test
  (mt/with-temp-scheduler!
    (task/init! ::usage-metadata.task.process/UsageMetadataProcess)
    (let [queued-args   (promise)
          submitted-run (promise)]
      (with-redefs [premium-features/has-feature?              (constantly true)
                    metabase.usage-metadata.batch/run-batch!   (constantly nil)
                    candidate-refresh/queue-refresh!   (fn [trigger requested-by]
                                                         (deliver queued-args [trigger requested-by])
                                                         nil)
                    candidate-refresh/run-refresh!     #(deliver submitted-run %)]
        (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
        (is (= [:scheduled nil] (deref queued-args 5000 ::timeout)))
        (is (= ::timeout (deref submitted-run 100 ::timeout)))))))

(deftest rollup-failure-does-not-skip-scheduled-candidate-recovery-test
  (mt/with-temp-scheduler!
    (task/init! ::usage-metadata.task.process/UsageMetadataProcess)
    (let [queued-args (promise)]
      (with-redefs [premium-features/has-feature?            (constantly true)
                    metabase.usage-metadata.batch/run-batch! #(throw (AssertionError. "rollup failed"))
                    candidate-refresh/queue-refresh! (fn [trigger requested-by]
                                                       (deliver queued-args [trigger requested-by])
                                                       nil)]
        (mt/with-temporary-setting-values [usage-metadata-enabled? true]
          (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
          (is (= [:scheduled nil] (deref queued-args 5000 ::timeout))))))))
