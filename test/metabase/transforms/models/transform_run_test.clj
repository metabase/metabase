(ns metabase.transforms.models.transform-run-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest new-run-activity-follows-status-test
  (mt/with-temp [:model/Transform {transform-id :id} {}
                 :model/TransformRun {started-id :id} {:transform_id transform-id :status :started :end_time nil}
                 :model/TransformRun {ended-id :id} {:transform_id transform-id :status :succeeded :is_active true}]
    (is (true? (t2/select-one-fn :is_active :model/TransformRun :id started-id)))
    (is (nil? (t2/select-one-fn :is_active :model/TransformRun :id ended-id)))))

(deftest terminal-status-ends-transform-run-test
  (doseq [status [:succeeded :failed :canceled :timeout]]
    (testing status
      (mt/with-temp [:model/Transform {transform-id :id} {}
                     :model/TransformRun {run-id :id} {:transform_id transform-id :status :started :end_time nil}]
        (t2/insert! :model/TransformRunCancelation {:run_id run-id})
        (t2/update! :model/TransformRun :id run-id {:status status})
        (let [run (t2/select-one :model/TransformRun :id run-id)]
          (is (nil? (:is_active run)))
          (is (some? (:end_time run))))
        (is (not (t2/exists? :model/TransformRunCancelation :run_id run-id)))))))

(deftest canceling-status-keeps-transform-run-active-test
  (mt/with-temp [:model/Transform {transform-id :id} {}
                 :model/TransformRun {run-id :id} {:transform_id transform-id :status :started :end_time nil}]
    (t2/insert! :model/TransformRunCancelation {:run_id run-id})
    (t2/update! :model/TransformRun :id run-id {:status :canceling})
    (is (true? (t2/select-one-fn :is_active :model/TransformRun :id run-id)))
    (is (t2/exists? :model/TransformRunCancelation :run_id run-id))))

(deftest terminal-status-ends-job-run-test
  (mt/with-temp [:model/TransformJob {job-id :id} {}
                 :model/TransformJobRun {run-id :id} {:job_id job-id :run_method :manual :status :started}]
    (is (true? (t2/select-one-fn :is_active :model/TransformJobRun :id run-id)))
    (t2/update! :model/TransformJobRun :id run-id {:status :failed})
    (let [run (t2/select-one :model/TransformJobRun :id run-id)]
      (is (nil? (:is_active run)))
      (is (some? (:end_time run))))))

(deftest terminal-status-ends-dag-run-test
  (mt/with-temp [:model/Transform {transform-id :id} {}
                 :model/TransformDagRun {run-id :id} {:source_transform_id transform-id
                                                      :direction           :downstream
                                                      :transform_count     1
                                                      :status              :started}]
    (is (true? (t2/select-one-fn :is_active :model/TransformDagRun :id run-id)))
    (t2/update! :model/TransformDagRun :id run-id {:status :succeeded})
    (let [run (t2/select-one :model/TransformDagRun :id run-id)]
      (is (nil? (:is_active run)))
      (is (some? (:end_time run))))))
