(ns metabase.api.advanced-computation-test
  "Unit tests for /api/advanced_computation endpoints."
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest pivot-dataset-test
  (mt/dataset sample-dataset
    (testing "POST /api/advanced_computation/pivot/dataset"
      (testing "Run a pivot table"
        (let [result  ((mt/user->client :rasta) :post 200 "advanced_computation/pivot/dataset"
                                                (mt/mbql-query orders
                                                               {:aggregation [[:count] [:sum $orders.quantity]]
                                                                :breakout    [[:fk-> $orders.user_id $people.state]
                                                                              [:fk-> $orders.user_id $people.source]
                                                                              [:fk-> $orders.product_id $products.category]]}))]
          ;; This resultset is going to be entirely too large to write a full equality assertion for.
          (is (= 8 (count result))))))))
