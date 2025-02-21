(ns ^:mb/driver-tests metabase.query-processor-test.share-test
  "Tests for the `:share` aggregation."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= [[0.94]]
           (mt/formatted-rows
            [2.0]
            (mt/run-mbql-query venues
              {:aggregation [[:share [:< $price 4]]]}))))))

(deftest ^:parallel normalization-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Normalization"
      (is (= [[0.94]]
             (mt/formatted-rows
              [2.0]
              (mt/run-mbql-query venues
                {:aggregation [["share" ["<" ["field-id" (mt/id :venues :price)] 4]]]})))))))

(deftest ^:parallel complex-filter-clauses-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Complex filter clauses"
      (is (= [[0.17]]
             (mt/formatted-rows
              [2.0]
              (mt/run-mbql-query venues
                {:aggregation [[:share
                                [:and
                                 [:< $price 4]
                                 [:or
                                  [:starts-with $name "M"]
                                  [:ends-with $name "t"]]]]]})))))))

(defmethod driver/database-supports? [::driver/driver ::divide-null-by-zero]
  [_driver _feature _database]
  true)

;;; Vertica doesn't allow dividing null by zero
;;;
;;; TODO consider wrapping all divisions in nullif checking the first argument
(defmethod driver/database-supports? [:vertica ::divide-null-by-zero]
  [_driver _feature _database]
  false)

(defmulti divide-null-by-zero-expected-error-message-regex
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod divide-null-by-zero-expected-error-message-regex :default
  [_driver]
  #"Division by zero")

(defmethod driver/database-supports? [::driver/driver ::empty-results-wrong-because-of-issue-5419]
  [_driver _feature _database]
  false)

;;; due to a bug in the Mongo counts are returned as empty when there are no results (#5419)
(defmethod driver/database-supports? [:mongo ::empty-results-wrong-because-of-issue-5419]
  [_driver _feature _database]
  true)

(deftest ^:parallel empty-results-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "empty results"
      (letfn [(run-query []
                (mt/run-mbql-query venues
                  {:aggregation [[:share [:< $price 4]]]
                   :filter      [:> $price Long/MAX_VALUE]}))]
        (cond
          (not (driver/database-supports? driver/*driver* ::divide-null-by-zero (mt/db)))
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               (divide-null-by-zero-expected-error-message-regex driver/*driver*)
               (run-query)))

          (driver/database-supports? driver/*driver* ::empty-results-wrong-because-of-issue-5419 (mt/db))
          (is (= []
                 (mt/rows (run-query))))

          :else
          (is (= [[nil]]
                 (mt/rows (run-query)))))))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Share containing a Segment"
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                      :definition {:source-table (mt/id :venues)
                                                                   :filter       [:< [:field (mt/id :venues :price) nil] 4]}}]
        (is (= [[0.94]]
               (mt/formatted-rows
                [2.0]
                (mt/run-mbql-query venues
                  {:aggregation [[:share [:segment segment-id]]]}))))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Share inside a Metric"
      (mt/with-temp [:model/Card {metric-id :id} {:dataset_query (mt/mbql-query venues
                                                                   {:aggregation [:share [:< $price 4]]
                                                                    :source-table $$venues})
                                                  :type :metric}]
        (is (= [[0.94]]
               (mt/formatted-rows
                [2.0]
                (mt/run-mbql-query venues
                  {:aggregation [[:metric metric-id]]
                   :source-table (str "card__" metric-id)}))))))))

(deftest ^:parallel share-containing-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Share containing an expression"
      (is (= [[2 0.0]
              [3 0.0]
              [4 0.5]
              [5 0.14]]
             (mt/formatted-rows
              [int 2.0]
              (mt/run-mbql-query venues
                {:aggregation [[:share [:< $price 2]]]
                 :breakout    [[:field $category_id nil]]
                 :limit       4})))))))

(deftest ^:parallel share-inside-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Share inside an expression"
      (is (= [[1.47]]
             (mt/formatted-rows
              [2.0]
              (mt/run-mbql-query venues
                {:aggregation [[:+ [:/ [:share [:< $price 4]] 2] 1]]})))))))
