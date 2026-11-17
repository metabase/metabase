(ns metabase.sync.task.sync-table-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.sync :as sync]
   [metabase.sync.task.sync-table :as task.sync-table]
   [metabase.sync.task.util-test :as sync.task.util-test]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task])
  (:import
   (metabase.sync.task.sync_table SyncTable)
   (org.quartz Job)))

(set! *warn-on-reflection* true)

(deftest ^:parallel annotations-test
  (is (.isAnnotationPresent SyncTable org.quartz.DisallowConcurrentExecution)))

(deftest ^:parallel schedule-table-sync-uses-sync-table-job-test
  (is (= {:job-class SyncTable, :id 7}
         (sync.task.util-test/scheduled-run #(task.sync-table/schedule-table-sync! 7)))))

(deftest sync-table-runs-in-job-and-without-scheduler-test
  (let [synced (atom [])]
    (mt/with-temp [:model/Table {table-id :id} {}]
      (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [task] (task))
                                  sync/sync-table!        #(swap! synced conj (:id %))]
        (.execute ^Job (task.sync-table/->SyncTable) (sync.task.util-test/job-context "sync-table" table-id))
        (task.sync-table/schedule-table-sync! table-id)
        (testing "deleted Table is skipped"
          (task.sync-table/schedule-table-sync! Integer/MAX_VALUE))
        (is (= [table-id table-id] @synced))))))
