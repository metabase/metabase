(ns metabase-enterprise.dependencies.task.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.task.core :as task]
   [metabase.test :as mt])
  (:import
   (java.util Date)
   (org.quartz Scheduler TriggerKey)))

(set! *warn-on-reflection* true)

(defn- seconds-until-next-run ^long []
  (let [fire-time (.getNextFireTime (.getTrigger ^Scheduler (task/scheduler)
                                                 (TriggerKey. "metabase.dependencies.task.result-metadata.trigger")))]
    (quot (- (.getTime ^Date fire-time) (System/currentTimeMillis)) 1000)))

(deftest schedule-run-keeps-earlier-run-test
  (testing "scheduling a later run keeps a run already pending earlier, and an earlier run replaces a later one"
    (mt/with-temp-scheduler!
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600)
      (is (< 3000 (seconds-until-next-run)))
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 60)
      (is (< (seconds-until-next-run) 61))
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600)
      (is (< (seconds-until-next-run) 61)))))

(deftest schedule-run-leaves-earlier-run-alone-test
  (testing "scheduling a later run while an earlier one is pending does not replace the pending trigger"
    (mt/with-temp-scheduler!
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 60)
      (let [scheduled (atom 0)]
        (mt/with-dynamic-fn-redefs [task/schedule-task! (fn [& _] (swap! scheduled inc))]
          (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 60)
          (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600))
        (is (zero? @scheduled))))))

(deftest schedule-run-moves-past-due-run-test
  (testing "scheduling a run moves a run pending in the past, which Quartz may not fire for minutes, to a second from now"
    (mt/with-temp-scheduler!
      (mt/with-dynamic-fn-redefs [task.util/next-fire-time (constantly (Date. (- (.getTime (Date.)) (* 20 60 1000))))]
        (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600))
      (is (<= 0 (seconds-until-next-run) 1)))))

(defn- test-job
  "A job with `job-key` and `batch-size` whose batch is `run-batch!`."
  [job-key batch-size run-batch!]
  (assoc @#'task.result-metadata/job
         :job-key    job-key
         :batch-size (constantly batch-size)
         :run-batch! run-batch!))

(defn- lock-failure
  "The exception a cluster lock throws when the lock named `lock-name` could not be taken."
  [lock-name]
  (ex-info "Failed to obtain cluster lock" {:lock-names [lock-name]}))

(deftest run-batch-in-place-test
  (testing "a batch run in place says whether it took anything"
    (is (= :worked (task.util/run-batch-in-place! (test-job "test.worked" 1 (constantly 1)))))
    (is (= :idle (task.util/run-batch-in-place! (test-job "test.idle" 1 (constantly nil))))))
  (testing "a batch size that isn't positive disables the job"
    (is (= :disabled (task.util/run-batch-in-place! (test-job "test.disabled" 0 #(throw (ex-info "ran" {})))))))
  (testing "a batch does not hold up a batch of another job"
    (let [inner (promise)]
      (task.util/run-batch-in-place!
       (test-job "test.outer" 1 (fn []
                                  (deliver inner (deref (future (task.util/run-batch-in-place!
                                                                 (test-job "test.inner" 1 (constantly nil))))
                                                        10000 :blocked))
                                  nil)))
      (is (= :idle @inner))))
  (testing "a batch whose lock another runner holds is busy"
    (mt/with-dynamic-fn-redefs [cluster-lock/do-with-detached-cluster-lock
                                (fn [_ _] (throw (lock-failure "metabase-enterprise.dependencies.task/test.busy")))]
      (is (= :busy (task.util/run-batch-in-place! (test-job "test.busy" 1 (constantly 1)))))))
  (testing "the failure to take another lock is not swallowed"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to obtain cluster lock"
                          (task.util/run-batch-in-place! (test-job "test.other" 1 #(throw (lock-failure "other/lock"))))))))

(deftest run-and-reschedule-busy-test
  (testing "a scheduled run whose lock another runner holds runs again in a second rather than failing"
    (let [delays (atom [])]
      (mt/with-dynamic-fn-redefs [cluster-lock/do-with-detached-cluster-lock
                                  (fn [_ _] (throw (lock-failure "metabase-enterprise.dependencies.task/test.busy")))
                                  task.util/schedule-run! (fn [_ _ delay-in-seconds] (swap! delays conj delay-in-seconds))]
        (task.util/run-and-reschedule! nil (test-job "test.busy" 1 (constantly nil))))
      (is (= [1] @delays)))))
