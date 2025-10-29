(ns representations.schema.v0.metric-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest metric-schema-test
  (testing "metric representation with native query is valid"
    (let [metric {:type :metric
                  :version :v0
                  :name "metric-123"
                  :display_name "Total Revenue"
                  :description "Total revenue for all orders"
                  :database "database-1"
                  :query "SELECT SUM(total) FROM orders"}]
      (is (= metric
             (read/parse metric)))))
  (testing "metric representation with mbql query is valid"
    (let [metric {:type :metric
                  :version :v0
                  :name "metric-123"
                  :display_name "Total Revenue"
                  :database "database-1"
                  :query {:aggregation [[:sum [:field 1 nil]]]}}]
      (is (= metric
             (read/parse metric))))))
