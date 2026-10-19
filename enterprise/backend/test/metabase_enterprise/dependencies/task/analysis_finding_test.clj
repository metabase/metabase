(ns metabase-enterprise.dependencies.task.analysis-finding-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [environ.core :as env]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.dependencies.hooks :as dependencies.hooks]
   [metabase.task.core :as task]
   [metabase.test :as mt])
  (:import
   (org.quartz JobDetail)))

(set! *warn-on-reflection* true)

(deftest ^:synchronized batch-size-zero-disables-job-test
  (testing "a batch size that isn't positive keeps the job from being scheduled by writes or at startup"
    (let [scheduled    (atom [])
          scheduled-by (fn [thunk]
                         (reset! scheduled [])
                         (thunk)
                         (count @scheduled))]
      (mt/with-dynamic-fn-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (with-redefs [env/env (assoc env/env :mb-dependency-entity-check-batch-size "0")]
          (is (zero? (scheduled-by task.analysis-finding/trigger-analysis-finding-job!)))
          (is (zero? (scheduled-by #(task/init! ::task.analysis-finding/UpdateAnalysisFindings)))))
        (testing "a positive batch size schedules from the event trigger"
          (with-redefs [env/env (assoc env/env :mb-dependency-entity-check-batch-size "5")]
            (is (= 1 (scheduled-by task.analysis-finding/trigger-analysis-finding-job!)))))))))

(deftest ^:synchronized run-stops-without-feature-test
  (testing "a run without the dependencies feature schedules no next run, since the next write or token update triggers one"
    (let [scheduled (atom [])]
      (mt/with-dynamic-fn-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (mt/with-premium-features #{}
          (task.util/run-and-reschedule! nil @#'task.analysis-finding/job))
        (is (empty? @scheduled))))))

(def ^:private job-key "metabase.dependencies.task.entity-check.job")

(defn- scheduled-job-names
  "Job names from captured [[task/schedule-task!]] calls, since a token update schedules every dependency job."
  [calls]
  (into #{} (map (fn [args] (.getName (.getKey ^JobDetail (nth args 1))))) calls))

(deftest ^:synchronized token-update-restarts-job-test
  (testing "Setting a premium token must restart the analysis finding job, or enabling the feature on an idle instance
           leaves the periodic checker dead until the next process restart."
    (let [scheduled (atom [])]
      (mt/with-dynamic-fn-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (mt/with-premium-features #{:dependencies}
          (dependencies.hooks/after-premium-token-update)
          (is (contains? (scheduled-job-names @scheduled) job-key)))))))
