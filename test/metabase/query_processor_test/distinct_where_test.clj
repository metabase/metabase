(ns ^:mb/driver-tests metabase.query-processor-test.distinct-where-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= 3
           (->> {:aggregation [[:distinct-where
                                [:field (mt/id :venues :price) nil]
                                [:< [:field (mt/id :venues :price) nil] 4]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst)))

    (testing "Should get normalized correctly and work as expected"
      (is (= 3
             (->> {:aggregation [["distinct-where"
                                  ["field" (mt/id :venues :price) nil]
                                  ["<" ["field" (mt/id :venues :price) nil] 4]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst))))))

(deftest ^:parallel compound-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= 2
           (->> {:aggregation [[:distinct-where
                                [:field (mt/id :venues :price) nil]
                                [:and [:< [:field (mt/id :venues :price) nil] 4]
                                 [:> [:field (mt/id :venues :price) nil] 1]]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst)))))

(deftest ^:parallel filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= 0
           (->> {:aggregation [[:distinct-where [:field (mt/id :venues :price) nil] [:< [:field (mt/id :venues :price) nil] 4]]]
                 :filter      [:> [:field (mt/id :venues :price) nil] Long/MAX_VALUE]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst)))))

(deftest ^:parallel breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= [[2 0]
            [3 0]
            [4 1]
            [5 1]]
           (->> {:aggregation [[:distinct-where
                                [:field (mt/id :venues :price) nil]
                                [:< [:field (mt/id :venues :price) nil] 2]]]
                 :breakout    [[:field (mt/id :venues :category_id) nil]]
                 :limit       4}
                (mt/run-mbql-query venues)
                (mt/round-all-decimals 2)
                mt/rows)))))

(deftest ^:parallel distinct-where-inside-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where :expressions)
    (is (= 2.5
           (->> {:aggregation [[:+
                                [:/
                                 [:distinct-where
                                  [:field (mt/id :venues :price) nil]
                                  [:< [:field (mt/id :venues :price) nil] 4]]
                                 2]
                                1]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                double)))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      {:segments [{:id         1
                                                   :name       "Segment 1"
                                                   :table-id   (mt/id :venues)
                                                   :definition {:source-table (mt/id :venues)
                                                                :filter       [:< [:field (mt/id :venues :price) nil] 4]}}]})
      (is (= 3
             (->> {:aggregation [[:distinct-where [:field (mt/id :venues :price) nil] [:segment 1]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      {:cards [{:id            1
                                                :database-id   (mt/id)
                                                :name          "Metric 1"
                                                :dataset-query (mt/mbql-query venues
                                                                 {:source-table (mt/id :venues)
                                                                  :aggregation  [:distinct-where
                                                                                 $price
                                                                                 [:< $price 4]]})
                                                :type          :metric}]})
      (is (= 3
             (->> (mt/run-mbql-query venues
                    {:aggregation [[:metric 1]]
                     :source-table "card__1"})
                  mt/rows
                  ffirst))))))
