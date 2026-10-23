(ns metabase.transforms.schedule-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [metabase.premium-features.defenterprise :as defenterprise]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]
   [metabase.transforms.jobs :as transforms.jobs]
   [metabase.transforms.schedule]
   [metabase.transforms.settings :as transforms.settings]
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

(defn- last-run-transforms-task-details [job-id]
  (->> (t2/select :model/TaskHistory :task "run-transforms" {:order-by [[:id :desc]]})
       (map :task_details)
       (filter #(= job-id (:job-id %)))
       first))

(deftest run-transforms-skips-when-scheduling-disabled-test
  (testing "RunTransforms records a skipped firing and creates no job run when transforms-scheduling-enabled is false"
    (mt/with-temp [:model/TransformJob {job-id :id} {:active true :schedule "0 0 * * * ?"}]
      (mt/with-temporary-raw-setting-values [transforms-enabled            "true"
                                             transforms-scheduling-enabled "false"]
        (let [run-called? (atom false)]
          (mt/with-dynamic-fn-redefs [transforms.jobs/run-job! (fn [& _] (reset! run-called? true))]
            (run-transforms-job! job-id)
            (is (false? @run-called?))
            (is (=? {:skipped-reason "scheduling-disabled"}
                    (last-run-transforms-task-details job-id)))
            (is (not (t2/exists? :model/TransformJobRun :job_id job-id)))))))))

(deftest run-transforms-disabled-reason-wins-over-scheduling-disabled-test
  (testing "RunTransforms reports transforms-disabled when both transforms and scheduling are disabled"
    (mt/with-temp [:model/TransformJob {job-id :id} {:active true :schedule "0 0 * * * ?"}]
      (mt/with-temporary-raw-setting-values [transforms-enabled            "false"
                                             transforms-scheduling-enabled "false"]
        (mt/with-dynamic-fn-redefs [transforms.jobs/run-job! (fn [& _])]
          (run-transforms-job! job-id)
          (is (=? {:skipped-reason "transforms-disabled"}
                  (last-run-transforms-task-details job-id))))))))

(deftest transforms-scheduling-enabled-oss-default-test
  (let [oss-default (get-in @defenterprise/registry
                            ['metabase-enterprise.remote-sync.core/transforms-scheduling-default :oss])]
    (mt/with-dynamic-fn-redefs [remote-sync/transforms-scheduling-default oss-default]
      (testing "the setting is true on OSS when it is not set"
        (mt/with-temporary-raw-setting-values [transforms-scheduling-enabled nil]
          (is (true? (transforms.settings/transforms-scheduling-enabled)))))
      (testing "the setting is false on OSS when it is set to false"
        (mt/with-temporary-raw-setting-values [transforms-scheduling-enabled "false"]
          (is (false? (transforms.settings/transforms-scheduling-enabled))))))))
