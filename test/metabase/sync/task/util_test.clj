(ns metabase.sync.task.util-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [metabase.sync.task.util :as sync.task.util]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task])
  (:import
   (java.util.concurrent LinkedBlockingQueue TimeUnit)
   (org.quartz JobDataMap JobDetail JobExecutionContext Trigger)))

(set! *warn-on-reflection* true)

(defn job-context
  "A job context of a job with the key `job-name` that carries the target `id`."
  ^JobExecutionContext [job-name id]
  (reify JobExecutionContext
    (getMergedJobDataMap [_] (JobDataMap. {"id" id}))
    (getJobDetail [_] (reify JobDetail (getKey [_] (jobs/key job-name))))))

(defn scheduled-run!
  "Call `schedule!`, a thunk that requests one run, and return the job class and the target id that it gave the scheduler."
  [schedule!]
  (let [scheduled (atom nil)]
    (mt/with-dynamic-fn-redefs [task/schedule-once! (fn [^JobDetail job ^Trigger trigger]
                                                      (reset! scheduled {:job-class (.getJobClass job)
                                                                         :id        (get (.getJobDataMap trigger) "id")})
                                                      true)]
      (schedule!))
    @scheduled))

(def ^:private ^LinkedBlockingQueue runs (LinkedBlockingQueue.))

(task/defjob RecordingJob
  {:saved-class "metabase.sync.task.util_test.RecordingJob"
   :concurrent? false}
  [job-context]
  (.put runs [:job (get (qc/from-job-data job-context) "id")]))

(def ^:private recording-job
  (sync.task.util/job RecordingJob "metabase.task.util-test.job" "Record run"))

(deftest schedule-with-scheduler-test
  (.clear runs)
  (mt/with-temp-scheduler!
    (sync.task.util/schedule! recording-job 7 #(.put runs [:in-process %]))
    (is (= [:job 7] (.poll runs 5 TimeUnit/SECONDS)))
    (is (nil? (.poll runs 200 TimeUnit/MILLISECONDS)))))

(deftest schedule-without-scheduler-test
  (.clear runs)
  (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [task] (task))]
    (sync.task.util/schedule! recording-job 7 #(.put runs [:in-process %]))
    (is (= [:in-process 7] (.poll runs)))))

(deftest run-for-target-test
  (testing "target id of job context is passed on"
    (is (= 7 (sync.task.util/run-for-target! identity (job-context "metabase.task.util-test.job" 7)))))
  (testing "thrown exception is logged by message and not rethrown"
    (mt/with-log-messages-for-level [messages [metabase.sync.task.util :warn]]
      (is (nil? (sync.task.util/run-for-target! (fn [_] (throw (ex-info "no connection" {})))
                                                (job-context "metabase.task.util-test.job" 7))))
      (is (= [{:level :warn, :e nil, :message "metabase.task.util-test.job failed for 7: no connection"}]
             (map #(select-keys % [:level :e :message]) (messages)))))))
