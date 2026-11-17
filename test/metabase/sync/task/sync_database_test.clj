(ns metabase.sync.task.sync-database-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.task.sync-database :as task.sync-database]
   [metabase.sync.task.util-test :as sync.task.util-test]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task])
  (:import
   (metabase.sync.task.sync_database SyncDatabase)
   (org.quartz Job)))

(set! *warn-on-reflection* true)

(deftest ^:parallel annotations-test
  (is (.isAnnotationPresent SyncDatabase org.quartz.DisallowConcurrentExecution)))

(deftest schedule-database-sync-uses-sync-database-job-test
  (is (= {:job-class SyncDatabase, :id 7}
         (sync.task.util-test/scheduled-run! #(task.sync-database/schedule-database-sync! 7)))))

(deftest sync-database-runs-in-job-and-without-scheduler-test
  (let [calls (atom [])]
    (mt/with-temp [:model/Database {database-id :id} {}]
      (mt/with-dynamic-fn-redefs [quick-task/submit-task!                  (fn [task] (task))
                                  sync-metadata/sync-db-metadata-explicit! #(swap! calls conj [:sync %])
                                  analyze/analyze-db-explicit!             #(swap! calls conj [:analyze %])]
        (.execute ^Job (SyncDatabase.) (sync.task.util-test/job-context "sync-database" database-id))
        (task.sync-database/schedule-database-sync! database-id)
        (testing "deleted Database is skipped"
          (task.sync-database/schedule-database-sync! Integer/MAX_VALUE))
        (is (= [[:sync database-id] [:analyze database-id] [:sync database-id] [:analyze database-id]]
               @calls))))))
