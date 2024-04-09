(ns metabase.query-processor-test.share-test
  "Tests for the `:share` aggregation."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models.legacy-metric :refer [LegacyMetric]]
   [metabase.models.segment :refer [Segment]]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= [[0.94]]
           (mt/formatted-rows [2.0]
             (mt/run-mbql-query venues
               {:aggregation [[:share [:< $price 4]]]}))))

    (testing "Normalization"
      (is (= [[0.94]]
             (mt/formatted-rows [2.0]
               (mt/run-mbql-query venues
                 {:aggregation [["share" ["<" ["field-id" (mt/id :venues :price)] 4]]]})))))

    (testing "Complex filter clauses"
      (is (= [[0.17]]
             (mt/formatted-rows [2.0]
               (mt/run-mbql-query venues
                 {:aggregation [[:share
                                 [:and
                                  [:< $price 4]
                                  [:or
                                   [:starts-with $name "M"]
                                   [:ends-with $name "t"]]]]]})))))

    (testing "empty results"
      ;; Vertica doesn't allow dividing null by zero
      ;; TODO consider wrapping all divisions in nullif checking the first argument
      (if (= driver/*driver* :vertica)
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Division by zero"
             (mt/run-mbql-query venues
               {:aggregation [[:share [:< $price 4]]]
               :filter      [:> $price Long/MAX_VALUE]})))
        ;; due to a bug in the Mongo counts are returned as empty when there are no results (#5419)
        (is (= (if (= driver/*driver* :mongo)
                 []
                 [[nil]])
               (mt/rows
                (mt/run-mbql-query venues
                  {:aggregation [[:share [:< $price 4]]]
                   :filter      [:> $price Long/MAX_VALUE]}))))))))

(deftest segments-metrics-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Share containing a Segment"
      (t2.with-temp/with-temp [Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                         :definition {:source-table (mt/id :venues)
                                                                      :filter       [:< [:field (mt/id :venues :price) nil] 4]}}]
        (is (= [[0.94]]
               (mt/formatted-rows [2.0]
                 (mt/run-mbql-query venues
                   {:aggregation [[:share [:segment segment-id]]]}))))))

    (testing "Share inside a Metric"
      (t2.with-temp/with-temp [LegacyMetric {metric-id :id} {:table_id   (mt/id :venues)
                                                       :definition {:source-table (mt/id :venues)
                                                                    :aggregation  [:share [:< [:field (mt/id :venues :price) nil] 4]]}}]
        (is (= [[0.94]]
               (mt/formatted-rows [2.0]
                 (mt/run-mbql-query venues
                   {:aggregation [[:metric metric-id]]}))))))))

(deftest ^:parallel expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Share containing an expression"
      (is (= [[2 0.0]
              [3 0.0]
              [4 0.5]
              [5 0.14]]
             (mt/formatted-rows [int 2.0]
               (mt/run-mbql-query venues
                 {:aggregation [[:share [:< $price 2]]]
                  :breakout    [[:field $category_id nil]]
                  :limit       4})))))

    (testing "Share inside an expression"
      (is (= [[1.47]]
             (mt/formatted-rows [2.0]
               (mt/run-mbql-query venues
                 {:aggregation [[:+ [:/ [:share [:< $price 4]] 2] 1]]})))))))
