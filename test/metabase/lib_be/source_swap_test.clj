(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel upgrade-field-refs-in-query-source-table-noop-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields [(meta/field-metadata :orders :id)
                                    (meta/field-metadata :orders :total)
                                    (meta/field-metadata :orders :created-at)]))]
    (testing "should not need upgrading"
      (is (false? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should return the identical query when no refs are upgraded"
      (is (= query
             (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-source-card-noop-test
  (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
        query      (as-> (lib/query mp (lib.metadata/card mp 1)) q
                     (lib/with-fields q [(first (lib/fieldable-columns q))]))]
    (testing "should need upgrading for a card query even when refs are already alias-based"
      (is (true? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should return the identical query when card refs are already alias-based"
      (is (= query
             (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-source-table-name-ref-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields [(lib.options/ensure-uuid [:field {:base-type :type/BigInteger} "ID"])]))]
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should convert a name-based field ref to an id-based ref for a table source"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} (meta/id :orders :id)]]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-source-table-deduplicated-name-test
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                (lib/join q (lib/join-clause (meta/table-metadata :orders)
                                             [(lib/= (meta/field-metadata :orders :id)
                                                     (meta/field-metadata :orders :id))]))
                (lib/breakout q (first (filter #(= "ID" (:name %))
                                               (lib/breakoutable-columns q))))
                (lib/breakout q (second (filter #(= "ID" (:name %))
                                                (lib/breakoutable-columns q))))
                (lib/append-stage q)
                (lib/filter q (lib/> (lib.options/ensure-uuid [:field {:base-type :type/BigInteger} "ID_2"]) 5)))]
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should convert a deduplicated name ref to an alias-based ref"
      (is (=? {:stages [{} {:filters [[:> {} [:field {} "Orders__ID"] 5]]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-source-table-multi-stage-test
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
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should preserve field id refs in the same stage as the table, but upgrade next stages"
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
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should upgrade field id refs for a card"
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
  (let [orders-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp           (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
        query        (-> (lib/query mp (lib.metadata/card mp 1))
                         (lib/join (lib/join-clause (meta/table-metadata :products)
                                                    [(lib/= (meta/field-metadata :orders :product-id)
                                                            (meta/field-metadata :products :id))])))]
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should preserve field id refs in the RHS of a join condition for a table"
      (is (=? {:stages [{:source-card 1
                         :joins       [{:stages     [{:source-table (meta/id :products)}]
                                        :conditions [[:= {}
                                                      [:field {} "PRODUCT_ID"]
                                                      [:field {} (meta/id :products :id)]]]}]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-refs-in-query-table-join-card-test
  (let [products-query (lib/query meta/metadata-provider (meta/table-metadata :products))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 products-query)
        query          (-> (lib/query mp (meta/table-metadata :orders))
                           (lib/join (lib/join-clause (lib.metadata/card mp 1)
                                                      [(lib/= (meta/field-metadata :orders :product-id)
                                                              (meta/field-metadata :products :id))])))]
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-refs-in-query? query))))
    (testing "should upgrade field id refs in the RHS of a join condition for a card"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :joins        [{:stages     [{:source-card 1}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :orders :product-id)]
                                                       [:field {} "ID"]]]}]}]}
              (lib-be/upgrade-field-refs-in-query query))))))

(deftest ^:parallel upgrade-field-ref-in-parameter-target-table-test
  (let [query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        target [:dimension [:field (meta/id :orders :total) nil] {:stage-number 0}]]
    (testing "should not need upgrading"
      (is (false? (lib-be/should-upgrade-field-ref-in-parameter-target? query target))))
    (testing "should return the identical target for a table query"
      (is (= target
             (lib-be/upgrade-field-ref-in-parameter-target query target))))))

(deftest ^:parallel upgrade-field-ref-in-parameter-target-card-test
  (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
        query      (lib/query mp (lib.metadata/card mp 1))
        target     [:dimension [:field (meta/id :orders :total) {:stage-number 0}]]]
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-ref-in-parameter-target? query target))))
    (testing "should upgrade the field id to name for a card query"
      (is (= [:dimension [:field "TOTAL" {:base-type :type/Float}]]
             (lib-be/upgrade-field-ref-in-parameter-target query target))))))

(deftest ^:parallel upgrade-field-ref-in-parameter-target-table-multi-stage-test
  (let [query  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                   (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                   (lib/breakout (meta/field-metadata :orders :product-id))
                   (lib/append-stage))
        target [:dimension [:field (meta/id :orders :product-id) nil] {:stage-number 1}]]
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-ref-in-parameter-target? query target))))
    (testing "should upgrade the field id to name on a second stage of a table query"
      (is (= [:dimension [:field "PRODUCT_ID" {:base-type :type/Integer}] {:stage-number 1}]
             (lib-be/upgrade-field-ref-in-parameter-target query target))))))

(deftest ^:parallel upgrade-field-ref-in-parameter-target-card-multi-stage-test
  (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
        query      (-> (lib/query mp (lib.metadata/card mp 1))
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                       (lib/breakout (meta/field-metadata :orders :product-id))
                       (lib/append-stage))
        target     [:dimension [:field (meta/id :orders :product-id) nil] {:stage-number 1}]]
    (testing "should need upgrading"
      (is (true? (lib-be/should-upgrade-field-ref-in-parameter-target? query target))))
    (testing "should upgrade the field id to name on a second stage of a card query"
      (is (= [:dimension [:field "PRODUCT_ID" {:base-type :type/Integer}] {:stage-number 1}]
             (lib-be/upgrade-field-ref-in-parameter-target query target))))))

(deftest ^:parallel upgrade-field-ref-in-parameter-target-invalid-stage-number-test
  (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
        query      (-> (lib/query mp (lib.metadata/card mp 1))
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                       (lib/breakout (meta/field-metadata :orders :product-id))
                       (lib/append-stage))
        target     [:dimension [:field (meta/id :orders :product-id) nil] {:stage-number 2}]]
    (testing "should not need upgrading"
      (is (false? (lib-be/should-upgrade-field-ref-in-parameter-target? query target))))
    (testing "should return the identical target for an invalid stage number"
      (is (= target
             (lib-be/upgrade-field-ref-in-parameter-target query target))))))

(deftest ^:parallel upgrade-field-ref-in-parameter-target-template-tag-test
  (let [query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        target [:dimension [:template-tag "total"]]]
    (testing "should not need upgrading"
      (is (false? (lib-be/should-upgrade-field-ref-in-parameter-target? query target))))
    (testing "should return the identical target for a template tag dimension"
      (is (= target
             (lib-be/upgrade-field-ref-in-parameter-target query target))))))

(deftest ^:parallel upgrade-field-ref-in-parameter-target-variable-test
  (let [query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        target [:variable [:template-tag "total"]]]
    (testing "should not need upgrading"
      (is (false? (lib-be/should-upgrade-field-ref-in-parameter-target? query target))))
    (testing "should return the identical target for a variable template tag"
      (is (= target
             (lib-be/upgrade-field-ref-in-parameter-target query target))))))

(deftest ^:parallel swap-source-in-query-source-table-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :products))]
    (testing "should swap the source table"
      (is (=? {:stages [{:source-table (meta/id :orders)}]}
              (lib-be/swap-source-in-query query
                                           {:type :table, :id (meta/id :products)}
                                           {:type :table, :id (meta/id :orders)}))))))

(deftest ^:parallel swap-source-in-query-source-table-with-clauses-test
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                (lib/with-fields q [(meta/field-metadata :orders :id)
                                    (meta/field-metadata :orders :created-at)])
                (lib/join q (lib/join-clause (meta/table-metadata :products)))
                (lib/expression q "id-plus-one" (lib/+ (meta/field-metadata :orders :id) 1))
                (lib/filter q (lib/> (meta/field-metadata :orders :id) 5))
                (lib/aggregate q (lib/count))
                (lib/breakout q (meta/field-metadata :orders :created-at))
                (lib/order-by q (meta/field-metadata :orders :created-at)))]
    (testing "should swap source table and field refs to matching columns"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :fields       [[:field {} (meta/id :reviews :id)]
                                        [:field {} (meta/id :reviews :created-at)]
                                        [:expression {} "id-plus-one"]]
                         :joins        [{:stages     [{:source-table (meta/id :products)}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :reviews :product-id)]
                                                       [:field {} (meta/id :products :id)]]]}]
                         :expressions  [[:+ {:lib/expression-name "id-plus-one"}
                                         [:field {} (meta/id :reviews :id)] 1]]
                         :filters      [[:> {} [:field {} (meta/id :reviews :id)] 5]]
                         :aggregation  [[:count {}]]
                         :breakout     [[:field {} (meta/id :reviews :created-at)]]
                         :order-by     [[:asc {} [:field {} (meta/id :reviews :created-at)]]]}]}
              (lib-be/swap-source-in-query query
                                           {:type :table, :id (meta/id :orders)}
                                           {:type :table, :id (meta/id :reviews)}))))))

(deftest ^:parallel swap-source-in-query-source-card-join-table-test
  (let [products-query (lib/query meta/metadata-provider (meta/table-metadata :products))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 products-query)
        query          (as-> (lib/query mp (lib.metadata/card mp 1)) q
                         (let [orders-table  (meta/table-metadata :orders)
                               lhs-columns   (lib/join-condition-lhs-columns q orders-table nil nil)
                               lhs-id        (m/find-first (comp #{"ID"} :name) lhs-columns)
                               rhs-columns   (lib/join-condition-rhs-columns q orders-table (lib/ref lhs-id) nil)
                               rhs-product-id (m/find-first (comp #{"PRODUCT_ID"} :name) rhs-columns)]
                           (lib/join q (lib/join-clause orders-table [(lib/= lhs-id rhs-product-id)]))))]
    (testing "should swap the join source and rewrite the join condition"
      (is (=? {:stages [{:source-card 1
                         :joins       [{:stages     [{:source-table (meta/id :reviews)}]
                                        :conditions [[:= {}
                                                      [:field {} "ID"]
                                                      [:field {} (meta/id :reviews :product-id)]]]}]}]}
              (lib-be/swap-source-in-query query
                                           {:type :table, :id (meta/id :orders)}
                                           {:type :table, :id (meta/id :reviews)}))))))

(deftest ^:parallel swap-source-in-query-source-table-implicit-join-test
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                (let [category-col (m/find-first (comp #{"CATEGORY"} :name)
                                                 (lib/filterable-columns q))]
                  (lib/filter q (lib/= category-col "Widget"))))]
    (testing "should swap source table and update :source-field in implicit join filter"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :filters      [[:= {}
                                         [:field {:source-field (meta/id :reviews :product-id)}
                                          (meta/id :products :category)]
                                         "Widget"]]}]}
              (lib-be/swap-source-in-query query
                                           {:type :table, :id (meta/id :orders)}
                                           {:type :table, :id (meta/id :reviews)}))))))

(deftest ^:parallel swap-source-in-parameter-target-source-table-noop-test
  (let [query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        target [:dimension [:field (meta/id :orders :created-at) nil] {:stage-number 0}]]
    (testing "should return the same target when swapping to the same table"
      (is (= target
             (lib-be/swap-source-in-parameter-target query target
                                                     {:type :table, :id (meta/id :orders)}
                                                     {:type :table, :id (meta/id :orders)}))))))

(deftest ^:parallel swap-source-in-parameter-target-source-card-noop-test
  (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp         (lib.tu/metadata-provider-with-card-from-query 1 base-query)
        query      (lib/query mp (lib.metadata/card mp 1))
        target     [:dimension [:field "CREATED_AT" {:base-type :type/DateTimeWithLocalTZ}] {:stage-number 0}]]
    (testing "should return the same target when swapping to the same card"
      (is (= target
             (lib-be/swap-source-in-parameter-target query target
                                                     {:type :card, :id 1}
                                                     {:type :card, :id 1}))))))

(deftest ^:parallel swap-source-in-parameter-target-source-table-test
  (let [query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        target [:dimension [:field (meta/id :orders :created-at) nil] {:stage-number 0}]]
    (testing "should swap the field id to the new table's field id"
      (is (= [:dimension
              [:field (meta/id :products :created-at) nil]
              {:stage-number 0}]
             (lib-be/swap-source-in-parameter-target query target
                                                     {:type :table, :id (meta/id :orders)}
                                                     {:type :table, :id (meta/id :products)}))))))

(deftest ^:parallel swap-source-in-parameter-target-implicit-join-test
  (let [query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        target [:dimension
                [:field (meta/id :products :category) {:source-field (meta/id :orders :product-id)}]
                {:stage-number 0}]]
    (testing "should swap the source-field to the new table's FK field"
      (is (=? [:dimension
               [:field (meta/id :products :category) {:source-field (meta/id :reviews :product-id)}]
               {:stage-number 0}]
              (lib-be/swap-source-in-parameter-target query target
                                                      {:type :table, :id (meta/id :orders)}
                                                      {:type :table, :id (meta/id :reviews)}))))))
