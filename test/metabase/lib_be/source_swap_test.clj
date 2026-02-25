(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.source-swap :as source-swap]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.test]))

(defn- orders-source []
  {:type :table :id (meta/id :orders)})

(defn- products-source []
  {:type :table :id (meta/id :products)})

(defn- orders->products-field-mapping []
  {(meta/id :orders :id)         (meta/id :products :id)
   (meta/id :orders :created-at) (meta/id :products :created-at)})

(deftest ^:parallel build-swap-field-id-mapping-table-to-table-test
  (testing "should build a map of shared fields between orders and products"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
      (is (= (orders->products-field-mapping)
             (source-swap/build-swap-field-id-mapping query (orders-source) (products-source)))))))

(deftest ^:parallel swap-source-in-query-table-to-table-test
  (testing "should replace source table and remap field IDs in all clauses"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields [(meta/field-metadata :orders :id)
                                      (meta/field-metadata :orders :created-at)])
                    (lib/join (-> (lib/join-clause (meta/table-metadata :people)
                                                   [(lib/= (meta/field-metadata :orders :id)
                                                           (meta/field-metadata :people :id))])
                                  (lib/with-join-alias "People")))
                    (lib/expression "id-plus-one" (lib/+ (meta/field-metadata :orders :id) 1))
                    (lib/filter (lib/> (meta/field-metadata :orders :id) 0))
                    (lib/aggregate (lib/min (meta/field-metadata :orders :created-at)))
                    (lib/breakout (meta/field-metadata :orders :created-at))
                    (lib/order-by (meta/field-metadata :orders :id)))]
      (is (=? {:stages [{:source-table (meta/id :products)
                         :fields       [[:field {} (meta/id :products :id)]
                                        [:field {} (meta/id :products :created-at)]
                                        [:expression {} "id-plus-one"]]
                         :joins        [{:alias      "People"
                                         :stages     [{:source-table (meta/id :people)}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :products :id)]
                                                       [:field {:join-alias "People"} (meta/id :people :id)]]]}]
                         :expressions  [[:+ {:lib/expression-name "id-plus-one"}
                                         [:field {} (meta/id :products :id)] 1]]
                         :filters      [[:> {} [:field {} (meta/id :products :id)] 0]]
                         :aggregation  [[:min {} [:field {} (meta/id :products :created-at)]]]
                         :breakout     [[:field {} (meta/id :products :created-at)]]
                         :order-by     [[:asc {} [:field {} (meta/id :products :id)]]]}]}
              (source-swap/swap-source-in-query query
                                                (orders-source)
                                                (products-source)
                                                (orders->products-field-mapping)))))))

(deftest ^:parallel swap-source-in-parameter-target-test
  (testing "should swap field ID in a dimension target"
    (is (= [:dimension [:field (meta/id :products :id) nil]]
           (source-swap/swap-source-in-parameter-target
            [:dimension [:field (meta/id :orders :id) nil]]
            (orders->products-field-mapping))))))
