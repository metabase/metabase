(ns ^:mb/driver-tests metabase.query-processor.distinct-where-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= 3
           (->> {:aggregation [[:distinct-where $price [:< $price 4]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                int)))

    (testing "Should get normalized correctly and work as expected"
      (is (= 3
             (->> {:aggregation [["distinct-where"
                                  ["field" (mt/id :venues :price) nil]
                                  ["<" ["field" (mt/id :venues :price) nil] 4]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  int))))))

(deftest ^:parallel compound-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= 2
           (->> {:aggregation [[:distinct-where $price [:and [:< $price 4] [:> $price 1]]]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                int)))))

(deftest ^:parallel filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= 0
           (->> {:aggregation [[:distinct-where $price [:< $price 4]]]
                 :filter      [:> $price Long/MAX_VALUE]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                int)))))

(deftest ^:parallel breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (is (= [[2 0]
            [3 0]
            [4 1]
            [5 1]]
           (->> {:aggregation [[:distinct-where $price [:< $price 2]]]
                 :breakout    [$category_id]
                 :limit       4}
                (mt/run-mbql-query venues)
                (mt/round-all-decimals 2)
                mt/rows
                (map (fn [[k v]]
                       [(int k) (int v)])))))))

(deftest ^:parallel distinct-where-inside-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where :expressions)
    (is (= 2.5
           (->> {:aggregation [[:+ [:/ [:distinct-where $price [:< $price 4]] 2] 1]]}
                (mt/run-mbql-query venues)
                mt/rows
                ffirst
                double)))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (let [mp (mt/metadata-provider)]
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        mp
                                        {:segments [{:id         1
                                                     :name       "Segment 1"
                                                     :table-id   (mt/id :venues)
                                                     :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                     (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4)))}]})
        (is (= 3
               (->> {:aggregation [[:distinct-where $price [:segment 1]]]}
                    (mt/run-mbql-query venues)
                    mt/rows
                    ffirst
                    int)))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      (mt/metadata-provider)
                                      {:cards [{:id            1
                                                :database-id   (mt/id)
                                                :name          "Metric 1"
                                                :dataset-query (mt/mbql-query venues
                                                                 {:aggregation  [:distinct-where
                                                                                 $price
                                                                                 [:< $price 4]]})
                                                :type          :metric}]})
      (is (= 3
             (->> (mt/run-mbql-query venues
                    {:aggregation [[:metric 1]]
                     :source-table "card__1"})
                  mt/rows
                  ffirst
                  int))))))
