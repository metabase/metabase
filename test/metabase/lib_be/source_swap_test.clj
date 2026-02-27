(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel swap-source-in-query-source-table-test
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
