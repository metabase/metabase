(ns metabase.sync.task.sync-table-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.sync :as sync]
   [metabase.sync.task.sync-table :as task.sync-table]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task])
  (:import
   (metabase.sync.task.sync_table SyncTable)))

(set! *warn-on-reflection* true)

(deftest ^:parallel annotations-test
  (is (.isAnnotationPresent SyncTable org.quartz.DisallowConcurrentExecution)))

(deftest schedule-table-sync-with-scheduler-test
  (let [synced (promise)]
    (with-redefs [sync/sync-table! #(deliver synced (:id %))]
      (mt/with-temp-scheduler!
        (task/init! ::task.sync-table/SyncTable)
        (task.sync-table/schedule-table-sync! (mt/id :venues))
        (is (= (mt/id :venues) (deref synced 5000 :not-run)))))))

(deftest schedule-table-sync-without-scheduler-test
  (let [synced (atom [])]
    (mt/with-temp [:model/Table {table-id :id} {}]
      (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [task] (task))
                                  sync/sync-table!        #(swap! synced conj (:id %))]
        (task.sync-table/schedule-table-sync! table-id)
        (testing "deleted Table is skipped"
          (task.sync-table/schedule-table-sync! Integer/MAX_VALUE))
        (is (= [table-id] @synced))))))
