(ns metabase.query-processor.middleware.upgrade-field-literals-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.upgrade-field-literals :as upgrade-field-literals]
            [metabase.test :as mt]))

(defn- upgrade-field-literals [query]
  (-> (mt/test-qp-middleware upgrade-field-literals/upgrade-field-literals query)
      :pre))

(deftest support-legacy-filter-clauses-test
  (testing "We should handle legacy usage of field-literal inside filter clauses"
    (mt/dataset sample-dataset
      (testing "against explicit joins (#14809)"
        (let [source-query    (mt/mbql-query orders
                                {:joins [{:fields       :all
                                          :source-table $$products
                                          :condition    [:= $product_id &Products.products.id]
                                          :alias        "Products"}]})
              source-metadata (qp/query->expected-cols source-query)]
          (is (= (mt/mbql-query orders
                   {:source-query    (:query source-query)
                    :source-metadata source-metadata
                    :filter          [:= &Products.products.category "Widget"]})
                 (upgrade-field-literals
                  (mt/mbql-query orders
                    {:source-query    (:query source-query)
                     :source-metadata source-metadata
                     :filter          [:= *CATEGORY/Text "Widget"]}))))))

      (testing "against implicit joins (#14811)"
        (let [source-query    (mt/mbql-query orders
                                {:aggregation [[:sum $product_id->products.price]]
                                 :breakout    [$product_id->products.category]})
              source-metadata (qp/query->expected-cols source-query)]
          (is (= (mt/mbql-query orders
                   {:source-query    (:query source-query)
                    :source-metadata source-metadata
                    :filter          [:= $product_id->products.category "Widget"]})
                 (upgrade-field-literals
                  (mt/mbql-query orders
                    {:source-query    (:query source-query)
                     :source-metadata source-metadata
                     ;; not sure why FE is using `field-literal` here... but it should work anyway.
                     :filter          [:= *CATEGORY/Text "Widget"]})))))))))
