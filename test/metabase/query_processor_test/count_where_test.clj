(ns metabase.query-processor-test.count-where-test
  (:require [clojure.test :refer :all]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.test :as mt]))

(deftest basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 94
           (->> {:aggregation [[:count-where [:< [:field-id (mt/id :venues :price)] 4]]]}
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

(deftest compound-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 17
           (->> {:aggregation [[:count-where
                                [:and
                                 [:< [:field-id (mt/id :venues :price)] 4]
                                 [:or
                                  [:starts-with [:field-id (mt/id :venues :name)] "M"]
                                  [:ends-with [:field-id (mt/id :venues :name)] "t"]]]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                long)))))

(deftest filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= nil
           (->> {:aggregation [[:count-where [:< [:field-id (mt/id :venues :price)] 4]]]
                 :filter      [:> [:field-id (mt/id :venues :price)] Long/MAX_VALUE]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst)))))

(deftest breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= [[2 0]
            [3 0]
            [4 1]
            [5 1]]
           (->> {:aggregation [[:count-where [:< [:field-id (mt/id :venues :price)] 2]]]
                 :breakout    [[:field-id (mt/id :venues :category_id)]]
                 :limit       4}
                (mt/run-mbql-query venues)
                (mt/round-all-decimals 2)
                mt/rows
                (map (fn [[k v]]
                       [(long k) (long v)])))))))

(deftest count-where-inside-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (is (= 48
           (->> {:aggregation [[:+
                                [:/
                                 [:count-where [:< [:field-id (mt/id :venues :price)] 4]]
                                 2]
                                1]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                long)))))

(deftest segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (mt/with-temp Segment [{segment-id :id} {:table_id   (mt/id :venues)
                                             :definition {:source-table (mt/id :venues)
                                                          :filter       [:< [:field-id (mt/id :venues :price)] 4]}}]
      (is (= 94
             (->> {:aggregation [[:count-where [:segment segment-id]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  long))))))

(deftest metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (mt/with-temp Metric [{metric-id :id} {:table_id   (mt/id :venues)
                                           :definition {:source-table (mt/id :venues)
                                                        :aggregation  [:count-where
                                                                       [:< [:field-id (mt/id :venues :price)] 4]]}}]
      (is (= 94
             (->> {:aggregation [[:metric metric-id]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  long))))))
