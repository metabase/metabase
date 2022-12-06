(ns metabase.query-processor-test.advanced-math-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- test-math-expression
  [expr]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
        ;; To ensure stable ordering
        :order-by    [[:asc [:field (mt/id :venues :id) nil]]]
        :limit       1}
       (mt/run-mbql-query venues)
       mt/rows
       ffirst
       double
       ;; Round to prevent minute differences across DBs due to differences in how float point math is handled
       (u/round-to-decimals 2)))

(deftest test-round
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 1.0 (test-math-expression [:round 0.7])))))

(deftest test-floor
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 0.0 (test-math-expression [:floor 0.7])))))

(deftest test-ceil
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 1.0 (test-math-expression [:ceil 0.3])))))

(deftest test-abs
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 2.0 (test-math-expression [:abs -2])))))


(deftest test-power
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 4.0 (test-math-expression [:power 2.0 2])))
    (is (= 2.0 (test-math-expression [:power 4.0 0.5])))
    (is (= 0.25 (test-math-expression [:power 2.0 -2])))))

(deftest test-sqrt
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 2.0 (test-math-expression [:sqrt 4.0])))))

(deftest test-exp
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 7.39 (test-math-expression [:exp 2.0])))))

(deftest test-log
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 1.0 (test-math-expression [:log 10.0])))))


(deftest test-filter
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 59 (->> {:aggregation [[:count]]
                    :filter      [:between [:- [:round [:power [:field (mt/id :venues :price) nil] 2]] 1] 1 5]}
                   (mt/run-mbql-query venues)
                   mt/rows
                   ffirst
                   int)))))


(defn- aggregation=
  [expected agg]
  (testing "As a top-level aggregation"
    (let [query (mt/mbql-query venues
                  {:aggregation [agg]})]
      (mt/with-native-query-testing-context query
        (is (= expected
               (ffirst
                (mt/formatted-rows [1.0]
                  (mt/process-query query))))))))
  (when (driver/database-supports? driver/*driver* :expression-aggregations (mt/db))
    (testing "Inside an expression aggregation"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:+ agg 1]]})]
        (mt/with-native-query-testing-context query
          (is (= (+ expected 1.0)
                 (ffirst
                  (mt/formatted-rows [1.0]
                    (mt/process-query query))))))))))

;;; there is a test for standard deviation itself
;;; in [[metabase.query-processor-test.aggregation-test/standard-deviation-test]]

(deftest test-variance
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (aggregation= 0.6
                  [:var [:field (mt/id :venues :price) nil]])))

(deftest test-median
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (aggregation= 2.0
                  [:median [:field (mt/id :venues :price) nil]])))

(deftest test-percentile
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (aggregation= 3.0
                  [:percentile [:field (mt/id :venues :price) nil] 0.9])))

(deftest test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 2.0 (test-math-expression [:sqrt [:power 2.0 2]])))
    (aggregation= 59.0
                  [:count-where [:between [:- [:round [:power [:field (mt/id :venues :price) nil] 2]] 1] 1 5]])))
