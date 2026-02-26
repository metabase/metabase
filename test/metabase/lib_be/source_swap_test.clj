(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel upgrade-field-refs-in-query-table-single-stage-test
  (testing "should not change field id refs on stage with the table source"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)
                                      (meta/field-metadata :orders :total)
                                      (meta/field-metadata :orders :created-at)])
                    (lib/join (lib/join-clause (meta/table-metadata :products)))
                    (lib/expression "double-tax" (lib/* (meta/field-metadata :orders :tax) 2))
                    (lib/filter (lib/> (meta/field-metadata :orders :total) 10))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                    (lib/breakout (meta/field-metadata :orders :product-id))
                    (lib/order-by (meta/field-metadata :orders :product-id)))]
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} (meta/id :orders :id)]
                                        [:field {} (meta/id :orders :total)]
                                        [:field {} (meta/id :orders :created-at)]
                                        [:expression {} "double-tax"]]
                         :joins        [{:stages     [{:source-table (meta/id :products)}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :orders :product-id)]
                                                       [:field {} (meta/id :products :id)]]]}]
                         :expressions  [[:* {} [:field {} (meta/id :orders :tax)] 2]]
                         :filters      [[:> {} [:field {} (meta/id :orders :total)] 10]]
                         :aggregation  [[:sum {} [:field {} (meta/id :orders :total)]]]
                         :breakout     [[:field {} (meta/id :orders :product-id)]]
                         :order-by     [[:asc {} [:field {} (meta/id :orders :product-id)]]]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

