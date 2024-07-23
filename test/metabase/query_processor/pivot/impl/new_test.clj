(ns metabase.query-processor.pivot.impl.new-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor.pivot-test :as qp.pivot-test]
   [metabase.query-processor.pivot.impl.new :as qp.pivot.impl.new]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel generate-queries-test
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        query             (lib/query
                           metadata-provider
                            {:database   (mt/id)
                             :query      {:source-table (mt/$ids $$orders)
                                          :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                          :breakout     [(mt/$ids $orders.user_id->people.state)
                                                         (mt/$ids $orders.user_id->people.source)
                                                         (mt/$ids $orders.product_id->products.category)]}
                             :type       :query
                             :parameters []
                             :pivot-rows [1 0]
                             :pivot-cols [2]})]
    (testing "can generate queries for each new breakout"
      (let [expected (mt/$ids
                       [{:query {:breakout    [$orders.user_id->people.state
                                               $orders.user_id->people.source
                                               $orders.product_id->products.category
                                               [:expression "pivot-grouping"]]
                                 :expressions {"pivot-grouping" [:abs 0]}}}
                        {:query {:breakout    [[:expression "STATE"]
                                               $orders.user_id->people.source
                                               $orders.product_id->products.category
                                               [:expression "pivot-grouping"]]
                                 :expressions {"STATE"          [:value nil {:effective-type :type/Text}]
                                               "pivot-grouping" [:abs 1]}}}
                        {:query {:breakout    [[:expression "STATE"]
                                               [:expression "SOURCE"]
                                               $orders.product_id->products.category
                                               [:expression "pivot-grouping"]]
                                 :expressions {"STATE"          [:value nil {:effective-type :type/Text}]
                                               "SOURCE"         [:value nil {:effective-type :type/Text}]
                                               "pivot-grouping" [:abs 3]}}}
                        {:query {:breakout    [$orders.user_id->people.state
                                               $orders.user_id->people.source
                                               [:expression "CATEGORY"]
                                               [:expression "pivot-grouping"]]
                                 :expressions {"CATEGORY"       [:value nil {:effective-type :type/Text}]
                                               "pivot-grouping" [:abs 4]}}}
                        {:query {:breakout    [[:expression "STATE"]
                                               $orders.user_id->people.source
                                               [:expression "CATEGORY"]
                                               [:expression "pivot-grouping"]]
                                 :expressions {"STATE"          [:value nil {:effective-type :type/Text}]
                                               "CATEGORY"       [:value nil {:effective-type :type/Text}]
                                               "pivot-grouping" [:abs 5]}}}
                        {:query {:breakout    [[:expression "STATE"]
                                               [:expression "SOURCE"]
                                               [:expression "CATEGORY"]
                                               [:expression "pivot-grouping"]]
                                 :expressions {"STATE"          [:value nil {:effective-type :type/Text}]
                                               "SOURCE"         [:value nil {:effective-type :type/Text}]
                                               "CATEGORY"       [:value nil {:effective-type :type/Text}]
                                               "pivot-grouping" [:abs 7]}}}])
            expected (for [query expected]
                       (-> query
                           (assoc :database (mt/id)
                                  :type       :query
                                  :parameters []
                                  :pivot-rows [1 0]
                                  :pivot-cols [2])
                           (assoc-in [:query :aggregation] [[:count] [:sum (mt/$ids $orders.quantity)]])
                           (assoc-in [:query :source-table] (mt/$ids $$orders))))
            expected (for [query expected]
                       (lib/query metadata-provider query))
            expected (walk/postwalk
                      (fn [x]
                        (if (and (map? x)
                                 (:lib/uuid x))
                          (assoc x :lib/uuid string?)
                          x))
                      expected)
            actual   (#'qp.pivot.impl.new/generate-queries query {:pivot-rows [1 0] :pivot-cols [2]})]
        (is (= 6 (count actual)))
        (doseq [i (range 6)]
          (testing (format "Query #%d" i)
            (is (=? (nth expected i)
                    (nth actual i)))))))))

(deftest ^:parallel generate-compiled-queries-test
  (testing "Just make sure we can compile everything ok"
    (is (some? (#'qp.pivot.impl.new/generate-compiled-queries
                (lib/query
                 (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                  (qp.pivot-test/test-query))
                {})))))
