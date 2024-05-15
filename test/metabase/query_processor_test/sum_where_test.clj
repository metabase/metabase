(ns metabase.query-processor-test.sum-where-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

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

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      {:segments [{:id         1
                                                   :name       "Segment 1"
                                                   :table-id   (mt/id :venues)
                                                   :definition {:source-table (mt/id :venues)
                                                                :filter       [:< [:field (mt/id :venues :price) nil] 4]}}]})
      (is (= 179.0
             (->> {:aggregation [[:sum-where [:field (mt/id :venues :price) nil] [:segment 1]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  double))))))

(deftest ^:parallel legacy-metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      {:metrics [{:id         1
                                                  :name       "Metric 1"
                                                  :table-id   (mt/id :venues)
                                                  :definition {:source-table (mt/id :venues)
                                                               :aggregation  [:sum-where
                                                                              [:field (mt/id :venues :price) nil]
                                                                              [:< [:field (mt/id :venues :price) nil] 4]]}}]})
      (is (= 179.0
             (->> {:aggregation [[:metric 1]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  double))))))
