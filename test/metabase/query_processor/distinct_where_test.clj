(ns ^:mb/driver-tests metabase.query-processor.distinct-where-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.distinct-where-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/distinct-where venues-price (lib/< venues-price 4))))]
      (mt/with-native-query-testing-context query
        (is (= 3
               (->> query
                    qp/process-query
                    mt/rows
                    ffirst
                    int)))))
    (testing "Should get normalized correctly and work as expected"
      ;; TODO(mbql5-migration): exercises legacy-MBQL normalization of string-keyed clauses; keep on the old macro
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
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/distinct-where
                                           venues-price
                                           (lib/and
                                            (lib/< venues-price 4)
                                            (lib/> venues-price 1)))))]
      (mt/with-native-query-testing-context query
        (is (= 2
               (->> query
                    qp/process-query
                    mt/rows
                    ffirst
                    int)))))))

(deftest ^:parallel filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/distinct-where venues-price (lib/< venues-price 4)))
                           (lib/filter (lib/> venues-price Long/MAX_VALUE)))]
      (mt/with-native-query-testing-context query
        (is (= 0
               (->> query
                    qp/process-query
                    mt/rows
                    ffirst
                    int)))))))

(deftest ^:parallel breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (let [mp                 (mt/metadata-provider)
          venues             (lib.metadata/table mp (mt/id :venues))
          venues-price       (lib.metadata/field mp (mt/id :venues :price))
          venues-category-id (lib.metadata/field mp (mt/id :venues :category_id))
          query              (-> (lib/query mp venues)
                                 (lib/aggregate (lib/distinct-where venues-price (lib/< venues-price 2)))
                                 (lib/breakout venues-category-id)
                                 (lib/limit 4))]
      (mt/with-native-query-testing-context query
        (is (= [[2 0]
                [3 0]
                [4 1]
                [5 1]]
               (->> query
                    qp/process-query
                    (mt/round-all-decimals 2)
                    mt/rows
                    (map (fn [[k v]]
                           [(int k) (int v)])))))))))

(deftest ^:parallel distinct-where-inside-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where :expressions)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/+
                                           (lib//
                                            (lib/distinct-where venues-price (lib/< venues-price 4))
                                            2)
                                           1)))]
      (mt/with-native-query-testing-context query
        (is (= 2.5
               (->> query
                    qp/process-query
                    mt/rows
                    ffirst
                    double)))))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (let [mp           (mt/metadata-provider)
          mock-mp      (lib.tu/mock-metadata-provider
                        mp
                        {:segments [{:id         1
                                     :name       "Segment 1"
                                     :table-id   (mt/id :venues)
                                     :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                     (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4)))}]})
          venues-price (lib.metadata/field mock-mp (mt/id :venues :price))
          query        (-> (lib/query mock-mp (lib.metadata/table mock-mp (mt/id :venues)))
                           (lib/aggregate (lib/distinct-where venues-price (lib/segment 1))))]
      (qp.store/with-metadata-provider mock-mp
        (mt/with-native-query-testing-context query
          (is (= 3
                 (->> query
                      qp/process-query
                      mt/rows
                      ffirst
                      int))))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :distinct-where)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          mock-mp      (lib.tu/mock-metadata-provider
                        mp
                        {:cards [{:id            1
                                  :database-id   (mt/id)
                                  :name          "Metric 1"
                                  :dataset-query (-> (lib/query mp venues)
                                                     (lib/aggregate (lib/distinct-where venues-price (lib/< venues-price 4))))
                                  :type          :metric}]})
          ;; TODO(mbql5-migration): (lib/query mp <metric card>) special-cases :type :metric cards
          ;; (metric-query, src/metabase/lib/query.cljc) -- it resolves to the metric's underlying
          ;; :source-table and auto-injects the [:metric 1] aggregation, which is NOT the legacy
          ;; {:source-table "card__1", :aggregation [[:metric 1]]} shape this test exercises. Use the
          ;; R56 legacy-map hybrid to run the exact same query as before.
          query        (lib/query mock-mp {:database (mt/id)
                                           :type     :query
                                           :query    {:source-table "card__1"
                                                      :aggregation  [[:metric 1]]}})]
      (qp.store/with-metadata-provider mock-mp
        (mt/with-native-query-testing-context query
          (is (= 3
                 (->> query
                      qp/process-query
                      mt/rows
                      ffirst
                      int))))))))
