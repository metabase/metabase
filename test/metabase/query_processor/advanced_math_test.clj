(ns ^:mb/driver-tests metabase.query-processor.advanced-math-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.advanced-math-test]}
                                                            metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.advanced-math-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- test-math-expression
  [expr]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
        ;; To ensure stable ordering
        :order-by    [[:asc [:field (mt/id :venues :id) nil]]]
        :limit       1}
       (mt/run-mbql-query venues)
       ;; Round to prevent minute differences across DBs due to differences in how float point math is handled
       (mt/formatted-rows [2.0])
       ffirst))

(deftest ^:parallel test-round
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 1.0
           (test-math-expression [:round 0.7])))))

(deftest ^:parallel test-floor
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 0.0 (test-math-expression [:floor 0.7])))))

(deftest ^:parallel test-ceil
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 1.0 (test-math-expression [:ceil 0.3])))))

(deftest ^:parallel test-abs
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 2.0 (test-math-expression [:abs -2])))))

(deftest ^:parallel test-power
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 4.0 (test-math-expression [:power 2.0 2])))
    (is (= 2.0 (test-math-expression [:power 4.0 0.5])))
    (is (= 0.25 (test-math-expression [:power 2.0 -2])))))

(deftest ^:parallel test-sqrt
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 2.0 (test-math-expression [:sqrt 4.0])))))

(deftest ^:parallel test-exp
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 7.39 (test-math-expression [:exp 2.0])))))

(deftest ^:parallel test-log
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 1.0 (test-math-expression [:log 10.0])))))

(deftest ^:parallel test-filter
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
                (mt/formatted-rows
                 [1.0]
                 (mt/process-query query))))))))
  (when (driver.u/supports? driver/*driver* :expression-aggregations (mt/db))
    (testing "Inside an expression aggregation"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:+ agg 1]]})]
        (mt/with-native-query-testing-context query
          (is (= (+ expected 1.0)
                 (ffirst
                  (mt/formatted-rows
                   [1.0]
                   (mt/process-query query))))))))))

;;; there is a test for standard deviation itself
;;; in [[metabase.query-processor.aggregation-test/standard-deviation-test]]

(deftest ^:parallel test-variance
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (aggregation= 0.6
                  [:var [:field (mt/id :venues :price) nil]])))

(deftest ^:parallel test-median
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (aggregation= 2.0
                  [:median [:field (mt/id :venues :price) nil]])))

(deftest ^:parallel test-percentile
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (aggregation= 3.0
                  [:percentile [:field (mt/id :venues :price) nil] 0.9])))

;;; four values whose continuous median (2.5) and 75th percentile (4.75) are interpolated, so a discrete percentile
;;; (2 and 3: the first value whose cumulative distribution reaches the percentile) is visibly different.
(mt/defdataset discrete-percentile-values
  [["values" [{:field-name "x", :base-type :type/Integer}]
    [[1] [2] [3] [10]]]])

(deftest ^:parallel test-discrete-percentile
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations/discrete)
    (mt/dataset discrete-percentile-values
      (let [mp        (mt/metadata-provider)
            x         (lib.metadata/field mp (mt/id :values :x))
            aggregate (fn [clause]
                        (-> (lib/query mp (lib.metadata/table mp (mt/id :values)))
                            (lib/aggregate (lib/update-options clause assoc :percentile-type :discrete))
                            qp/process-query
                            mt/rows
                            ffirst
                            double))]
        (testing "a discrete median returns an actual value from the column"
          (is (= 2.0 (aggregate (lib/median x)))))
        (testing "a discrete percentile returns an actual value from the column"
          (is (= 3.0 (aggregate (lib/percentile x 0.75)))))))))

(deftest ^:parallel test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 2.0 (test-math-expression [:sqrt [:power 2.0 2]])))
    (aggregation= 59.0
                  [:count-where [:between [:- [:round [:power [:field (mt/id :venues :price) nil] 2]] 1] 1 5]])))
