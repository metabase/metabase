(ns metabase.query-processor-test.advanced-math-test
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :refer :all]
             [test :as mt]
             [util :as u]]
            [metabase.test.data :as data]))

(defn- test-math-expression
  [expr]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
        ;; To ensure stable ordering
        :order-by    [[:asc [:field-id (data/id :venues :id)]]]
        :limit       1}
       (mt/run-mbql-query venues)
       rows
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
                    :filter      [:between [:- [:round [:power [:field-id (data/id :venues :price)] 2]] 1] 1 5]}
                   (mt/run-mbql-query venues)
                   rows
                   ffirst
                   int)))))


(defn- test-aggregation
  [agg]
  (->> {:aggregation [agg]}
       (mt/run-mbql-query venues)
       rows
       ffirst
       double
       (u/round-to-decimals 2)))

(deftest test-variance
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (is (= 0.59 (test-aggregation [:var [:field-id (data/id :venues :price)]])))))

(deftest test-median
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (is (= 2.0 (test-aggregation [:median [:field-id (data/id :venues :price)]])))))

(deftest test-percentile
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (is (= 3.0 (test-aggregation [:percentile [:field-id (data/id :venues :price)] 0.9])))))

(deftest test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 2.0 (test-math-expression [:sqrt [:power 2.0 2]])))
    (is (= 59.0 (test-aggregation [:count-where [:between [:- [:round [:power [:field-id (data/id :venues :price)] 2]] 1] 1 5]])))))
