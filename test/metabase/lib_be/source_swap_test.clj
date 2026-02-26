(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel should-upgrade-field-refs-in-query?-table-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields [(meta/field-metadata :orders :id)
                                    (meta/field-metadata :orders :total)
                                    (meta/field-metadata :orders :created-at)]))]
    (is (false? (lib-be/should-upgrade-field-refs-in-query? query)))))

(deftest ^:parallel should-upgrade-field-refs-in-query?-card-test
  (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
        query      (-> (lib/query mp (lib.metadata/card mp 1))
                       (lib/with-fields [(meta/field-metadata :orders :id)
                                         (meta/field-metadata :orders :total)
                                         (meta/field-metadata :orders :created-at)]))]
    (is (true? (lib-be/should-upgrade-field-refs-in-query? query)))))

(deftest ^:parallel should-upgrade-field-refs-in-query?-table-join-table-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/join (lib/join-clause (meta/table-metadata :products))))]
    (is (false? (lib-be/should-upgrade-field-refs-in-query? query)))))

(deftest ^:parallel should-upgrade-field-refs-in-query?-table-join-card-test
  (let [products-query (lib/query meta/metadata-provider (meta/table-metadata :products))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 products-query)
        query          (-> (lib/query mp (meta/table-metadata :orders))
                           (lib/join (lib/join-clause (lib.metadata/card mp 1)
                                                      [(lib/= (meta/field-metadata :orders :product-id)
                                                              (meta/field-metadata :products :id))])))]
    (is (true? (lib-be/should-upgrade-field-refs-in-query? query)))))

(deftest ^:parallel should-upgrade-field-refs-in-query?-card-join-table-test
  (let [orders-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp           (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
        query        (-> (lib/query mp (lib.metadata/card mp 1))
                         (lib/join (lib/join-clause (meta/table-metadata :products)
                                                    [(lib/= (meta/field-metadata :orders :product-id)
                                                            (meta/field-metadata :products :id))])))]
    (is (true? (lib-be/should-upgrade-field-refs-in-query? query)))))

(deftest ^:parallel upgrade-field-refs-in-query-noop-test
  (testing "should return the identical query when no refs are upgraded"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)
                                      (meta/field-metadata :orders :total)
                                      (meta/field-metadata :orders :created-at)]))]
      (is (= query
             (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-source-table-multi-stage-test
  (testing "should preserve field id refs in the same stage as the table, but upgrade next stages"
    (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                  (lib/with-fields q [(meta/field-metadata :orders :id)
                                      (meta/field-metadata :orders :total)
                                      (meta/field-metadata :orders :created-at)])
                  (lib/join q (lib/join-clause (meta/table-metadata :products)))
                  (lib/expression q "double-tax" (lib/* (meta/field-metadata :orders :tax) 2))
                  (lib/filter q (lib/> (meta/field-metadata :orders :total) 10))
                  (lib/aggregate q (lib/sum (meta/field-metadata :orders :total)))
                  (lib/breakout q (meta/field-metadata :orders :product-id))
                  (lib/breakout q (m/find-first #(= (:id %) (meta/id :people :state))
                                                (lib/breakoutable-columns q)))
                  (lib/order-by q (meta/field-metadata :orders :product-id))
                  (lib/append-stage q)
                  (lib/filter q (lib/> (meta/field-metadata :orders :product-id) 5)))]
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} (meta/id :orders :id)]
                                        [:field {} (meta/id :orders :total)]
                                        [:field {} (meta/id :orders :created-at)]
                                        [:expression {} "double-tax"]]
                         :joins        [{:stages     [{:source-table (meta/id :products)}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :orders :product-id)]
                                                       [:field {} (meta/id :products :id)]]]}]
                         :expressions  [[:* {:lib/expression-name "double-tax"} [:field {} (meta/id :orders :tax)] 2]]
                         :filters      [[:> {} [:field {} (meta/id :orders :total)] 10]]
                         :aggregation  [[:sum {} [:field {} (meta/id :orders :total)]]]
                         :breakout     [[:field {} (meta/id :orders :product-id)]
                                        [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :state)]]
                         :order-by     [[:asc {} [:field {} (meta/id :orders :product-id)]]]}
                        {:filters [[:> {} [:field {} "PRODUCT_ID"] 5]]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-source-card-multi-stage-test
  (testing "should upgrade field id refs for a card"
    (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
          mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
          query      (as-> (lib/query mp (lib.metadata/card mp 1)) q
                       (lib/with-fields q [(meta/field-metadata :orders :id)
                                           (meta/field-metadata :orders :total)
                                           (meta/field-metadata :orders :created-at)])
                       (lib/join q (lib/join-clause (meta/table-metadata :products)))
                       (lib/expression q "double-tax" (lib/* (meta/field-metadata :orders :tax) 2))
                       (lib/filter q (lib/> (meta/field-metadata :orders :total) 10))
                       (lib/aggregate q (lib/sum (meta/field-metadata :orders :total)))
                       (lib/breakout q (meta/field-metadata :orders :product-id))
                       (lib/breakout q (m/find-first #(= (:id %) (meta/id :people :state))
                                                     (lib/breakoutable-columns q)))
                       (lib/order-by q (meta/field-metadata :orders :product-id))
                       (lib/append-stage q)
                       (lib/filter q (lib/> (meta/field-metadata :orders :product-id) 5)))]
      (is (=? {:stages [{:source-card  1
                         :fields       [[:field {} "ID"]
                                        [:field {} "TOTAL"]
                                        [:field {} "CREATED_AT"]
                                        [:expression {} "double-tax"]]
                         :joins        [{:stages     [{:source-table (meta/id :products)}]
                                         :conditions [[:= {}
                                                       [:field {} "PRODUCT_ID"]
                                                       [:field {} (meta/id :products :id)]]]}]
                         :expressions  [[:* {:lib/expression-name "double-tax"} [:field {} "TAX"] 2]]
                         :filters      [[:> {} [:field {} "TOTAL"] 10]]
                         :aggregation  [[:sum {} [:field {} "TOTAL"]]]
                         :breakout     [[:field {} "PRODUCT_ID"]
                                        [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :state)]]
                         :order-by     [[:asc {} [:field {} "PRODUCT_ID"]]]}
                        {:filters [[:> {} [:field {} "PRODUCT_ID"] 5]]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-card-join-table-test
  (testing "should preserve field id refs in the RHS of a join condition for a table"
    (let [orders-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
          mp           (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
          query        (-> (lib/query mp (lib.metadata/card mp 1))
                           (lib/join (lib/join-clause (meta/table-metadata :products)
                                                      [(lib/= (meta/field-metadata :orders :product-id)
                                                              (meta/field-metadata :products :id))])))]
      (is (=? {:stages [{:source-card 1
                         :joins       [{:stages     [{:source-table (meta/id :products)}]
                                        :conditions [[:= {}
                                                      [:field {} "PRODUCT_ID"]
                                                      [:field {} (meta/id :products :id)]]]}]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-table-join-card-test
  (testing "should upgrade field id refs in the RHS of a join condition for a card"
    (let [products-query (lib/query meta/metadata-provider (meta/table-metadata :products))
          mp             (lib.tu/metadata-provider-with-card-from-query 1 products-query)
          query          (-> (lib/query mp (meta/table-metadata :orders))
                             (lib/join (lib/join-clause (lib.metadata/card mp 1)
                                                        [(lib/= (meta/field-metadata :orders :product-id)
                                                                (meta/field-metadata :products :id))])))]
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :joins        [{:stages     [{:source-card 1}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :orders :product-id)]
                                                       [:field {} "ID"]]]}]}]}
              (lib-be/upgrade-field-refs-in-query query))))))
