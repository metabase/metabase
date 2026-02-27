(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel swap-source-in-query-table->table-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields [(meta/field-metadata :orders :id)
                                    (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query (lib-be/swap-source-in-query upgraded-query
                                                   {:type :table, :id (meta/id :orders)}
                                                   {:type :table, :id (meta/id :products)})]
    (testing "should convert id-based field refs to name-based field refs when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} "ID"]
                                        [:field {} "CREATED_AT"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should convert name-based field refs to id-based field refs when swapping"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :fields       [[:field {} (meta/id :products :id)]
                                        [:field {} (meta/id :products :created-at)]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-card->card-test
  (let [orders-query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        reviews-query (lib/query meta/metadata-provider (meta/table-metadata :reviews))
        mp            (-> meta/metadata-provider
                          (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
                          (lib.tu/metadata-provider-with-card-from-query 2 reviews-query))
        query          (-> (lib/query mp (lib.metadata/card mp 1))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :card, :id 1}
                                                    {:type :card, :id 2})]
    (testing "should convert id-based field refs to name-based field refs when upgrading"
      (is (=? {:stages [{:source-card 1
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should change source-card and preserve name-based refs when swapping"
      (is (=? {:stages [{:source-card 2
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-card->table-test
  (let [orders-query   (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
        query          (-> (lib/query mp (lib.metadata/card mp 1))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :card, :id 1}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should convert id-based field refs to name-based field refs when upgrading"
      (is (=? {:stages [{:source-card 1
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap source-card with source-table and convert name-based refs to id-based refs"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :fields       [[:field {} (meta/id :reviews :id)]
                                        [:field {} (meta/id :reviews :created-at)]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-table->card-test
  (let [reviews-query  (lib/query meta/metadata-provider (meta/table-metadata :reviews))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 reviews-query)
        query          (-> (lib/query mp (meta/table-metadata :orders))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :card, :id 1})]
    (testing "should convert id-based field refs to name-based field refs when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} "ID"]
                                        [:field {} "CREATED_AT"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap source-table with source-card and preserve name-based refs"
      (is (=? {:stages [{:source-card 1
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-all-clauses-test
  (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)])
                           (lib/join (meta/table-metadata :products))
                           (lib/expression "double-id" (lib/+ (meta/field-metadata :orders :id)
                                                              (meta/field-metadata :orders :id)))
                           (lib/aggregate (lib/sum (meta/field-metadata :orders :id)))
                           (lib/breakout (meta/field-metadata :orders :created-at))
                           (lib/order-by (meta/field-metadata :orders :created-at)))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should convert all field refs to name-based when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} "ID"]
                                        [:field {} "CREATED_AT"]
                                        [:expression {} "double-id"]]
                         :joins        [{:conditions [[:= {}
                                                       [:field {} "PRODUCT_ID"]
                                                       [:field {:join-alias "Products"} "ID"]]]}]
                         :expressions  [[:+ {:lib/expression-name "double-id"}
                                         [:field {} "ID"]
                                         [:field {} "ID"]]]
                         :aggregation  [[:sum {} [:field {} "ID"]]]
                         :breakout     [[:field {} "CREATED_AT"]]
                         :order-by     [[:asc {} [:field {} "CREATED_AT"]]]}]}
              upgraded-query)))
    (testing "should swap orders refs to reviews refs and preserve products refs"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :fields       [[:field {} (meta/id :reviews :id)]
                                        [:field {} (meta/id :reviews :created-at)]
                                        [:expression {} "double-id"]]
                         :joins        [{:conditions [[:= {}
                                                       [:field {} (meta/id :reviews :product-id)]
                                                       [:field {:join-alias "Products"} (meta/id :products :id)]]]}]
                         :expressions  [[:+ {:lib/expression-name "double-id"}
                                         [:field {} (meta/id :reviews :id)]
                                         [:field {} (meta/id :reviews :id)]]]
                         :aggregation  [[:sum {} [:field {} (meta/id :reviews :id)]]]
                         :breakout     [[:field {} (meta/id :reviews :created-at)]]
                         :order-by     [[:asc {} [:field {} (meta/id :reviews :created-at)]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-implicit-join-test
  (let [query          (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                         (lib/filter q (lib/= (m/find-first #(= (:name %) "CATEGORY") (lib/filterable-columns q)) "Widget")))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve IDs for implicit join columns when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :orders :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should change source-field when swapping"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :reviews :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              swapped-query)))))
