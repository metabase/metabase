(ns metabase.query-processor.pivot-test
  "Tests for pivot table actions for the query processor"
  (:require [cheshire.core :refer [generate-string]]
            [clojure.test :refer :all]
            [metabase.query-processor.pivot :as sut]
            [metabase.test :as mt]))

(def ^:private applicable-drivers
  ;; Redshift takes A LONG TIME to insert the sample-dataset, so do not
  ;; run these tests against Redshift (for now?)
  ;;TODO: refactor Redshift testing to support a bulk COPY or something
  ;; other than INSERT INTO statements
  (disj (mt/normal-drivers-with-feature :expressions :left-join) :redshift))

(deftest generate-queries-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (let [request {:database   (mt/db)
                     :query      {:source-table (mt/$ids $$orders)
                                  :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                  :breakout     [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                 [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]
                                                 [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]]}
                     :type       :query
                     :parameters []
                     :pivot_rows [1 0]
                     :pivot_cols [2]}]
        (testing "can generate queries for each new breakout"
          (let [expected [{:query {:breakout    [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                 [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]
                                                 [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]
                                                 [:expression "pivot-grouping"]]
                                   :expressions {"pivot-grouping" [:abs 0]}}}

                          {:query {:breakout    [[:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]
                                                 [:expression "pivot-grouping"]]
                                   :expressions {"pivot-grouping" [:abs 3]}}}

                          {:query {:breakout    [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]
                                                 [:fk-> (mt/$ids $orders.product_id) (mt/$ids $products.category)]
                                                 [:expression "pivot-grouping"]]
                                   :expressions {"pivot-grouping" [:abs 1]}}}

                          {:query {:breakout    [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]
                                                 [:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                 [:expression "pivot-grouping"]]
                                   :expressions {"pivot-grouping" [:abs 4]}}}

                          {:query {:breakout    [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.state)]
                                                 [:expression "pivot-grouping"]]
                                   :expressions {"pivot-grouping" [:abs 6]}}}

                          {:query {:breakout    [[:fk-> (mt/$ids $orders.user_id) (mt/$ids $people.source)]
                                                 [:expression "pivot-grouping"]]
                                   :expressions {"pivot-grouping" [:abs 5]}}}

                          {:query {:breakout    [[:expression "pivot-grouping"]]
                                   :expressions {"pivot-grouping" [:abs 7]}}}]
                expected (map (fn [expected-val] (-> expected-val
                                                     (assoc :type       :query
                                                            :parameters []
                                                            :pivot_rows [1 0]
                                                            :pivot_cols [2])
                                                     (assoc-in [:query :fields] [[:expression "pivot-grouping"]])
                                                     (assoc-in [:query :aggregation] [[:count] [:sum (mt/$ids $orders.quantity)]])
                                                     (assoc-in [:query :source-table] (mt/$ids $$orders)))) expected)
                actual   (map (fn [actual-val] (dissoc actual-val :database)) (sut/generate-queries request))]
            (is (= 7 (count actual)))
            (is (= expected actual))))))))
