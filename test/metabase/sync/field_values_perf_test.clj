(ns metabase.sync.field-values-perf-test
  "Performance tests for field values sync.
   Measures query count when syncing tables with many fields."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.test.data :as data]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-wide-table!
  "Create a table with `n` integer columns, each with a few distinct values."
  [n]
  (let [col-defs (map #(format "col_%03d INT NOT NULL" %) (range n))
        ddl      (format "CREATE TABLE wide_table (%s);" (str/join ", " col-defs))]
    (jdbc/execute! one-off-dbs/*conn* [ddl])
    ;; Insert 10 rows so each column has distinct values worth syncing
    (dotimes [row 10]
      (let [vals (map #(str (mod (+ row %) 5)) (range n))
            sql  (format "INSERT INTO wide_table VALUES (%s);" (str/join ", " vals))]
        (jdbc/execute! one-off-dbs/*conn* [sql])))))

(defn- setup-field-values-for-table!
  "Activate field values for all normal fields in a table so sync will update them."
  [table-id]
  (let [fields (t2/select :model/Field :table_id table-id :active true :visibility_type "normal")]
    (doseq [field fields]
      (field-values/get-or-create-full-field-values! field))))

(deftest sync-field-values-query-count-test
  (testing "Bulk scan: should use 1 query for all 100 fields instead of 100"
    (one-off-dbs/with-blank-db
      (create-wide-table! 100)
      (sync/sync-database! (data/db))
      (let [table    (t2/select-one :model/Table :db_id (:id (data/db)) :name "WIDE_TABLE")
            _        (setup-field-values-for-table! (:id table))
            qp-calls (atom 0)]
        (with-redefs [qp/process-query
                      (let [original qp/process-query]
                        (fn [& args]
                          (swap! qp-calls inc)
                          (apply original args)))]
          (let [result (sync.field-values/update-field-values-for-table! table)]
            (testing "Should process all 100 fields without errors"
              (is (zero? (:errors result))))
            (testing "Bulk scan should use exactly 1 query"
              (is (= 1 @qp-calls)))))))))

(deftest sync-field-values-correctness-test
  (testing "Bulk scan produces correct distinct values"
    (one-off-dbs/with-blank-db
      (create-wide-table! 5)
      (sync/sync-database! (data/db))
      (let [table  (t2/select-one :model/Table :db_id (:id (data/db)) :name "WIDE_TABLE")
            _      (setup-field-values-for-table! (:id table))
            fields (t2/select :model/Field :table_id (:id table) :active true :visibility_type "normal"
                              {:order-by [[:name :asc]]})]
        ;; Run the sync
        (sync.field-values/update-field-values-for-table! table)
        ;; Check that each field got its values populated
        (doseq [field fields]
          (let [fv (t2/select-one :model/FieldValues :field_id (:id field) :type :full)]
            (testing (format "Field %s should have field values" (:name field))
              (is (some? fv))
              (when fv
                (is (= 5 (count (:values fv))))
                (is (false? (:has_more_values fv)))))))))))
