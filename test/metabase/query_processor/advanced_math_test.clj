(ns ^:mb/driver-tests metabase.query-processor.advanced-math-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(defn- test-math-expression
  [expr]
  (let [mp        (mt/metadata-provider)
        venues    (lib.metadata/table mp (mt/id :venues))
        venues-id (lib.metadata/field mp (mt/id :venues :id))
        query     (-> (lib/query mp venues)
                      (lib/expression "test" expr)
                      (as-> q (lib/with-fields q [(lib/expression-ref q "test")]))
                      ;; To ensure stable ordering
                      (lib/order-by venues-id)
                      (lib/limit 1))]
    (mt/with-native-query-testing-context query
      (->> (mt/process-query query)
           ;; Round to prevent minute differences across DBs due to differences in how float point math is handled
           (mt/formatted-rows [2.0])
           ffirst))))

(deftest ^:parallel test-round
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 1.0
           (test-math-expression (lib/round 0.7))))))

(deftest ^:parallel test-floor
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 0.0 (test-math-expression (lib/floor 0.7))))))

(deftest ^:parallel test-ceil
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 1.0 (test-math-expression (lib/ceil 0.3))))))

(deftest ^:parallel test-abs
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 2.0 (test-math-expression (lib/abs -2))))))

(deftest ^:parallel test-power
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 4.0 (test-math-expression (lib/power 2.0 2))))
    (is (= 2.0 (test-math-expression (lib/power 4.0 0.5))))
    (is (= 0.25 (test-math-expression (lib/power 2.0 -2))))))

(deftest ^:parallel test-sqrt
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 2.0 (test-math-expression (lib/sqrt 4.0))))))

(deftest ^:parallel test-exp
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 7.39 (test-math-expression (lib/exp 2.0))))))

(deftest ^:parallel test-log
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 1.0 (test-math-expression (lib/log 10.0))))))

(deftest ^:parallel test-filter
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/count))
                           (lib/filter (lib/between (lib/- (lib/round (lib/power venues-price 2)) 1) 1 5)))]
      (mt/with-native-query-testing-context query
        (is (= 59 (->> query
                       mt/process-query
                       mt/rows
                       ffirst
                       int)))))))

(defn- aggregation=
  [expected agg]
  (let [mp     (mt/metadata-provider)
        venues (lib.metadata/table mp (mt/id :venues))]
    (testing "As a top-level aggregation"
      (let [query (-> (lib/query mp venues)
                      (lib/aggregate agg))]
        (mt/with-native-query-testing-context query
          (is (= expected
                 (ffirst
                  (mt/formatted-rows
                   [1.0]
                   (mt/process-query query))))))))
    (when (driver.u/supports? driver/*driver* :expression-aggregations (mt/db))
      (testing "Inside an expression aggregation"
        (let [query (-> (lib/query mp venues)
                        (lib/aggregate (lib/+ agg 1)))]
          (mt/with-native-query-testing-context query
            (is (= (+ expected 1.0)
                   (ffirst
                    (mt/formatted-rows
                     [1.0]
                     (mt/process-query query)))))))))))

;;; there is a test for standard deviation itself
;;; in [[metabase.query-processor.aggregation-test/standard-deviation-test]]

(deftest ^:parallel test-variance
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (let [mp           (mt/metadata-provider)
          venues-price (lib.metadata/field mp (mt/id :venues :price))]
      (aggregation= 0.6
                    (lib/var venues-price)))))

(deftest ^:parallel test-median
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (let [mp           (mt/metadata-provider)
          venues-price (lib.metadata/field mp (mt/id :venues :price))]
      (aggregation= 2.0
                    (lib/median venues-price)))))

(deftest ^:parallel test-percentile
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations)
    (let [mp           (mt/metadata-provider)
          venues-price (lib.metadata/field mp (mt/id :venues :price))]
      (aggregation= 3.0
                    (lib/percentile venues-price 0.9)))))

(deftest ^:parallel test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :advanced-math-expressions)
    (is (= 2.0 (test-math-expression (lib/sqrt (lib/power 2.0 2)))))
    (let [mp           (mt/metadata-provider)
          venues-price (lib.metadata/field mp (mt/id :venues :price))]
      (aggregation= 59.0
                    (lib/count-where (lib/between (lib/- (lib/round (lib/power venues-price 2)) 1) 1 5))))))
