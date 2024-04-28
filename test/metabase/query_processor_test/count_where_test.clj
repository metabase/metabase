(ns metabase.query-processor-test.count-where-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.legacy-metric :refer [LegacyMetric]]
   [metabase.models.segment :refer [Segment]]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 94
           (->> {:aggregation [[:count-where [:< [:field (mt/id :venues :price) nil] 4]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                long)))
    (testing "normalization"
      (is (= 94
             (->> {:aggregation [["count-where" ["<" ["field-id" (mt/id :venues :price)] 4]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  long))))))

(deftest ^:parallel compound-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 17
           (->> {:aggregation [[:count-where
                                [:and
                                 [:< [:field (mt/id :venues :price) nil] 4]
                                 [:or
                                  [:starts-with [:field (mt/id :venues :name) nil] "M"]
                                  [:ends-with [:field (mt/id :venues :name) nil] "t"]]]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                long)))))

(deftest ^:parallel filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= nil
           (->> {:aggregation [[:count-where [:< [:field (mt/id :venues :price) nil] 4]]]
                 :filter      [:> [:field (mt/id :venues :price) nil] Long/MAX_VALUE]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst)))))

(deftest ^:parallel breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= [[2 0]
            [3 0]
            [4 1]
            [5 1]]
           (->> {:aggregation [[:count-where [:< [:field (mt/id :venues :price) nil] 2]]]
                 :breakout    [[:field (mt/id :venues :category_id) nil]]
                 :limit       4}
                (mt/run-mbql-query venues)
                (mt/round-all-decimals 2)
                mt/rows
                (map (fn [[k v]]
                       [(long k) (long v)])))))))

(deftest ^:parallel count-where-inside-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (let [query (mt/mbql-query venues
                  {:aggregation [[:+
                                  [:/
                                   [:count-where [:< [:field (mt/id :venues :price) nil] 4]]
                                   2]
                                  1]]})]
      (mt/with-native-query-testing-context query
        (is (= 48
               (-> query
                   qp/process-query
                   mt/rows
                   ffirst
                   long)))))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (t2.with-temp/with-temp [Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                       :definition {:source-table (mt/id :venues)
                                                                    :filter       [:< [:field (mt/id :venues :price) nil] 4]}}]
      (is (= 94
             (->> {:aggregation [[:count-where [:segment segment-id]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  long))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (t2.with-temp/with-temp [LegacyMetric {metric-id :id} {:table_id   (mt/id :venues)
                                                     :definition {:source-table (mt/id :venues)
                                                                  :aggregation  [:count-where
                                                                                 [:< [:field (mt/id :venues :price) nil] 4]]}}]
      (is (= 94
             (->> {:aggregation [[:metric metric-id]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  long))))))
