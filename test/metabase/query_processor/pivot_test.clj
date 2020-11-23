(ns metabase.query-processor.pivot-test
  "Tests for pivot table actions for the query processor"
  (:require [clojure.test :refer :all]
            [metabase.query-processor.pivot :as sut]
            [metabase.test :as mt]))

(deftest generate-queries-test
  (mt/dataset sample-dataset
    (let [request {:database          (mt/db)
                   :query             {:source-table (mt/$ids $$orders)
                                       :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                       :breakout     [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                      [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]
                                                      [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]]}
                   :type              :query
                   :parameters        []
                   :pivot_row_indexes [2 1]
                   :pivot_col_indexes [3]}]
      (testing "can generate queries for each new breakout"
        (let [expected [{:breakout [[:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]
                                    [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     [[:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]
                                                   [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]}}
                        {:breakout [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]]
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]]}}
                        {:breakout [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                    [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                   [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]}}
                        {:breakout []
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     []}}
                        {:breakout [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]}}
                        {:breakout [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                    [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]]
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                   [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]]}}
                        {:breakout [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                    [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]
                                    [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                   [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]
                                                   [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]]}}
                        {:breakout [[:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]]
                         :query    {:source-table (mt/id :orders)
                                    :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                    :breakout     [[:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]]}}]
              actual   (doall (sut/generate-queries request))]
          (is (= 8 (count actual)))
          (doseq [expected-val expected]
            (is (some #(= % expected-val) actual) (str expected-val))))))))