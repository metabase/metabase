(ns metabase.transforms.run-write-test
  "Tests for the write functions of the run models."
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.run-write :as run-write]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ending-a-run-sets-its-end-time-test
  (mt/with-temp [:model/Transform {transform-id :id} {}]
    (doseq [[end! status] [[run-write/succeed-started-run! :succeeded]
                           [#(run-write/fail-started-run! % {:message "failed"}) :failed]
                           [run-write/cancel-run! :canceled]
                           [run-write/timeout-run! :timeout]]]
      (testing (str "a run that is " (name status))
        (let [{run-id :id} (run-write/start-run! transform-id {:run_method :manual})]
          (is (nil? (t2/select-one-fn :end_time :model/TransformRun :id run-id)))
          (is (= 1 (end! run-id)))
          (is (=? {:status status :is_active nil :end_time some?}
                  (t2/select-one :model/TransformRun :id run-id))))))))

(deftest ending-a-run-keeps-the-end-time-it-is-given-test
  (mt/with-temp [:model/Transform {transform-id :id} {}]
    (let [{run-id :id} (run-write/start-run! transform-id {:run_method :manual})
          end-time     (mi/current-timestamp)]
      (run-write/succeed-started-run! run-id {:end_time end-time})
      (is (= end-time (t2/select-one-fn :end_time :model/TransformRun :id run-id))))))

(deftest updating-a-run-without-ending-it-leaves-its-end-time-test
  (mt/with-temp [:model/Transform {transform-id :id} {}]
    (let [{run-id :id} (run-write/start-run! transform-id {:run_method :manual})]
      (is (= 1 (run-write/update-run! run-id {:message "running"} {})))
      (is (=? {:status :started :message "running" :end_time nil}
              (t2/select-one :model/TransformRun :id run-id)))
      (is (= 1 (run-write/update-run! run-id {:status :failed :is_active nil} {})))
      (is (some? (t2/select-one-fn :end_time :model/TransformRun :id run-id))))))

(deftest ending-a-coordinated-run-sets-its-end-time-and-updated-at-test
  (mt/with-temp [:model/Transform {transform-id :id} {}]
    (let [{job-run-id :id} (run-write/start-job-run! 1 :manual)
          {dag-run-id :id} (run-write/start-dag-run! transform-id :upstream nil 1)]
      (try
        (is (= 1 (run-write/touch-active-job-run! job-run-id)))
        (is (= 1 (run-write/finish-active-job-run! job-run-id {:status :succeeded :is_active nil})))
        (is (=? {:status :succeeded :end_time some? :updated_at some?}
                (t2/select-one :model/TransformJobRun :id job-run-id)))
        (is (= 1 (run-write/touch-active-dag-run! dag-run-id)))
        (is (= 1 (run-write/finish-active-dag-run! dag-run-id {:status :failed :is_active nil})))
        (is (=? {:status :failed :end_time some? :updated_at some?}
                (t2/select-one :model/TransformDagRun :id dag-run-id)))
        (testing "a finished run is not finished again"
          (is (zero? (run-write/finish-active-job-run! job-run-id {:status :failed :is_active nil})))
          (is (= :succeeded (t2/select-one-fn :status :model/TransformJobRun :id job-run-id))))
        (finally
          (t2/delete! :model/TransformJobRun :id job-run-id)
          (t2/delete! :model/TransformDagRun :id dag-run-id))))))

(deftest run-lifecycle-query-count-test
  (testing "a run that starts and ends issues 5 queries to start, as master did, and 2 to end where master issued 3, since no hook selects the run before the update"
    (mt/with-temp [:model/Transform {transform-id :id} {}]
      (run-write/succeed-started-run! (:id (run-write/start-run! transform-id {:run_method :manual})))
      (let [run (atom nil)]
        (t2/with-call-count [start-count]
          (reset! run (run-write/start-run! transform-id {:run_method :manual}))
          (is (<= (start-count) 5)))
        (t2/with-call-count [end-count]
          (run-write/succeed-started-run! (:id @run))
          (is (<= (end-count) 2)))))))
