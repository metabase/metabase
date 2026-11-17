(ns metabase.sync.task.scan-field-values-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.task.scan-field-values :as task.scan-field-values]
   [metabase.sync.task.util-test :as sync.task.util-test]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.field-values :as field-values])
  (:import
   (metabase.sync.task.scan_field_values ScanDatabaseFieldValues ScanFieldValues ScanTableFieldValues)
   (org.quartz Job)))

(set! *warn-on-reflection* true)

(deftest ^:parallel annotations-test
  (doseq [^Class job-class [ScanDatabaseFieldValues ScanTableFieldValues ScanFieldValues]]
    (is (.isAnnotationPresent job-class org.quartz.DisallowConcurrentExecution))))

(deftest ^:parallel schedule-scans-use-own-jobs-test
  (is (= {:job-class ScanDatabaseFieldValues, :id 7}
         (sync.task.util-test/scheduled-run #(task.scan-field-values/schedule-database-field-values-scan! 7))))
  (is (= {:job-class ScanTableFieldValues, :id 7}
         (sync.task.util-test/scheduled-run #(task.scan-field-values/schedule-table-field-values-scan! 7))))
  (is (= {:job-class ScanFieldValues, :id 7}
         (sync.task.util-test/scheduled-run #(task.scan-field-values/schedule-field-values-scan! 7)))))

(deftest scans-run-in-jobs-and-without-scheduler-test
  (let [scanned (atom [])]
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table    {table-id :id}    {:db_id database-id}
                   :model/Field    {field-id :id}    {:table_id table-id}]
      (mt/with-dynamic-fn-redefs [quick-task/submit-task!                            (fn [task] (task))
                                  sync.field-values/update-field-values!             #(swap! scanned conj [:database %])
                                  sync.field-values/update-field-values-for-table!   #(swap! scanned conj [:table (:id %)])
                                  field-values/create-or-update-full-field-values! #(swap! scanned conj [:field (:id %)])]
        (testing "job runs scan of its target"
          (.execute ^Job (task.scan-field-values/->ScanDatabaseFieldValues)
                    (sync.task.util-test/job-context "scan-database" database-id))
          (.execute ^Job (task.scan-field-values/->ScanTableFieldValues)
                    (sync.task.util-test/job-context "scan-table" table-id))
          (.execute ^Job (task.scan-field-values/->ScanFieldValues)
                    (sync.task.util-test/job-context "scan-field" field-id))
          (is (= [[:database database-id] [:table table-id] [:field field-id]] @scanned)))
        (testing "request without scheduler runs scan of its target and skips deleted targets"
          (reset! scanned [])
          (task.scan-field-values/schedule-database-field-values-scan! database-id)
          (task.scan-field-values/schedule-table-field-values-scan! table-id)
          (task.scan-field-values/schedule-field-values-scan! field-id)
          (task.scan-field-values/schedule-database-field-values-scan! Integer/MAX_VALUE)
          (task.scan-field-values/schedule-table-field-values-scan! Integer/MAX_VALUE)
          (task.scan-field-values/schedule-field-values-scan! Integer/MAX_VALUE)
          (is (= [[:database database-id] [:table table-id] [:field field-id]] @scanned)))))))

(deftest field-scan-that-cannot-fetch-values-throws-test
  (mt/with-dynamic-fn-redefs [field-values/create-or-update-full-field-values! (constantly ::field-values/fv-fetch-failed)]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Could not fetch field values"
                          (#'task.scan-field-values/scan-field! (mt/id :venues :price))))))
