(ns ^:mb/driver-tests metabase.query-processor.case-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.case-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(defn- test-case
  ;; TODO(mbql5-migration): the 1-arity exercises legacy-MBQL normalization of string-keyed clauses (used only by
  ;; [[test-case-normalization]]); keep it on the old macro.
  ([expr]
   (some->> (mt/run-mbql-query venues {:aggregation [expr]})
            mt/rows
            ffirst
            double))

  ([mp expr]
   (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                   (lib/aggregate expr))]
     (mt/with-native-query-testing-context query
       (some->> (qp/process-query query)
                mt/rows
                ffirst
                double)))))

(deftest ^:parallel test-case-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (let [mp           (mt/metadata-provider)
          venues-price (lib.metadata/field mp (mt/id :venues :price))]
      (is (= 116.0 (test-case mp (lib/sum (lib/case [[(lib/< venues-price 2) 2]
                                                     [(lib/< venues-price 4) 1]]))))))))

(deftest ^:parallel test-case-aggregations-fields-as-values
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Can we use fields as values"
      (let [mp           (mt/metadata-provider)
            venues-price (lib.metadata/field mp (mt/id :venues :price))]
        (is (= 179.0 (test-case mp (lib/sum (lib/case [[(lib/< venues-price 2) venues-price]
                                                       [(lib/< venues-price 4) venues-price]])))))))))

(deftest ^:parallel test-case-aggregations-else
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Test else clause"
      (let [mp           (mt/metadata-provider)
            venues-price (lib.metadata/field mp (mt/id :venues :price))]
        (is (= 122.0 (test-case mp (lib/sum (lib/case [[(lib/< venues-price 2) 2]] 1)))))))))

(deftest ^:parallel test-case-aggregations-implicit-else
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Test implicit else (= nil) clause"
      ;; Some DBs return 0 for sum of nulls.
      (let [mp           (mt/metadata-provider)
            venues-price (lib.metadata/field mp (mt/id :venues :price))]
        (is ((some-fn nil? zero?) (test-case mp (lib/sum (lib/case [[(lib/> venues-price 200) 2]])))))))))

(deftest ^:parallel test-case-aggregations-complex-filters
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Test complex filters"
      (let [mp           (mt/metadata-provider)
            venues-price (lib.metadata/field mp (mt/id :venues :price))
            venues-name  (lib.metadata/field mp (mt/id :venues :name))]
        (is (= 34.0 (test-case mp (lib/sum
                                   (lib/case [[(lib/and (lib/< venues-price 4)
                                                        (lib/or (lib/starts-with venues-name "M")
                                                                (lib/ends-with venues-name "t")))
                                               venues-price]])))))))))

(deftest ^:parallel test-case-aggregations-in-segments
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Can we use segments in case"
      (let [mp           (mt/metadata-provider)
            venues       (lib.metadata/table mp (mt/id :venues))
            venues-price (lib.metadata/field mp (mt/id :venues :price))
            mock-mp      (lib.tu/mock-metadata-provider
                          mp
                          {:segments [{:id         1
                                       :table-id   (mt/id :venues)
                                       :definition (-> (lib/query mp venues)
                                                       (lib/filter (lib/< venues-price 4)))}]})]
        (is (= 179.0
               (test-case mock-mp (lib/sum (lib/case [[(lib/segment 1) venues-price]])))))))))

(deftest ^:parallel test-case-aggregations-in-metric
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Can we use case in metric"
      (let [mp           (mt/metadata-provider)
            venues       (lib.metadata/table mp (mt/id :venues))
            venues-price (lib.metadata/field mp (mt/id :venues :price))
            mock-mp      (lib.tu/mock-metadata-provider
                          mp
                          {:cards [{:id            1
                                    :type          :metric
                                    :dataset_query (-> (lib/query mp venues)
                                                       (lib/aggregate (lib/sum (lib/case [[(lib/< venues-price 4)
                                                                                           venues-price]]))))}]})
            ;; TODO(mbql5-migration): R56 hybrid — (lib/query mp (lib.metadata/card mp N)) on a :type :metric
            ;; card re-sources the stage and pre-adds the [:metric] aggregation (metric-query), so no builder
            ;; path reproduces the legacy :source-card + [:metric] stage shape. Wrapping the legacy map converts
            ;; to {:source-card 1, :aggregation [[:metric {} 1]]}, exactly the old macro output.
            query        (lib/query mock-mp {:database (mt/id)
                                             :type     :query
                                             :query    {:source-table "card__1"
                                                        :aggregation  [[:metric 1]]}})]
        (is (= 179.0
               (some->> (qp/process-query query)
                        mt/rows
                        ffirst
                        double)))))))

(deftest ^:parallel test-case-aggregations-in-breakout
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Can we use case with breakout"
      (let [mp                 (mt/metadata-provider)
            venues             (lib.metadata/table mp (mt/id :venues))
            venues-price       (lib.metadata/field mp (mt/id :venues :price))
            venues-category-id (lib.metadata/field mp (mt/id :venues :category_id))
            query              (-> (lib/query mp venues)
                                   (lib/aggregate (lib/sum (lib/case [[(lib/< venues-price 2) venues-price]] 0)))
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
                             [(long k) (double v)]))))))))))

(deftest ^:parallel test-case-aggregations+expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Can we use case in metric expressions"
      (let [mp           (mt/metadata-provider)
            venues-price (lib.metadata/field mp (mt/id :venues :price))]
        (is (= 90.5 (test-case mp (lib/+ (lib// (lib/sum (lib/case [[(lib/< venues-price 4) venues-price]] 0))
                                                2)
                                         1))))))))

(deftest ^:parallel test-case-aggregations+expressions-2
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Can use expressions as values"
      (let [mp           (mt/metadata-provider)
            venues-price (lib.metadata/field mp (mt/id :venues :price))]
        (is (= 194.5 (test-case mp (lib/sum (lib/case [[(lib/< venues-price 2) (lib/+ venues-price 1)]
                                                       [(lib/< venues-price 4) (lib/+ (lib// venues-price 2) 1)]])))))))))

(deftest ^:parallel test-case-normalization
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    ;; TODO(mbql5-migration): exercises legacy-MBQL normalization of string-keyed clauses; keep on the old macro
    ;; (via the 1-arity of [[test-case]]).
    (is (= 116.0 (test-case ["sum" ["case" [[["<" ["field-id" (mt/id :venues :price)] 2] 2]
                                            [["<" ["field-id" (mt/id :venues :price)] 4] 1]]]])))))

(deftest ^:parallel test-case-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (let [mp           (mt/metadata-provider)
          venues       (lib.metadata/table mp (mt/id :venues))
          venues-price (lib.metadata/field mp (mt/id :venues :price))
          query        (-> (lib/query mp venues)
                           (lib/expression "case_test" (lib/case [[(lib/< venues-price 2) -1.0]
                                                                  [(lib/< venues-price 3) -2.0]]))
                           (as-> $q (lib/with-fields $q [(lib/expression-ref $q "case_test")])))]
      (mt/with-native-query-testing-context query
        (is (= [nil -2.0 -1.0]
               (->> (qp/process-query query)
                    mt/rows
                    (map (comp #(some-> % double) first))
                    distinct
                    sort)))))))

(deftest ^:parallel two-case-functions-test
  (testing "We should support expressions with two case statements (#15107)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
      (let [mp                (mt/metadata-provider)
            products          (lib.metadata/table mp (mt/id :products))
            products-category (lib.metadata/field mp (mt/id :products :category))
            products-rating   (lib.metadata/field mp (mt/id :products :rating))
            products-id       (lib.metadata/field mp (mt/id :products :id))
            query             (-> (lib/query mp products)
                                  (lib/expression "two-cases" (lib/+ (lib/case [[(lib/= products-category "Widget") 1]] 0)
                                                                     (lib/case [[(lib/> products-rating 4) 1]] 0)))
                                  (as-> $q (lib/with-fields $q [(lib/expression-ref $q "two-cases")]))
                                  (lib/limit 2)
                                  (lib/order-by products-id))]
        (mt/with-native-query-testing-context query
          (is (= [[1] [0]]
                 (mt/formatted-rows [int] (qp/process-query query)))))))))

(deftest ^:parallel case-with-boolean-column-condition-test
  (testing "a boolean column can be used directly as a :case condition (#16386)"
    (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
      (mt/dataset places-cam-likes
        (let [mp    (mt/metadata-provider)
              liked (lib.metadata/field mp (mt/id :places :liked))
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :places)))
                        (lib/aggregate (lib/sum (lib/case [[liked 1]] 0))))]
          (is (= [[2.0]]
                 (mt/formatted-rows [1.0] (qp/process-query query)))))))))

(deftest ^:parallel if-test
  (testing "If should work as syntactic sugar for case"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
      (let [mp          (mt/metadata-provider)
            products    (lib.metadata/table mp (mt/id :products))
            products-id (lib.metadata/field mp (mt/id :products :id))
            ;; there is no lib/if builder (:if is an alias tag of :case), so use the lib/expression-clause
            ;; escape hatch (R34); it re-groups the flat args into the [[pred expr] ...] + fallback shape.
            query       (-> (lib/query mp products)
                            (lib/expression "If" (lib/expression-clause :if
                                                                        [(lib/= products-id 1) "First"
                                                                         (lib/= products-id 2) "Second"
                                                                         "Other"]
                                                                        nil))
                            (as-> $q (-> $q
                                         (lib/with-fields [products-id (lib/expression-ref $q "If")])
                                         (lib/filter (lib/= (lib/expression-ref $q "If") "Other"))))
                            (lib/order-by products-id)
                            (lib/limit 2))]
        (is (= [[3 "Other"]
                [4 "Other"]]
               (mt/formatted-rows [int str] (qp/process-query query))))))))
