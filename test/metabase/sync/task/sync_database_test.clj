(ns metabase.sync.task.sync-database-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.task.sync-database :as task.sync-database]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task])
  (:import
   (metabase.sync.task.sync_database SyncDatabase)
   (org.quartz Job JobDataMap JobDetail JobExecutionContext SimpleTrigger Trigger)))

(set! *warn-on-reflection* true)

(defn- job-context
  "A job context that carries `database-id`."
  ^JobExecutionContext [database-id]
  (reify JobExecutionContext
    (getMergedJobDataMap [_] (JobDataMap. {"id" database-id}))))

(deftest ^:parallel job-and-trigger-test
  (let [^JobDetail job         (#'task.sync-database/job 7)
        ^SimpleTrigger trigger (#'task.sync-database/trigger 7)]
    (testing "job allows one run at a time"
      (is (= SyncDatabase (.getJobClass job)))
      (is (.isAnnotationPresent SyncDatabase org.quartz.DisallowConcurrentExecution)))
    (testing "keys are fixed per Database"
      (is (= "metabase.task.sync-database.job.7" (.getName (.getKey job))))
      (is (= (.getKey job) (.getJobKey trigger)))
      (is (= "metabase.task.sync-database.trigger.7" (.getName (.getKey trigger)))))
    (testing "job carries Database id and is deleted with its last trigger"
      (is (= {"id" 7, task/metrics-job-name-key "metabase.task.sync-database.job"}
             (into {} (.getJobDataMap job))))
      (is (not (.isDurable job))))
    (testing "trigger fires once however long it waits"
      (is (= 0 (.getRepeatCount trigger)))
      (is (= Trigger/MISFIRE_INSTRUCTION_IGNORE_MISFIRE_POLICY (.getMisfireInstruction trigger))))))

(defn- sync-calls!
  "Call `thunk` and return the calls of the Database sync steps that it made."
  [thunk]
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [sync-metadata/sync-db-metadata-explicit! #(swap! calls conj [:sync (:id %)])
                                analyze/analyze-db-explicit!             #(swap! calls conj [:analyze (:id %)])]
      (thunk))
    @calls))

(deftest schedule-database-sync-with-scheduler-test
  (let [scheduled (atom [])]
    (mt/with-dynamic-fn-redefs [task/schedule-once! (fn [^JobDetail job ^Trigger trigger]
                                                      (swap! scheduled conj [(.getName (.getKey job))
                                                                             (.getName (.getKey trigger))])
                                                      true)]
      (is (= [] (sync-calls! #(task.sync-database/schedule-database-sync! (mt/id)))))
      (is (= [[(format "metabase.task.sync-database.job.%d" (mt/id))
               (format "metabase.task.sync-database.trigger.%d" (mt/id))]]
             @scheduled)))))

(deftest schedule-database-sync-without-scheduler-test
  (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [task] (task))]
    (is (= [[:sync (mt/id)] [:analyze (mt/id)]]
           (sync-calls! #(task.sync-database/schedule-database-sync! (mt/id)))))))

(deftest sync-database-job-test
  (is (= [[:sync (mt/id)] [:analyze (mt/id)]]
         (sync-calls! #(.execute ^Job (SyncDatabase.) (job-context (mt/id))))))
  (testing "thrown exception is rethrown"
    (mt/with-dynamic-fn-redefs [sync-metadata/sync-db-metadata-explicit! (fn [_] (throw (ex-info "no connection" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no connection"
                            (.execute ^Job (SyncDatabase.) (job-context (mt/id)))))))
  (testing "sync is interrupted at timeout"
    (let [interrupted (promise)]
      (mt/with-dynamic-fn-redefs [quick-task/task-timeout-ms               (constantly 2000)
                                  sync-metadata/sync-db-metadata-explicit! (fn [_]
                                                                             (try
                                                                               (Thread/sleep 60000)
                                                                               (catch InterruptedException _
                                                                                 (deliver interrupted true))))]
        (.execute ^Job (SyncDatabase.) (job-context (mt/id))))
      (is (true? (deref interrupted 5000 :not-interrupted))))))
