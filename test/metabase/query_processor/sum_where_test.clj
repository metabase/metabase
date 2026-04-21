(ns ^:mb/driver-tests metabase.query-processor.sum-where-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
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
    (let [mp (mt/metadata-provider)]
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        mp
                                        {:segments [{:id         1
                                                     :name       "Segment 1"
                                                     :table-id   (mt/id :venues)
                                                     :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                     (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4)))}]})
        (is (= 179.0
               (->> {:aggregation [[:sum-where [:field (mt/id :venues :price) nil] [:segment 1]]]}
                    (mt/run-mbql-query venues)
                    mt/rows
                    ffirst
                    double)))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      (mt/metadata-provider)
                                      {:cards [{:id            1
                                                :database-id   (mt/id)
                                                :name          "Metric 1"
                                                :dataset-query (mt/mbql-query venues
                                                                 {:source-table (mt/id :venues)
                                                                  :aggregation  [:sum-where
                                                                                 $price
                                                                                 [:< $price 4]]})
                                                :type          :metric}]})
      (is (= 179.0
             (->> (mt/run-mbql-query venues
                    {:aggregation [[:metric 1]]
                     :source-table "card__1"})
                  mt/rows
                  ffirst
                  double))))))
