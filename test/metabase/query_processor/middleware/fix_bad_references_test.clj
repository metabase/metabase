(ns metabase.query-processor.middleware.fix-bad-references-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.fix-bad-references
    :as fix-bad-refs]
   [metabase.test :as mt]))

(defn- fix-bad-refs [query]
  (mt/with-metadata-provider (mt/id)
    (fix-bad-refs/fix-bad-references query)))

(deftest fix-bad-references-test
  (mt/dataset test-data
    (is (query= (mt/mbql-query orders
                  {:source-query {:source-table $$orders
                                  :joins        [{:fields       :all
                                                  :source-table $$products
                                                  :condition    [:= $orders.product_id &P1.products.id]
                                                  :alias        "P1"}]}
                   :joins        [{:fields       :all
                                   :condition    [:= &P1.products.category &Q2.products.category]
                                   :alias        "Q2"
                                   :source-table $$reviews}]})
                (fix-bad-refs
                 (mt/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :joins        [{:source-table $$products
                                                   :alias        "P1"
                                                   :condition    [:= $orders.product_id &P1.products.id]
                                                   :fields       :all}]}
                    :joins        [{:fields       :all
                                    :condition    [:= $products.category &Q2.products.category]
                                    :alias        "Q2"
                                    :source-table $$reviews}]}))))))
