(ns metabase.lib-be.swap-source-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(def ^:private swap-options-orders-products
  {:source {:type :table :id (meta/id :orders)}
   :target {:type :table :id (meta/id :products)}})

(deftest ^:parallel swap-table-source-test
  (testing "swapping source-table from orders to products"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
      (is (=? {:stages [{:source-table (meta/id :products)}]}
              (lib-be/swap-source-in-query query swap-options-orders-products))))))

(deftest ^:parallel swap-table-source-with-filter-test
  (testing "swapping source-table updates field refs in filters"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/filter (lib/= (meta/field-metadata :orders :id) 1)))]
      (is (=? {:stages [{:source-table (meta/id :products)
                         :filters [[:= {} [:field {} (meta/id :products :id)] 1]]}]}
              (lib-be/swap-source-in-query query swap-options-orders-products))))))
