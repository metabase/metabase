(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel upgrade-field-refs-in-query-source-table-test
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
            (lib-be/upgrade-field-refs-in-query query)))))

(deftest ^:parallel upgrade-field-refs-in-query-source-card-test
  (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
        query      (-> (lib/query mp (lib.metadata/card mp 1))
                       (lib/with-fields [(meta/field-metadata :orders :id)
                                         (meta/field-metadata :orders :total)
                                         (meta/field-metadata :orders :created-at)])
                       (lib/join (lib/join-clause (meta/table-metadata :products)))
                       (lib/expression "double-tax" (lib/* (meta/field-metadata :orders :tax) 2))
                       (lib/filter (lib/> (meta/field-metadata :orders :total) 10))
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                       (lib/breakout (meta/field-metadata :orders :product-id))
                       (lib/order-by (meta/field-metadata :orders :product-id)))]
    (is (=? {:stages [{:source-card  1
                       :fields       [[:field {} "ID"]
                                      [:field {} "TOTAL"]
                                      [:field {} "CREATED_AT"]
                                      [:expression {} "double-tax"]]
                       :joins        [{:stages     [{:source-table (meta/id :products)}]
                                       :conditions [[:= {}
                                                     [:field {} "PRODUCT_ID"]
                                                     [:field {} (meta/id :products :id)]]]}]
                       :expressions  [[:* {} [:field {} "TAX"] 2]]
                       :filters      [[:> {} [:field {} "TOTAL"] 10]]
                       :aggregation  [[:sum {} [:field {} "TOTAL"]]]
                       :breakout     [[:field {} "PRODUCT_ID"]]
                       :order-by     [[:asc {} [:field {} "PRODUCT_ID"]]]}]}
            (lib-be/upgrade-field-refs-in-query query)))))
