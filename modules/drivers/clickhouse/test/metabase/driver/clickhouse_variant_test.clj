(ns ^:mb/driver-tests metabase.driver.clickhouse-variant-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mt/defdataset dynamic_types_test
  [["placeholder"
    [{:field-name "i", :base-type {:native "Int32"}}]
    []]])

(deftest ^:synchronized variant-and-dynamic-test
  (mt/test-driver :clickhouse
    (mt/dataset dynamic_types_test
      (let [exec! #(metabase.test.data.clickhouse/exec-statements % (:details (mt/db)))]
        (exec! ["DROP TABLE IF EXISTS dynamic_types_test.things"
                (str "CREATE TABLE dynamic_types_test.things (id UInt32, v Variant(String, UInt64), d Dynamic) "
                     "ENGINE = MergeTree ORDER BY id")
                "INSERT INTO dynamic_types_test.things VALUES (1, 'a', 1), (2, 5::UInt64, 'b'), (3, 'a', [1, 2]), (4, NULL, NULL)"])
        (try
          (sync/sync-database! (mt/id))
          (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :name "things")]
            (testing "Variant and Dynamic columns are text"
              (is (= {"v" :type/Text, "d" :type/Text}
                     (t2/select-fn->fn :name :base_type :model/Field :table_id table-id :name [:in ["v" "d"]])))))
          (finally
            (exec! ["DROP TABLE IF EXISTS dynamic_types_test.things"])))))))
