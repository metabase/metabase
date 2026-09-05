(ns ^:mb/driver-tests metabase.query-processor.share-test
  "Tests for the `:share` aggregation."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.share-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(deftest ^:parallel basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/aggregate (lib/share (lib/< venues-price 4))))]
      (mt/with-native-query-testing-context query
        (is (= [[0.94]]
               (mt/formatted-rows
                [2.0]
                (qp/process-query query))))))))

(deftest ^:parallel normalization-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Normalization"
      ;; TODO(mbql5-migration): exercises legacy-MBQL normalization of string-keyed clauses; keep on the old macro
      (is (= [[0.94]]
             (mt/formatted-rows
              [2.0]
              (mt/run-mbql-query venues
                {:aggregation [["share" ["<" ["field-id" (mt/id :venues :price)] 4]]]})))))))

(deftest ^:parallel complex-filter-clauses-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Complex filter clauses"
      (let [mp           (mt/metadata-provider)
            venues       (lib.metadata/table mp (mt/id :venues))
            venues-price (lib.metadata/field mp (mt/id :venues :price))
            venues-name  (lib.metadata/field mp (mt/id :venues :name))
            query        (-> (lib/query mp venues)
                             (lib/aggregate (lib/share
                                             (lib/and
                                              (lib/< venues-price 4)
                                              (lib/or
                                               (lib/starts-with venues-name "M")
                                               (lib/ends-with venues-name "t"))))))]
        (mt/with-native-query-testing-context query
          (is (= [[0.17]]
                 (mt/formatted-rows
                  [2.0]
                  (qp/process-query query)))))))))

(defmethod driver/database-supports? [::driver/driver ::divide-null-by-zero]
  [_driver _feature _database]
  true)

;;; Vertica doesn't allow dividing null by zero
;;;
;;; TODO consider wrapping all divisions in nullif checking the first argument
(defmethod driver/database-supports? [:vertica ::divide-null-by-zero]
  [_driver _feature _database]
  false)

(defmulti divide-null-by-zero-expected-error-message-regex
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod divide-null-by-zero-expected-error-message-regex :default
  [_driver]
  #"Division by zero")

(defmethod driver/database-supports? [::driver/driver ::empty-results-wrong-because-of-issue-5419]
  [_driver _feature _database]
  false)

;;; due to a bug in the Mongo counts are returned as empty when there are no results (#5419)
(defmethod driver/database-supports? [:mongo ::empty-results-wrong-because-of-issue-5419]
  [_driver _feature _database]
  true)

(deftest ^:parallel empty-results-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "empty results"
      (let [mp           (mt/metadata-provider)
            venues       (lib.metadata/table mp (mt/id :venues))
            venues-price (lib.metadata/field mp (mt/id :venues :price))
            query        (-> (lib/query mp venues)
                             (lib/aggregate (lib/share (lib/< venues-price 4)))
                             (lib/filter (lib/> venues-price Long/MAX_VALUE)))]
        (letfn [(run-query []
                  (mt/with-native-query-testing-context query
                    (qp/process-query query)))]
          (cond
            (not (driver/database-supports? driver/*driver* ::divide-null-by-zero (mt/db)))
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 (divide-null-by-zero-expected-error-message-regex driver/*driver*)
                 (run-query)))

            (driver/database-supports? driver/*driver* ::empty-results-wrong-because-of-issue-5419 (mt/db))
            (is (= []
                   (mt/rows (run-query))))

            :else
            (is (= [[nil]]
                   (mt/rows (run-query))))))))))

(deftest ^:parallel segment-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Share containing a Segment"
      (let [mp      (mt/metadata-provider)
            mock-mp (lib.tu/mock-metadata-provider
                     mp
                     {:segments [{:id         1
                                  :table-id   (mt/id :venues)
                                  :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                  (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4)))}]})
            query   (-> (lib/query mock-mp (lib.metadata/table mock-mp (mt/id :venues)))
                        (lib/aggregate (lib/share (lib/segment 1))))]
        (is (= [[0.94]]
               (mt/formatted-rows
                [2.0]
                (qp/process-query query))))))))

(deftest ^:parallel metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Share inside a Metric"
      (let [mp           (mt/metadata-provider)
            venues       (lib.metadata/table mp (mt/id :venues))
            venues-price (lib.metadata/field mp (mt/id :venues :price))
            mock-mp      (lib.tu/mock-metadata-provider
                          mp
                          {:cards [{:id            1
                                    :dataset-query (-> (lib/query mp venues)
                                                       (lib/aggregate (lib/share (lib/< venues-price 4))))
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
        (is (= [[0.94]]
               (mt/formatted-rows
                [2.0]
                (qp/process-query query))))))))

(deftest ^:parallel share-containing-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Share containing an expression"
      (let [mp                 (mt/metadata-provider)
            venues             (lib.metadata/table mp (mt/id :venues))
            venues-price       (lib.metadata/field mp (mt/id :venues :price))
            venues-category-id (lib.metadata/field mp (mt/id :venues :category_id))
            query              (-> (lib/query mp venues)
                                   (lib/aggregate (lib/share (lib/< venues-price 2)))
                                   (lib/breakout venues-category-id)
                                   (lib/limit 4))]
        (mt/with-native-query-testing-context query
          (is (= [[2 0.0]
                  [3 0.0]
                  [4 0.5]
                  [5 0.14]]
                 (mt/formatted-rows
                  [int 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel share-inside-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Share inside an expression"
      (let [mp           (mt/metadata-provider)
            venues       (lib.metadata/table mp (mt/id :venues))
            venues-price (lib.metadata/field mp (mt/id :venues :price))
            query        (-> (lib/query mp venues)
                             (lib/aggregate (lib/+
                                             (lib//
                                              (lib/share (lib/< venues-price 4))
                                              2)
                                             1)))]
        (mt/with-native-query-testing-context query
          (is (= [[1.47]]
                 (mt/formatted-rows
                  [2.0]
                  (qp/process-query query)))))))))
