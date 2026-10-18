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

(deftest schedule-run-keeps-the-earlier-run-test
  (testing "scheduling a later run keeps a run already pending earlier, and an earlier run replaces a later one"
    (mt/with-temp-scheduler!
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600)
      (is (< 3000 (seconds-until-next-run)))
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 60)
      (is (< (seconds-until-next-run) 61))
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600)
      (is (< (seconds-until-next-run) 61)))))
