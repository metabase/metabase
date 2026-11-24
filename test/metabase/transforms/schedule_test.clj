(ns metabase.transforms.schedule-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.transforms.jobs :as transforms.jobs]
   [metabase.transforms.schedule :as transforms.schedule]
   [toucan2.core :as t2])
  (:import
   (metabase.transforms.schedule RunTransforms)
   (org.quartz JobDataMap)))

(set! *warn-on-reflection* true)

(deftype MockJobExecutionContext [job-data-map]
  org.quartz.JobExecutionContext
  (getMergedJobDataMap [_] (JobDataMap. job-data-map))

  qc/JobDataMapConversion
  (from-job-data [this]
    (.getMergedJobDataMap this)))

(defn- run-transforms-job! [job-id]
  (.execute (RunTransforms.) (MockJobExecutionContext. {"job-id" job-id})))

(deftest run-transforms-skips-when-disabled-test
  (testing "RunTransforms skips scheduled job runs when transforms-enabled is explicitly false"
    (mt/with-temp [:model/TransformJob {job-id :id} {:active true :schedule "0 0 * * * ?"}]
      (mt/with-temporary-raw-setting-values [transforms-enabled "false"]
        (let [run-called? (atom false)]
          (mt/with-dynamic-fn-redefs [transforms.jobs/run-job! (fn [& _] (reset! run-called? true))]
            (run-transforms-job! job-id)
            (is (false? @run-called?)
                "Should not call run-job! when transforms are disabled")))))))

(deftest run-transforms-proceeds-when-enabled-test
  (testing "RunTransforms runs scheduled jobs when transforms-enabled is explicitly true"
    (mt/with-temp [:model/TransformJob {job-id :id} {:active true :schedule "0 0 * * * ?"}]
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (let [run-called? (atom false)
              run-args    (atom nil)]
          (mt/with-dynamic-fn-redefs [transforms.jobs/run-job! (fn [& args]
                                                                 (reset! run-called? true)
                                                                 (reset! run-args args))]
            (run-transforms-job! job-id)
            (is (true? @run-called?)
                "Should call run-job! when transforms are enabled")
            (is (= [job-id {:run-method :cron}]
                   @run-args)
                "Should pass the job id and cron run method")))))))

(deftest init-deletes-triggers-of-inactive-jobs-test
  (testing "init! deletes the trigger of a job made inactive by a plain table update, accepts an inactive job with no trigger, and keeps active triggers"
    (mt/with-temp-scheduler!
      (mt/with-temp [:model/TransformJob {active-id :id :as active-job}     {:active true :schedule "0 0 * * * ?"}
                     :model/TransformJob {inactive-id :id :as inactive-job} {:active true :schedule "0 0 * * * ?"}
                     :model/TransformJob {untriggered-id :id}               {:active false :schedule "0 0 * * * ?"}]
        (try
          (run! transforms.schedule/initialize-job! [active-job inactive-job])
          (is (some? (transforms.schedule/existing-trigger inactive-id)))
          (is (nil? (transforms.schedule/existing-trigger untriggered-id)))
          (t2/update! :transform_job {:id inactive-id} {:active false})
          (task/init! ::transforms.schedule/RunTransform)
          (is (nil? (transforms.schedule/existing-trigger inactive-id)))
          (is (nil? (transforms.schedule/existing-trigger untriggered-id)))
          (is (some? (transforms.schedule/existing-trigger active-id)))
          (finally
            (run! transforms.schedule/delete-job! [active-id inactive-id])))))))
