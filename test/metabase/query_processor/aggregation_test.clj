(ns ^:mb/driver-tests metabase.query-processor.aggregation-test
  "Tests for MBQL aggregations."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.aggregation-test]}
                                                            metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.aggregation-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ;; binds mock metadata providers via the ambient store, which the code under test reads
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel no-aggregation-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Test that no aggregation just returns rows as-is."
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]
              [4 "Wurstküche" 29 33.9997 -118.465 2]
              [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
              [6 "The 101 Coffee Shop" 20 34.1054 -118.324 2]
              [7 "Don Day Korean Restaurant" 44 34.0689 -118.305 2]
              [8 "25°" 11 34.1015 -118.342 2]
              [9 "Krua Siri" 71 34.1018 -118.301 1]
              [10 "Fred 62" 20 34.1046 -118.292 2]]
             (mt/formatted-rows
              :venues
              (mt/run-mbql-query venues
                {:limit 10, :order-by [[:asc $id]]})))))))

(deftest ^:parallel count-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "count aggregation"
      (is (= [[100]]
             (mt/formatted-rows
              [int]
              (mt/run-mbql-query venues
                {:aggregation [[:count]]})))))))

(deftest ^:parallel sum-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "sum aggregation"
      (is (= [[203]]
             (mt/formatted-rows
              [int]
              (mt/run-mbql-query venues
                {:aggregation [[:sum $price]]})))))))

(deftest ^:parallel avg-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "avg aggregation"
      (is (= [[35.5059]]
             (mt/formatted-rows
              [4.0]
              (mt/run-mbql-query venues
                {:aggregation [[:avg $latitude]]})))))))

(deftest ^:parallel distinct-count-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "distinct count aggregation"
      (is (= [[15]]
             (mt/formatted-rows
              [int]
              (mt/run-mbql-query checkins
                {:aggregation [[:distinct $user_id]]})))))))

(deftest ^:parallel standard-deviation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (testing "standard deviation aggregations"
      (let [query (mt/mbql-query venues {:aggregation [[:stddev $latitude]]})]
        (mt/with-native-query-testing-context query
          (is (=? {:cols [(qp.test-util/aggregate-col :stddev :venues :latitude)]
                   :rows [[3.4]]}
                  (qp.test-util/rows-and-cols
                   (mt/format-rows-by
                    [1.0]
                    (mt/process-query query))))))))))

(deftest ^:parallel standard-deviation-unsupported-test
  (mt/test-drivers (mt/normal-drivers-without-feature :standard-deviation-aggregations)
    (testing "Make sure standard deviations fail for drivers that don't support it"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"standard-deviation-aggregations is not supported by sqlite driver"
           (mt/run-mbql-query venues
             {:aggregation [[:stddev $latitude]]}))))))

;;; other advanced aggregation types are tested in [[metabase.query-processor.advanced-math-test]]

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIN & MAX                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel min-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [1]
           (mt/first-row
            (mt/format-rows-by
             [int]
             (mt/run-mbql-query venues
               {:aggregation [[:min $price]]})))))))

(deftest ^:parallel min-test-2
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[1 34.0071] [2 33.7701] [3 10.0646] [4 33.983]]
           (mt/formatted-rows
            [int 4.0]
            (mt/run-mbql-query venues
              {:aggregation [[:min $latitude]]
               :breakout    [$price]}))))))

(deftest ^:parallel max-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [4]
           (mt/first-row
            (mt/format-rows-by
             [int]
             (mt/run-mbql-query venues
               {:aggregation [[:max $price]]})))))))

(deftest ^:parallel max-test-2
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[1 37.8078] [2 40.7794] [3 40.7262] [4 40.7677]]
           (mt/formatted-rows
            [int 4.0]
            (mt/run-mbql-query venues
              {:aggregation [[:max $latitude]]
               :breakout    [$price]}))))))

(deftest ^:parallel multiple-aggregations-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "two aggregations"
      (is (= [[100 203]]
             (mt/formatted-rows
              [int int]
              (mt/run-mbql-query venues
                {:aggregation [[:count] [:sum $price]]})))))))

(deftest ^:parallel multiple-aggregations-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "three aggregations"
      (is (= [[2 100 203]]
             (mt/formatted-rows
              [int int int]
              (mt/run-mbql-query venues
                {:aggregation [[:avg $price] [:count] [:sum $price]]})))))))

(deftest ^:parallel multiple-aggregations-metadata-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "make sure that multiple aggregations of the same type have the correct metadata (#4003)"
      (is (=? [(qp.test-util/aggregate-col :count)
               (assoc (qp.test-util/aggregate-col :count) :name "count_2", :field_ref [:aggregation 1])]
              (mt/cols
               (mt/run-mbql-query venues
                 {:aggregation [[:count] [:count]]})))))))

(deftest ^:parallel field-settings-for-aggregate-fields-test
  (testing "Does `:settings` show up for aggregate Fields?"
    (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                      (mt/metadata-provider)
                                      {:fields [{:id       (mt/id :venues :price)
                                                 :settings {:is_priceless false}}]})
      (let [results (mt/run-mbql-query venues
                      {:aggregation [[:sum $price]]})]
        (is (=? (assoc (qp.test-util/aggregate-col :sum :venues :price)
                       :settings {:is_priceless false})
                (or (-> results mt/cols first)
                    results)))))))

(deftest ^:parallel semantic-type-for-aggregate-fields-test
  (testing "Does `:semantic-type` show up for aggregate Fields? (#38022)"
    (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                      (mt/metadata-provider)
                                      {:fields [{:id            (mt/id :venues :price)
                                                 :semantic-type :type/Currency}]})
      (let [price [:field (mt/id :venues :price) nil]]
        (doseq [[aggregation expected-semantic-type]
                [[[:sum price] :type/Currency]
                 [[:count price] :type/Quantity]
                 [[:cum-count price] :type/Quantity]
                 [[:avg price] :type/Currency]
                 [[:distinct price] :type/Quantity]
                 [[:max price] :type/Currency]
                 [[:median price] :type/Currency]
                 [[:min price] :type/Currency]
                 [[:share [:< price 10]] :type/Percentage]
                 [[:stddev price] :type/Currency]
                 [[:cum-sum price] :type/Currency]
                 [[:var price] nil]
                 [[:count-where [:> price 10]] :type/Quantity]
                 [[:sum-where price [:> price 10]] :type/Currency]
                 [[:percentile price 0.9] nil]]]
          (let [results (mt/run-mbql-query venues {:aggregation aggregation})]
            (testing (format "The %s Aggregation's semantic-type should be: %s" (first aggregation) expected-semantic-type)
              (is (= expected-semantic-type
                     (:semantic_type
                      (or (-> results mt/cols first)
                          results)))))))))))

(deftest ^:parallel duplicate-aggregations-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Do we properly handle queries that have more than one of the same aggregation? (#5393)"
      (is (= [[5050 203]]
             (mt/formatted-rows
              [int int]
              (mt/run-mbql-query venues
                {:aggregation [[:sum $id] [:sum $price]]})))))))

(deftest ^:parallel multiple-distinct-aggregations-test
  (testing "Multiple `:distinct` aggregations should work correctly (#13097)"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [[100 4]]
             (mt/formatted-rows
              [int int]
              (mt/run-mbql-query venues
                {:aggregation [[:distinct $name]
                               [:distinct $price]]})))))))

;;; TODO: This test was added in PR #44442 fixing issue #35425. Enable this test for other drivers _while_ fixing the
;;;       issue #14523.
(defmethod driver/database-supports? [::driver/driver ::complex-distinct-aggregation-test]
  [_driver _feature _database]
  false)

(defmethod driver/database-supports? [:mongo ::complex-distinct-aggregation-test]
  [_driver _feature _database]
  true)

(deftest ^:synchronized complex-distinct-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature ::complex-distinct-aggregation-test)
    (testing "Aggregation as `Count / Distinct([SOME_FIELD])` returns expected results (#35425)"
      (every?
       (fn [[_id c d c-div-d more-complex]]
         (testing "Simple division"
           (is (= (u/round-to-decimals 2 (double (/ c d)))
                  (u/round-to-decimals 2 (double c-div-d)))))
         (testing "More complex expression"
           (is (= (u/round-to-decimals 2 (double (/
                                                  (- c (* d 10))
                                                  (+ d (- c (- d 7))))))
                  (u/round-to-decimals 2 (double more-complex))))))
       (mt/rows
        (mt/run-mbql-query
          venues
          {:aggregation [[:aggregation-options [:count] {:name "A"}]
                         [:aggregation-options [:distinct $price] {:name "B"}]
                         [:aggregation-options [:/ [:count] [:distinct $price]] {:name "C"}]
                         [:aggregation-options [:/
                                                [:- [:count] [:* [:distinct $price] 10]]
                                                [:+
                                                 [:distinct $price]
                                                 [:- [:count] [:- [:distinct $price] 7]]]] {:name "D"}]]
           :breakout [$category_id]
           :order-by [[:asc $id]]
           :limit 5}))))))

(deftest ^:parallel aggregate-boolean-without-type-test
  (testing "Legacy breakout on boolean field should work correctly (#34286)"
    (mt/dataset places-cam-likes
      (is (= {false 1, true 2}
             (into {}
                   (mt/formatted-rows
                    [boolean int]
                    (mt/run-mbql-query places
                      {:breakout     [[:field %liked nil]]
                       :aggregation  [["count"]]})))))))
  (testing "Legacy breakout on boolean field with explicit type should work correctly (#34286)"
    (mt/dataset places-cam-likes
      (is (= {false 1, true 2}
             (into {}
                   (mt/formatted-rows
                    [boolean int]
                    (mt/run-mbql-query places
                      {:breakout     [[:field %liked {:base-type :type/Boolean}]]
                       :aggregation  [["count"]]}))))))))

(deftest ^:parallel aggregation-with-between-is-consistent-test
  (testing "an aggregation with a between clause should return consistent results #55302"
    (mt/test-drivers (mt/normal-drivers)
      (mt/dataset daily-bird-counts
        (let [mp          (mt/metadata-provider)
              bird-count  (lib.metadata/table mp (mt/id :bird-count))
              date-field  (lib.metadata/field mp (mt/id :bird-count :date))
              count-field (lib.metadata/field mp (mt/id :bird-count :count))
              query       (-> (lib/query mp bird-count)
                              (lib/aggregate (lib/sum (lib/case [[(lib/between date-field "2018-09-01" "2018-09-30") count-field]] 0))))]
          (is (= [[39]]
                 (mt/formatted-rows [int] (qp/process-query query)))))))))

(deftest ^:parallel aggregation-and-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "adding an aggregation to a query with fields works"
      (let [mp (mt/metadata-provider)]
        (is (= [[100]]
               (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                   (lib/with-fields [(lib/ref (lib.metadata/field mp (mt/id :venues :id)))
                                     (lib/ref (lib.metadata/field mp (mt/id :venues :name)))])
                   (lib/aggregate (lib/count))
                   (qp/process-query)
                   (->> (mt/formatted-rows [int])))))))))

(deftest ^:parallel aggregation-and-join-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "adding an aggregation to a query with fields from joins works"
      (let [mp (mt/metadata-provider)]
        (is (= [[18760]]
               (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                   (lib/with-fields [(lib/ref (lib.metadata/field mp (mt/id :orders :id)))
                                     (lib/ref (lib.metadata/field mp (mt/id :orders :total)))])
                   (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products))
                                              [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                                      (-> (lib.metadata/field mp (mt/id :products :id))
                                                          (lib/with-join-alias "Products")))]))
                   (lib/aggregate (lib/count))
                   (qp/process-query)
                   (->> (mt/formatted-rows [int])))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Measure Tests                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel measure-results-test
  (testing "Execute query with measure through full QP, verify results match equivalent direct aggregation"
    (let [mp (mt/metadata-provider)
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                 (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Total Price"
                           :table-id   (mt/id :products)
                           :definition measure-definition}]})
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (= (mt/rows (qp/process-query measure-definition))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel nested-measure-results-test
  (testing "Execute query with nested measures, verify results"
    (let [mp (mt/metadata-provider)
          measure2-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                  (lib/aggregate (lib/count)))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         2
                           :name       "Product Count"
                           :table-id   (mt/id :products)
                           :definition measure2-definition}]})
          measure1-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                  (lib/aggregate (lib/* (lib.metadata/measure mp 2) 10)))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Product Count x10"
                           :table-id   (mt/id :products)
                           :definition measure1-definition}]})
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/aggregate (lib.metadata/measure mp 1)))
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/* (lib/count) 10)))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel measure-with-breakout-test
  (testing "Measure works correctly with breakout"
    (let [mp (mt/metadata-provider)
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                 (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Total Price"
                           :table-id   (mt/id :products)
                           :definition measure-definition}]})
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/aggregate (lib.metadata/measure mp 1))
                            (lib/breakout (lib.metadata/field mp (mt/id :products :category))))
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price))))
                           (lib/breakout (lib.metadata/field mp (mt/id :products :category))))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel measure-with-segment-test
  (testing "Measure with segment reference works through full QP pipeline"
    (let [mp (mt/metadata-provider)
          mp (lib.tu/mock-metadata-provider
              mp
              {:segments [{:id         1
                           :name       "Affordable Venues"
                           :table-id   (mt/id :venues)
                           :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                           (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4)))}]})
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                 (lib/aggregate (lib/count-where (lib.metadata/segment mp 1))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Affordable Venue Count"
                           :table-id   (mt/id :venues)
                           :definition measure-definition}]})
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                            (lib/aggregate (lib.metadata/measure mp 1)))
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                           (lib/aggregate (lib/count-where (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4))))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel measure-multi-stage-query-test
  (testing "Measure works correctly when referenced in a subsequent stage (field ref should use operator name, not display name)"
    (let [mp (mt/metadata-provider)
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                 (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Total Price"
                           :table-id   (mt/id :products)
                           :definition measure-definition}]})
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/breakout (lib.metadata/field mp (mt/id :products :category)))
                            (lib/aggregate (lib.metadata/measure mp 1))
                            lib/append-stage)
          measure-cols (lib/filterable-columns measure-query)
          measure-col (m/find-first #(= (:name %) "sum") measure-cols)
          measure-query (lib/filter measure-query (lib/> measure-col 100))
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/breakout (lib.metadata/field mp (mt/id :products :category)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price))))
                           lib/append-stage)
          direct-cols (lib/filterable-columns direct-query)
          direct-col (m/find-first #(= (:name %) "sum") direct-cols)
          direct-query (lib/filter direct-query (lib/> direct-col 100))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel measure-maintains-aggregation-refs-test
  (testing "the aggregation that replaces a :measure ref should keep the :measure's :lib/uuid, so :aggregation refs pointing to it are still valid"
    (let [mp          (mt/metadata-provider)
          definition  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                          (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :venues :price)))))
          mp          (lib.tu/mock-metadata-provider
                       mp
                       {:measures [{:id         1
                                    :name       "Total Revenue"
                                    :table-id   (mt/id :venues)
                                    :definition definition}]})
          measure     (lib.metadata/measure mp 1)
          query       (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                          (lib/aggregate measure)
                          (as-> <> (lib/order-by <> (lib/aggregation-ref <> 0))))]
      (is (=? {:stages [{:aggregation [[:sum {:lib/uuid (=?/same :uuid)} [:field {} (mt/id :venues :price)]]]
                         :order-by    [[:asc {} [:aggregation {} (=?/same :uuid)]]]}]}
              (qp.preprocess/preprocess query))))))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !                                                                                                                   !
;; !                    tests for named aggregations can be found in `expression-aggregations-test`                    !
;; !                                                                                                                   !
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

(deftest ^:parallel min-max-non-numeric-test
  (mt/test-drivers (mt/normal-drivers)
    (let [mp (mt/metadata-provider)]
      (testing "min/max over a Text column return the lexical extremes (#18207, #22155)"
        (let [category (lib.metadata/field mp (mt/id :products :category))
              query    (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/min category))
                           (lib/aggregate (lib/max category)))]
          (is (= [["Doohickey" "Widget"]]
                 (mt/formatted-rows [str str] (qp/process-query query))))))
      (testing "min/max over a temporal column return temporal values (#4482)"
        (let [created-at (lib.metadata/field mp (mt/id :orders :created_at))
              query      (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                             (lib/aggregate (lib/min created-at))
                             (lib/aggregate (lib/max created-at)))
              row        (first (mt/rows (qp/process-query query)))]
          (is (= 2 (count row)))
          (is (every? some? row)))))))

(deftest ^:parallel count-with-field-arg-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "count with a field argument counts only non-null values of that field (#13814)"
      ;; orders.discount is NULL for most rows, so count(discount) must skip the NULLs: it equals
      ;; the non-null count and is strictly less than count(*). A regression to COUNT(*) fails both.
      (let [mp                (mt/metadata-provider)
            orders            (lib.metadata/table mp (mt/id :orders))
            discount          (lib.metadata/field mp (mt/id :orders :discount))
            [total cnt-field] (->> (-> (lib/query mp orders)
                                       (lib/aggregate (lib/count))
                                       (lib/aggregate (lib/count discount)))
                                   qp/process-query
                                   (mt/formatted-rows [int int]) first)
            non-null          (->> (-> (lib/query mp orders)
                                       (lib/filter (lib/not-null discount))
                                       (lib/aggregate (lib/count)))
                                   qp/process-query
                                   (mt/formatted-rows [int]) ffirst)]
        (is (= non-null cnt-field))
        (is (< cnt-field total))))))

(deftest ^:parallel distinct-case-with-breakout-and-expression-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Distinct(case(...)) with a breakout and an extra custom column executes without error (#17512)"
      (let [mp         (mt/metadata-provider)
            orders     (lib.metadata/table mp (mt/id :orders))
            discount   (lib.metadata/field mp (mt/id :orders :discount))
            subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))
            total      (lib.metadata/field mp (mt/id :orders :total))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            result     (-> (lib/query mp orders)
                           (lib/expression "CC" (lib/+ 1 1))
                           (lib/aggregate (lib/distinct (lib/case [[(lib/> discount 0) subtotal]] total)))
                           (lib/breakout (lib/with-temporal-bucket created-at :month))
                           qp/process-query)]
        (is (=? {:status :completed} result))
        ;; coerce the count column via formatted-rows so pos-int? holds for drivers that return it as BigDecimal
        (let [rows (mt/formatted-rows [str int] result)]
          (is (seq rows))
          (testing "each breakout row carries a positive distinct count"
            (is (every? (fn [[_month cnt]] (pos-int? cnt)) rows))))))))

(deftest ^:parallel num-bins-width-uses-filtered-range-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "a num-bins binned breakout derives its bin width from the FILTERED range, not the full range (#42942)"
      (let [mp     (mt/metadata-provider)
            orders (lib.metadata/table mp (mt/id :orders))
            total  (lib.metadata/field mp (mt/id :orders :total))]
        (letfn [(bin-width [min-total]
                  (let [edges (->> (-> (lib/query mp orders)
                                       (lib/filter (lib/>= total min-total))
                                       (lib/breakout (lib/with-binning total {:strategy :num-bins, :num-bins 100}))
                                       (lib/aggregate (lib/count))
                                       qp/process-query
                                       mt/rows)
                                   (map (comp double first))
                                   sort)]
                    (apply min (map - (rest edges) edges))))]
          ;; a filter that narrows the range to a smaller window must yield a finer bin width
          (is (< (bin-width 150) (bin-width 90))))))))

(deftest ^:parallel nested-median-over-expression-and-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :percentile-aggregations :nested-queries :expressions)
    (testing "Median over a custom column, then a second stage taking Median of that median"
      (let [mp       (mt/metadata-provider)
            price    (lib.metadata/field mp (mt/id :products :price))
            category (lib.metadata/field mp (mt/id :products :category))
            q1       (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/expression "Mega" (lib/* price 10))
                         (as-> $ (lib/aggregate $ (lib/median (lib/expression-ref $ "Mega"))))
                         (lib/breakout category)
                         lib/append-stage)
            ;; Reference the stage-1 median aggregation column by its display name. Matching the wrong column here
            ;; (e.g. the non-existent "Mega") yields `(lib/median nil)` -> `MEDIAN(NULL)`, which returns NULL on H2
            ;; and errors on Oracle/Redshift/SQL Server. The real median column keeps the aggregation numeric.
            mega-col (m/find-first (comp #{"Median of Mega"} :display-name) (lib/aggregable-columns q1 nil))
            _        (assert (some? mega-col))
            q2       (lib/aggregate q1 (lib/median mega-col))
            rows     (mt/rows (qp/process-query q2))]
        (is (= 1 (count rows)))
        ;; a real median-of-medians value (not a NULL artifact from a mis-resolved column ref)
        (is (number? (ffirst rows)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Measure Edge Cases                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- orders-measure-provider
  "Metadata provider that exposes `definition` as measure 1 on the orders table."
  [mp definition]
  (lib.tu/mock-metadata-provider
   mp
   {:measures [{:id         1
                :name       "the measure"
                :table-id   (mt/id :orders)
                :definition definition}]}))

(deftest ^:parallel measure-with-offset-test
  (testing "a measure whose definition uses an offset() window executes like the equivalent inline aggregation"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp          (mt/metadata-provider)
            total       (lib.metadata/field mp (mt/id :orders :total))
            created-at  (lib.metadata/field mp (mt/id :orders :created_at))
            definition  (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                            (lib/aggregate (lib/offset (lib/sum total) -1)))
            mp          (orders-measure-provider mp definition)
            measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/aggregate (lib.metadata/measure mp 1))
                              (lib/breakout (lib/with-temporal-bucket created-at :month)))
            direct-query  (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/aggregate (lib/offset (lib/sum total) -1))
                              (lib/breakout (lib/with-temporal-bucket created-at :month)))]
        ;; round the numeric column: Presto's distributed SUM is ULP-nondeterministic across the two runs
        (is (= (mt/formatted-rows [str 2.0] (qp/process-query direct-query))
               (mt/formatted-rows [str 2.0] (qp/process-query measure-query))))))))

(deftest ^:parallel measure-with-implicit-join-column-test
  (testing "a measure aggregating an implicit-join column executes like the equivalent inline aggregation"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (let [mp         (mt/metadata-provider)
            orders-q   (lib/query mp (lib.metadata/table mp (mt/id :orders)))
            rating     (m/find-first (comp #{(mt/id :products :rating)} :id)
                                     (lib/visible-columns orders-q))
            _          (assert (some? rating))
            definition (lib/aggregate orders-q (lib/sum rating))
            mp         (orders-measure-provider mp definition)
            measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/aggregate (lib.metadata/measure mp 1)))
            direct-query  (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/aggregate (lib/sum rating)))]
        ;; round the numeric column: Presto's distributed SUM is ULP-nondeterministic across the two runs
        (is (= (mt/formatted-rows [2.0] (qp/process-query direct-query))
               (mt/formatted-rows [2.0] (qp/process-query measure-query))))))))

(deftest ^:parallel offset-of-measure-test
  (testing "wrapping a measure ref in offset() executes like the equivalent inline offset aggregation"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp         (mt/metadata-provider)
            total      (lib.metadata/field mp (mt/id :orders :total))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            definition (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/sum total)))
            mp         (orders-measure-provider mp definition)
            measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/aggregate (lib/offset (lib.metadata/measure mp 1) -1))
                              (lib/breakout (lib/with-temporal-bucket created-at :month)))
            direct-query  (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/aggregate (lib/offset (lib/sum total) -1))
                              (lib/breakout (lib/with-temporal-bucket created-at :month)))]
        ;; round the numeric column: Presto's distributed SUM is ULP-nondeterministic across the two runs
        (is (= (mt/formatted-rows [str 2.0] (qp/process-query direct-query))
               (mt/formatted-rows [str 2.0] (qp/process-query measure-query))))))))
