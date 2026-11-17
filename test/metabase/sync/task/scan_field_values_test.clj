(ns metabase.sync.task.scan-field-values-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.task.scan-field-values :as task.scan-field-values]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.field-values :as field-values])
  (:import
   (metabase.sync.task.scan_field_values ScanFieldValues)))

(set! *warn-on-reflection* true)

(deftest ^:parallel annotations-test
  (is (.isAnnotationPresent ScanFieldValues org.quartz.DisallowConcurrentExecution)))

(deftest schedule-scans-with-scheduler-test
  (let [table-scanned (promise)
        field-scanned (promise)]
    (with-redefs [sync.field-values/update-field-values-for-table!   #(deliver table-scanned (:id %))
                  field-values/create-or-update-full-field-values! #(deliver field-scanned (:id %))]
      (mt/with-temp-scheduler!
        (task/init! ::task.scan-field-values/ScanFieldValues)
        (task.scan-field-values/schedule-table-field-values-scan! (mt/id :venues))
        (task.scan-field-values/schedule-field-values-scan! (mt/id :venues :price))
        (is (= (mt/id :venues) (deref table-scanned 5000 :not-run)))
        (is (= (mt/id :venues :price) (deref field-scanned 5000 :not-run)))))))

(deftest schedule-scans-without-scheduler-test
  (let [scanned (atom [])]
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id}]
      (mt/with-dynamic-fn-redefs [quick-task/submit-task!                            (fn [task] (task))
                                  sync.field-values/update-field-values-for-table!   #(swap! scanned conj [:table (:id %)])
                                  field-values/create-or-update-full-field-values! #(swap! scanned conj [:field (:id %)])]
        (task.scan-field-values/schedule-table-field-values-scan! table-id)
        (task.scan-field-values/schedule-field-values-scan! field-id)
        (testing "deleted Table and Field are skipped"
          (task.scan-field-values/schedule-table-field-values-scan! Integer/MAX_VALUE)
          (task.scan-field-values/schedule-field-values-scan! Integer/MAX_VALUE))
        (is (= [[:table table-id] [:field field-id]] @scanned))))))
