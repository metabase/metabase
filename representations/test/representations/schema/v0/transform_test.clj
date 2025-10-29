(ns representations.schema.v0.transform-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest transform-schema-test
  (testing "transform representation with native query is valid"
    (let [transform {:type :transform
                     :version :v0
                     :name "transform-123"
                     :display_name "User Aggregation"
                     :description "Aggregate user activity data"
                     :database "database-1"
                     :query "SELECT user_id, COUNT(*) FROM events GROUP BY user_id"}]
      (is (= transform
             (read/parse transform)))))
  (testing "transform representation with mbql query is valid"
    (let [transform {:type :transform
                     :version :v0
                     :name "transform-123"
                     :display_name "User Aggregation"
                     :database "database-1"
                     :query {:source-table 1
                             :aggregation [[:count]]}}]
      (is (= transform
             (read/parse transform))))))
