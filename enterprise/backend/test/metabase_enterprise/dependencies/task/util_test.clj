(ns metabase-enterprise.dependencies.task.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.task.util :as task.util]
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
