(ns metabase.query-processor.middleware.deduplicate-expression-names-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.deduplicate-expression-names :as qp.deduplicate-expression-names]))

(deftest ^:parallel nested-expressions-with-existing-names-test
  (testing "Expressions with the same name as existing columns should work correctly in nested queries (#21131)"
    ;; should deduplicate regardless of case since some DBs are completely case-insensitive
    (doseq [expression-name ["price" "PRICE"]]
      (testing (format "expression-name = %s" (pr-str expression-name))
        (let [query (lib.query/query
                     meta/metadata-provider
                      (lib.tu.macros/mbql-query products
                        {:expressions  {expression-name [:+ $price 2]}
                         :fields       [$id $price [:expression expression-name]]
                         :order-by     [[:asc $id]]
                         :limit        2}))]
          (is (=? {:stages [{:expressions [[:+
                                            {:lib/expression-name (str expression-name "_2")}
                                            [:field {} (meta/id :products :price)]
                                            2]]
                             :fields [[:field {} (meta/id :products :id)]
                                      [:field {} (meta/id :products :price)]
                                      [:expression {} (str expression-name "_2")]]
                             :order-by [[:asc
                                         {}
                                         [:field {} (meta/id :products :id)]]]
                             :limit 2}]}
                  (qp.deduplicate-expression-names/deduplicate-expression-names query))))))))

(deftest ^:parallel nested-expressions-with-existing-names-test-2
  (let [query (lib.query/query
               meta/metadata-provider
               (lib.tu.macros/mbql-query products
                 {:source-query {:source-table $$products
                                 :expressions  {"PRICE" [:+ $price 2]}
                                 :breakout     [$id $price [:expression "PRICE"]]
                                 :order-by     [[:asc $id]]
                                 :limit        2}}))]
    (is (=? {:stages [{:expressions [[:+
                                      {:lib/expression-name "PRICE_2"}
                                      [:field {} (meta/id :products :price)]
                                      2]]
                       :breakout    [[:field {} (meta/id :products :id)]
                                     [:field {} (meta/id :products :price)]
                                     [:expression {} "PRICE_2"]]
                       :order-by [[:asc
                                   {}
                                   [:field {} (meta/id :products :id)]]]
                       :limit 2}
                      {}]}
            (qp.deduplicate-expression-names/deduplicate-expression-names query)))))

(deftest ^:parallel deduplicate-unreturned-expressions-test
  (testing "Expressions that aren't ultimately returned should still get deduplicated"
    (let [query (lib.tu.macros/mbql-query products
                  {:source-query {:source-table $$products
                                  :expressions  {"price" [:+ $price 2]}
                                  :breakout     [$id
                                                 $price]
                                  :aggregation [[:sum [:+ [:expression "price"] 1]]]}})
          query (lib/query meta/metadata-provider query)]
      (is (=? {:stages [{:expressions [[:+
                                        {:lib/expression-name "price_2"}
                                        [:field {} (meta/id :products :price)]
                                        2]]
                         :breakout [[:field {} (meta/id :products :id)]
                                    [:field {} (meta/id :products :price)]]
                         :aggregation [[:sum {}
                                        [:+
                                         {}
                                         [:expression {} "price_2"]
                                         1]]]}
                        {}]}
              (qp.deduplicate-expression-names/deduplicate-expression-names query))))))

(deftest ^:parallel update-subsequent-stage-references-test
  (let [query (lib.tu.macros/mbql-query products
                {:source-query {:source-table $$products
                                :expressions  {"price" [:+ $price 2]}
                                :breakout     [$id
                                               $price]
                                :aggregation [[:sum [:+ [:expression "price"] 1]]]}
                 :fields       [[:field "price" {:base-type :type/Integer}]]})
        query (lib/query meta/metadata-provider query)]
    (is (=? {:stages [{:expressions [[:+
                                      {:lib/expression-name "price_2"}
                                      [:field {} (meta/id :products :price)]
                                      2]]
                       :breakout [[:field {} (meta/id :products :id)]
                                  [:field {} (meta/id :products :price)]]
                       :aggregation [[:sum {}
                                      [:+
                                       {}
                                       [:expression {} "price_2"]
                                       1]]]}
                      {:fields [[:field {} "price_2"]]}]}
            (qp.deduplicate-expression-names/deduplicate-expression-names query)))))

(deftest ^:parallel update-subsequent-stage-references-test-2
  (let [query (lib.tu.macros/mbql-query products
                {:source-query {:source-query {:source-table $$products
                                               :expressions  {"price" [:+ $price 2]}
                                               :breakout     [$id
                                                              $price]
                                               :aggregation [[:sum [:+ [:expression "price"] 1]]]}
                                :fields       [[:field "price" {:base-type :type/Integer}]]}
                 :fields       [[:field "price" {:base-type :type/Integer}]]})
        query (lib/query meta/metadata-provider query)]
    (is (=? {:stages [{:expressions [[:+
                                      {:lib/expression-name "price_2"}
                                      [:field {} (meta/id :products :price)]
                                      2]]
                       :breakout [[:field {} (meta/id :products :id)]
                                  [:field {} (meta/id :products :price)]]
                       :aggregation [[:sum {}
                                      [:+
                                       {}
                                       [:expression {} "price_2"]
                                       1]]]}
                      {:fields [[:field {} "price_2"]]}
                      {:fields [[:field {} "price_2"]]}]}
            (qp.deduplicate-expression-names/deduplicate-expression-names query)))))
