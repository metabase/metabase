(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]))

(def ^:private swap-options-orders
  {:source {:type :table :id (mt/id :orders_a)}
   :target {:type :table :id (mt/id :orders_b)}})

(deftest ^:parallel swap-table-source-test
  (mt/dataset defs/source-swap
    (testing "swapping source-table from orders_a to orders_b"
      (let [mp    (mt/metadata-provider)
            query (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))]
        (is (=? {:stages [{:source-table (mt/id :orders_b)}]}
                (lib-be/swap-source-in-query query swap-options-orders)))))))

(deftest ^:parallel swap-table-source-with-filter-test
  (mt/dataset defs/source-swap
    (testing "swapping source-table updates field refs in filters"
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))
                      (lib/filter (lib/= (lib.metadata/field mp (mt/id :orders_a :id)) 1)))]
        (is (=? {:stages [{:source-table (mt/id :orders_b)
                           :filters [[:= {} [:field {} (mt/id :orders_b :id)] 1]]}]}
                (lib-be/swap-source-in-query query swap-options-orders)))))))
