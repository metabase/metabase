(ns metabase.query-processor-test.sum-where-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.segment :refer [Segment]]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 179.0
           (->> {:aggregation [[:sum-where
                                [:field (mt/id :venues :price) nil]
                                [:< [:field (mt/id :venues :price) nil] 4]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                double)))

    (testing "Should get normalized correctly and work as expected"
      (is (= 179.0
             (->> {:aggregation [["sum-where"
                                  ["field" (mt/id :venues :price) nil]
                                  ["<" ["field" (mt/id :venues :price) nil] 4]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  double))))))

(deftest ^:parallel compound-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 34.0
           (->> {:aggregation [[:sum-where
                                [:field (mt/id :venues :price) nil]
                                [:and [:< [:field (mt/id :venues :price) nil] 4]
                                 [:or [:starts-with [:field (mt/id :venues :name) nil] "M"]
                                  [:ends-with [:field (mt/id :venues :name) nil] "t"]]]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                double)))))

(deftest ^:parallel filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= nil
           (->> {:aggregation [[:sum-where [:field (mt/id :venues :price) nil] [:< [:field (mt/id :venues :price) nil] 4]]]
                 :filter      [:> [:field (mt/id :venues :price) nil] Long/MAX_VALUE]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst)))))

(deftest ^:parallel breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= [[2 0.0]
            [3 0.0]
            [4 1.0]
            [5 1.0]]
           (->> {:aggregation [[:sum-where
                                [:field (mt/id :venues :price) nil]
                                [:< [:field (mt/id :venues :price) nil] 2]]]
                 :breakout    [[:field (mt/id :venues :category_id) nil]]
                 :limit       4}
                (mt/run-mbql-query venues)
                (mt/round-all-decimals 2)
                mt/rows
                (map (fn [[k v]]
                       [(long k) (double v)])))))))

(deftest ^:parallel sum-where-inside-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (is (= 90.5
           (->> {:aggregation [[:+
                                [:/
                                 [:sum-where
                                  [:field (mt/id :venues :price) nil]
                                  [:< [:field (mt/id :venues :price) nil] 4]]
                                 2]
                                1]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                double)))))

(deftest segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (t2.with-temp/with-temp [Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                       :definition {:source-table (mt/id :venues)
                                                                    :filter       [:< [:field (mt/id :venues :price) nil] 4]}}]
      (is (= 179.0
             (->> {:aggregation [[:sum-where [:field (mt/id :venues :price) nil] [:segment segment-id]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  double))))))

(deftest metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (t2.with-temp/with-temp [Metric {metric-id :id} {:table_id   (mt/id :venues)
                                                     :definition {:source-table (mt/id :venues)
                                                                  :aggregation  [:sum-where
                                                                                 [:field (mt/id :venues :price) nil]
                                                                                 [:< [:field (mt/id :venues :price) nil] 4]]}}]
      (is (= 179.0
             (->> {:aggregation [[:metric metric-id]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  double))))))
