(ns ^:mb/driver-tests metabase.query-processor.sum-where-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.sum-where-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/sum-where venues-price (lib/< venues-price 4))))]
      (mt/with-native-query-testing-context query
        (is (= 179.0
               (->> (qp/process-query query)
                    mt/rows
                    ffirst
                    double)))))
    (testing "Should get normalized correctly and work as expected"
      ;; TODO(mbql5-migration): exercises legacy-MBQL normalization of string-keyed clauses; must stay on the old macro
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
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          venues-name  (lib.metadata/field mp (mt/id :venues :name))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/sum-where
                                           venues-price
                                           (lib/and (lib/< venues-price 4)
                                                    (lib/or (lib/starts-with venues-name "M")
                                                            (lib/ends-with venues-name "t"))))))]
      (mt/with-native-query-testing-context query
        (is (= 34.0
               (->> (qp/process-query query)
                    mt/rows
                    ffirst
                    double)))))))

(deftest ^:parallel filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/sum-where venues-price (lib/< venues-price 4)))
                           (lib/filter (lib/> venues-price Long/MAX_VALUE)))]
      (mt/with-native-query-testing-context query
        (is (= nil
               (->> (qp/process-query query)
                    mt/rows
                    ffirst)))))))

(deftest ^:parallel breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp                 (mt/metadata-provider)
          venues             (lib.metadata/table mp (mt/id :venues))
          venues-price       (lib.metadata/field mp (mt/id :venues :price))
          venues-category-id (lib.metadata/field mp (mt/id :venues :category_id))
          query              (-> (lib/query mp venues)
                                 (lib/aggregate (lib/sum-where venues-price (lib/< venues-price 2)))
                                 (lib/breakout venues-category-id)
                                 (lib/limit 4))]
      (mt/with-native-query-testing-context query
        (is (= [[2 0.0]
                [3 0.0]
                [4 1.0]
                [5 1.0]]
               (->> (qp/process-query query)
                    (mt/round-all-decimals 2)
                    mt/rows
                    (map (fn [[k v]]
                           [(long k) (double v)])))))))))

(deftest ^:parallel sum-where-inside-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/+ (lib// (lib/sum-where venues-price (lib/< venues-price 4))
                                                        2)
                                                 1)))]
      (mt/with-native-query-testing-context query
        (is (= 90.5
               (->> (qp/process-query query)
                    mt/rows
                    ffirst
                    double)))))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          mock-mp      (lib.tu/mock-metadata-provider
                        mp
                        {:segments [{:id         1
                                     :name       "Segment 1"
                                     :table-id   (mt/id :venues)
                                     :definition (-> (lib/query mp venues)
                                                     (lib/filter (lib/< venues-price 4)))}]})
          query        (-> (lib/query mock-mp (lib.metadata/table mock-mp (mt/id :venues)))
                           (lib/aggregate (lib/sum-where venues-price (lib/segment 1))))]
      (qp.store/with-metadata-provider mock-mp
        (mt/with-native-query-testing-context query
          (is (= 179.0
                 (->> (qp/process-query query)
                      mt/rows
                      ffirst
                      double))))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          mock-mp      (lib.tu/mock-metadata-provider
                        mp
                        {:cards [{:id            1
                                  :database-id   (mt/id)
                                  :name          "Metric 1"
                                  :dataset-query (-> (lib/query mp venues)
                                                     (lib/aggregate (lib/sum-where venues-price (lib/< venues-price 4))))
                                  :type          :metric}]})
          ;; TODO(mbql5-migration): no builder path reproduces :source-card + [:metric] — lib/query on a metric card
          ;; splices the metric's own aggregation into the stage (and uses :source-table, not :source-card), so use
          ;; the R56 legacy-map hybrid to preserve the original query shape.
          query        (lib/query mock-mp {:database (mt/id)
                                           :type     :query
                                           :query    {:source-table "card__1"
                                                      :aggregation  [[:metric 1]]}})]
      (qp.store/with-metadata-provider mock-mp
        (mt/with-native-query-testing-context query
          (is (= 179.0
                 (->> (qp/process-query query)
                      mt/rows
                      ffirst
                      double))))))))
