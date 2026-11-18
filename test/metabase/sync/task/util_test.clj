(ns metabase.sync.task.util-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [metabase.sync.task.util :as sync.task.util]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task])
  (:import
   (java.util.concurrent LinkedBlockingQueue TimeUnit)
   (org.quartz JobDataMap JobDetail JobExecutionContext SimpleTrigger Trigger)))

(set! *warn-on-reflection* true)

(defn job-context
  "A job context of a job that carries the target `id`."
  ^JobExecutionContext [id]
  (reify JobExecutionContext
    (getMergedJobDataMap [_] (JobDataMap. {"id" id}))))

(defn scheduled-run!
  "Call `schedule!`, a thunk that requests one run, and return the job class and the target id that it gave the scheduler."
  [schedule!]
  (let [scheduled (atom nil)]
    (mt/with-dynamic-fn-redefs [task/schedule-once! (fn [^JobDetail job _trigger]
                                                      (reset! scheduled {:job-class (.getJobClass job)
                                                                         :id        (get (.getJobDataMap job) "id")})
                                                      true)]
      (schedule!))
    @scheduled))

(def ^:private ^LinkedBlockingQueue runs (LinkedBlockingQueue.))

(def ^:private ^LinkedBlockingQueue release (LinkedBlockingQueue.))

(task/defjob RecordingJob
  {:saved-class "metabase.sync.task.util_test.RecordingJob"
   :concurrent? false}
  [job-context]
  (.put runs [:job (get (qc/from-job-data job-context) "id")])
  (.poll release 5 TimeUnit/SECONDS))

(defn- recording-job [id]
  (sync.task.util/job RecordingJob "metabase.task.util-test" "Record run" id))

(defn- next-run []
  (.poll runs 5 TimeUnit/SECONDS))

(deftest ^:parallel job-and-trigger-test
  (let [job                    (recording-job 7)
        ^SimpleTrigger trigger (#'sync.task.util/trigger job)]
    (testing "keys are fixed per target"
      (is (= "metabase.task.util-test.job.7" (.getName (.getKey job))))
      (is (= "metabase.task.util-test.trigger.7" (.getName (.getKey trigger)))))
    (testing "job is deleted with its last trigger"
      (is (not (.isDurable job))))
    (testing "fires once however long it waits"
      (is (= 0 (.getRepeatCount trigger)))
      (is (= Trigger/MISFIRE_INSTRUCTION_IGNORE_MISFIRE_POLICY (.getMisfireInstruction trigger))))))

(deftest schedule-with-scheduler-test
  (.clear runs)
  (.clear release)
  (mt/with-temp-scheduler!
    (sync.task.util/schedule! (recording-job 7) 7 #(.put runs [:in-process %]))
    (is (= [:job 7] (next-run)))
    (testing "target requested many times during its run runs once more after it"
      (dotimes [_ 3]
        (sync.task.util/schedule! (recording-job 7) 7 #(.put runs [:in-process %])))
      (.put release :go)
      (is (= [:job 7] (next-run)))
      (.put release :go)
      (is (nil? (.poll runs 500 TimeUnit/MILLISECONDS))))))

(deftest schedule-without-scheduler-test
  (.clear runs)
  (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [task] (task))]
    (sync.task.util/schedule! (recording-job 7) 7 #(.put runs [:in-process %]))
    (is (= [:in-process 7] (.poll runs)))))

(deftest run-for-target-test
  (testing "target id of job context is passed on"
    (let [ids (atom [])]
      (sync.task.util/run-for-target! #(swap! ids conj %) (job-context 7))
      (is (= [7] @ids))))
  (testing "thrown exception is rethrown"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no connection"
                          (sync.task.util/run-for-target! (fn [_] (throw (ex-info "no connection" {})))
                                                          (job-context 7))))))

(deftest run-for-target-interrupts-work-at-timeout-test
  (let [interrupted (promise)]
    (mt/with-dynamic-fn-redefs [quick-task/task-timeout-ms (constantly 2000)]
      (is (nil? (sync.task.util/run-for-target! (fn [_]
                                                  (try
                                                    (Thread/sleep 60000)
                                                    (catch InterruptedException _
                                                      (deliver interrupted true))))
                                                (job-context 7)))))
    (is (true? (deref interrupted 5000 :not-interrupted)))))
