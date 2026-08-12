(ns metabase.usage-metadata.task.process-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.jobs :as jobs]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.usage-metadata.batch]
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
    (let [batch-ran?   (promise)
          refresh-ran? (promise)]
      ;; Quartz runs the replacement on a scheduler thread, so this must be a process-wide redef.
      #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
      (with-redefs [metabase.usage-metadata.batch/run-batch! (fn []
                                                               (deliver batch-ran? true))
                    usage-metadata.task.process/run-candidate-refresh! (fn []
                                                                         (deliver refresh-ran? true))]
        (mt/with-temporary-setting-values [usage-metadata-enabled? false]
          (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
          (Thread/sleep 200)
          (is (= ::timeout (deref batch-ran? 50 ::timeout)))
          (is (= ::timeout (deref refresh-ran? 50 ::timeout))
              "the scheduled candidate refresh must not fire on instances that haven't opted in"))
        (mt/with-temporary-setting-values [usage-metadata-enabled? true]
          (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
          (is (true? (deref batch-ran? 5000 ::timeout)))
          (is (true? (deref refresh-ran? 5000 ::timeout))))))))

(deftest scheduled-candidate-refresh-invokes-enterprise-hook-test
  (mt/with-temp-scheduler!
    (task/init! ::usage-metadata.task.process/UsageMetadataProcess)
    (let [refresh-ran? (promise)]
      ;; Quartz runs the replacement on a scheduler thread, so this must be a process-wide redef.
      #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
      (with-redefs [metabase.usage-metadata.batch/run-batch! (constantly nil)
                    usage-metadata.task.process/run-candidate-refresh! #(deliver refresh-ran? true)]
        (mt/with-temporary-setting-values [usage-metadata-enabled? true]
          (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
          (is (true? (deref refresh-ran? 5000 ::timeout))))))))

(deftest rollup-failure-does-not-skip-scheduled-candidate-recovery-test
  (mt/with-temp-scheduler!
    (task/init! ::usage-metadata.task.process/UsageMetadataProcess)
    (let [refresh-ran? (promise)]
      ;; Quartz runs the replacement on a scheduler thread, so this must be a process-wide redef.
      #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
      (with-redefs [metabase.usage-metadata.batch/run-batch! #(throw (AssertionError. "rollup failed"))
                    usage-metadata.task.process/run-candidate-refresh! #(deliver refresh-ran? true)]
        (mt/with-temporary-setting-values [usage-metadata-enabled? true]
          (task/trigger-now! (jobs/key "metabase.task.usage-metadata-process.job"))
          (is (true? (deref refresh-ran? 5000 ::timeout))))))))
