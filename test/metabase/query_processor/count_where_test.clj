(ns ^:mb/driver-tests metabase.query-processor.count-where-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.count-where-test]}}}}}}
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
                           (lib/aggregate (lib/count-where (lib/< venues-price 4))))]
      (mt/with-native-query-testing-context query
        (is (= 94
               (->> query
                    qp/process-query
                    mt/rows
                    ffirst
                    long)))))
    (testing "normalization"
      ;; TODO(mbql5-migration): exercises legacy-MBQL normalization of string-keyed clauses; keep on the old macro
      (is (= 94
             (->> {:aggregation [["count-where" ["<" ["field-id" (mt/id :venues :price)] 4]]]}
                  (mt/run-mbql-query venues)
                  mt/rows
                  ffirst
                  long))))))

(deftest ^:parallel compound-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          venues-name  (lib.metadata/field mp (mt/id :venues :name))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/count-where
                                           (lib/and
                                            (lib/< venues-price 4)
                                            (lib/or
                                             (lib/starts-with venues-name "M")
                                             (lib/ends-with venues-name "t"))))))]
      (mt/with-native-query-testing-context query
        (is (= 17
               (->> query
                    qp/process-query
                    mt/rows
                    ffirst
                    long)))))))

(deftest ^:parallel filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/count-where (lib/< venues-price 4)))
                           (lib/filter (lib/> venues-price Long/MAX_VALUE)))]
      (mt/with-native-query-testing-context query
        (is (= nil
               (->> query
                    qp/process-query
                    mt/rows
                    ffirst)))))))

(deftest ^:parallel breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp                 (mt/metadata-provider)
          venues             (lib.metadata/table mp (mt/id :venues))
          venues-price       (lib.metadata/field mp (mt/id :venues :price))
          venues-category-id (lib.metadata/field mp (mt/id :venues :category_id))
          query              (-> (lib/query mp venues)
                                 (lib/aggregate (lib/count-where (lib/< venues-price 2)))
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
                           [(long k) (long v)])))))))))

(deftest ^:parallel count-where-inside-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/+
                                           (lib//
                                            (lib/count-where (lib/< venues-price 4))
                                            2)
                                           1)))]
      (mt/with-native-query-testing-context query
        (is (= 48
               (-> query
                   qp/process-query
                   mt/rows
                   ffirst
                   long)))))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp      (mt/metadata-provider)
          mock-mp (lib.tu/mock-metadata-provider
                   mp
                   {:segments [{:id         1
                                :table-id   (mt/id :venues)
                                :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4)))}]})
          query   (-> (lib/query mock-mp (lib.metadata/table mock-mp (mt/id :venues)))
                      (lib/aggregate (lib/count-where (lib/segment 1))))]
      (qp.store/with-metadata-provider mock-mp
        (mt/with-native-query-testing-context query
          (is (= 94
                 (->> query
                      qp/process-query
                      mt/rows
                      ffirst
                      long))))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          mock-mp      (lib.tu/mock-metadata-provider
                        mp
                        {:cards [{:id            1
                                  :dataset-query (-> (lib/query mp venues)
                                                     (lib/aggregate (lib/count-where (lib/< venues-price 4))))
                                  :type          :metric}]})
          ;; TODO(mbql5-migration): R56 hybrid — (lib/query mp (lib.metadata/card mp N)) on a :type :metric
          ;; card re-sources the stage onto the metric's :source-table and pre-adds the [:metric] aggregation,
          ;; so there is no clean builder path for a metric used as its own source card. Wrapping the legacy
          ;; inner query converts to {:source-card 1, :aggregation [[:metric {} 1]]}, exactly the old macro
          ;; output.
          query        (lib/query mock-mp {:database (mt/id)
                                           :type     :query
                                           :query    {:source-table "card__1"
                                                      :aggregation  [[:metric 1]]}})]
      (qp.store/with-metadata-provider mock-mp
        (mt/with-native-query-testing-context query
          (is (= 94
                 (->> query
                      qp/process-query
                      mt/rows
                      ffirst
                      long))))))))
