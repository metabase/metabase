(ns metabase.query-processor.pivot-test
  "Tests for pivot table actions for the query processor"
  (:require [clojure.test :refer :all]
            [metabase.query-processor.pivot :as sut]
            [metabase.test :as mt]))

(deftest generate-queries-test
  (mt/dataset sample-dataset
    (let [request {:database          (mt/db)
                   :query             {:source-table (mt/$ids $$orders)
                                       :aggregation  [[:count] [:sum [:field-id (mt/$ids $orders.quantity)]]]
                                       :breakout     [[:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.state)]]
                                                      [:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.source)]]
                                                      [:fk-> [:field-id (mt/$ids $orders.product_id)] [:field-id (mt/$ids $products.category)]]]}
                   :type              :query
                   :parameters        []
                   :pivot_row_indexes [2 1]
                   :pivot_col_indexes [3]}]
      (testing "can generate queries for each new breakout"
        (is (= [{:breakout [[:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.state)]]]
                 :query    {:source-table (mt/$ids $$orders)
                            :aggregation  [[:count] [:sum [:field-id (mt/$ids $orders.quantity)]]]
                            :breakout     [[:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.state)]]]}}

                {:breakout [[:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.state)]]
                            [:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.source)]]]
                 :query    {:source-table (mt/$ids $$orders)
                            :aggregation  [[:count] [:sum [:field-id (mt/$ids $orders.quantity)]]]
                            :breakout     [[:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.state)]]
                                           [:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.source)]]]}}

                {:breakout [[:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.source)]]
                            [:fk-> [:field-id (mt/$ids $orders.product_id)] [:field-id (mt/$ids $products.category)]]]
                 :query    {:source-table (mt/$ids $$orders)
                            :aggregation  [[:count] [:sum [:field-id (mt/$ids $orders.quantity)]]]
                            :breakout     [[:fk-> [:field-id (mt/$ids $orders.user_id)] [:field-id (mt/$ids $people.source)]]
                                           [:fk-> [:field-id (mt/$ids $orders.product_id)] [:field-id (mt/$ids $products.category)]]]}}

                {:breakout []
                 :query    {:source-table (mt/$ids $$orders)
                            :aggregation  [[:count] [:sum [:field-id (mt/$ids $orders.quantity)]]]
                            :breakout     []}}]
               (sut/generate-queries request)))))))