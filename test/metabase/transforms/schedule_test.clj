(ns metabase.transforms.schedule-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [metabase.test :as mt]
   [metabase.transforms.jobs :as transforms.jobs]
   [metabase.transforms.schedule])
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
