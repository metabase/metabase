(ns ^:mb/driver-tests metabase.driver.clickhouse-variant-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.test :as qp]
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
          (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :name "things")
                mp       (mt/metadata-provider)
                field    (fn [field-name]
                           (lib.metadata/field mp (t2/select-one-pk :model/Field :table_id table-id :name field-name)))
                query    (lib/query mp (lib.metadata/table mp table-id))
                rows     #(mt/rows (qp/process-query %))]
            (testing "Variant and Dynamic columns are text"
              (is (= {"v" :type/Text, "d" :type/Text}
                     (t2/select-fn->fn :name :base_type :model/Field :table_id table-id :name [:in ["v" "d"]]))))
            (testing "the values are text"
              (is (= [[1 "a" "1"] [2 "5" "b"] [3 "a" "[1,2]"] [4 nil nil]]
                     (rows (lib/order-by query (field "id"))))))
            (testing "group by and sort (ClickHouse sorts NULL last)"
              (is (= [["5" 1] ["a" 2] [nil 1]]
                     (rows (-> query (lib/breakout (field "v")) (lib/aggregate (lib/count)))))))
            (testing "filter"
              (is (= [[1] [3]]
                     (rows (-> query
                               (lib/with-fields [(field "id")])
                               (lib/filter (lib/= (field "v") "a"))
                               (lib/order-by (field "id"))))))
              (is (= [[2]]
                     (rows (-> query
                               (lib/with-fields [(field "id")])
                               (lib/filter (lib/contains (field "d") "b")))))))
            (testing "aggregate"
              (is (= [["a" "b"]]
                     (rows (-> query (lib/aggregate (lib/max (field "v"))) (lib/aggregate (lib/max (field "d"))))))))
            (testing "in a nested query"
              (is (= [["a" 2]]
                     (rows (-> query
                               (lib/breakout (field "v"))
                               (lib/aggregate (lib/count))
                               lib/append-stage
                               (as-> q (lib/filter q (lib/= (first (lib/filterable-columns q)) "a")))))))))
          (finally
            (exec! ["DROP TABLE IF EXISTS dynamic_types_test.things"])))))))
