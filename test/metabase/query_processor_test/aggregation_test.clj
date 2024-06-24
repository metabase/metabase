(ns metabase.query-processor-test.aggregation-test
  "Tests for MBQL aggregations."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.store :as qp.store]
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
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:limit 10, :order-by [[:asc $id]]})))))))

(deftest ^:parallel count-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "count aggregation"
      (is (= [[100]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]})))))))

(deftest ^:parallel sum-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "sum aggregation"
      (is (= [[203]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum $price]]})))))))

(deftest ^:parallel avg-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "avg aggregation"
      (is (= [[35.5059]]
             (mt/formatted-rows [4.0]
               (mt/run-mbql-query venues
                 {:aggregation [[:avg $latitude]]})))))))

(deftest ^:parallel distinct-count-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "distinct count aggregation"
      (is (= [[15]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query checkins
                 {:aggregation [[:distinct $user_id]]})))))))

(deftest ^:parallel standard-deviation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (testing "standard deviation aggregations"
      (let [query (mt/mbql-query venues {:aggregation [[:stddev $latitude]]})]
        (mt/with-native-query-testing-context query
          (is (= {:cols [(qp.test-util/aggregate-col :stddev :venues :latitude)]
                  :rows [[3.4]]}
                 (qp.test-util/rows-and-cols
                  (mt/format-rows-by [1.0]
                    (mt/process-query query))))))))))

(deftest ^:parallel standard-deviation-unsupported-test
  (mt/test-drivers (mt/normal-drivers-without-feature :standard-deviation-aggregations)
    (testing "Make sure standard deviations fail for drivers that don't support it"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"standard-deviation-aggregations is not supported by sqlite driver"
           (mt/run-mbql-query venues
             {:aggregation [[:stddev $latitude]]}))))))

;;; other advanced aggregation types are tested in [[metabase.query-processor-test.advanced-math-test]]


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIN & MAX                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel min-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [1]
           (mt/first-row
            (mt/format-rows-by [int]
              (mt/run-mbql-query venues
                {:aggregation [[:min $price]]})))))))

(deftest ^:parallel min-test-2
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[1 34.0071] [2 33.7701] [3 10.0646] [4 33.983]]
           (mt/formatted-rows [int 4.0]
             (mt/run-mbql-query venues
               {:aggregation [[:min $latitude]]
                :breakout    [$price]}))))))

(deftest ^:parallel max-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [4]
           (mt/first-row
             (mt/format-rows-by [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:max $price]]})))))))

(deftest ^:parallel max-test-2
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[1 37.8078] [2 40.7794] [3 40.7262] [4 40.7677]]
           (mt/formatted-rows [int 4.0]
             (mt/run-mbql-query venues
               {:aggregation [[:max $latitude]]
                :breakout    [$price]}))))))

(deftest ^:parallel multiple-aggregations-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "two aggregations"
      (is (= [[100 203]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count] [:sum $price]]})))))))

(deftest ^:parallel multiple-aggregations-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "three aggregations"
      (is (= [[2 100 203]]
             (mt/formatted-rows [int int int]
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
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      {:fields [{:id       (mt/id :venues :price)
                                                 :settings {:is_priceless false}}]})
      (let [results (mt/run-mbql-query venues
                      {:aggregation [[:sum $price]]})]
        (is (= (assoc (qp.test-util/aggregate-col :sum :venues :price)
                      :settings {:is_priceless false})
               (or (-> results mt/cols first)
                   results)))))))

(deftest ^:parallel semantic-type-for-aggregate-fields-test
  (testing "Does `:semantic-type` show up for aggregate Fields? (#38022)"
    (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum $id] [:sum $price]]})))))))

(deftest ^:parallel multiple-distinct-aggregations-test
  (testing "Multiple `:distinct` aggregations should work correctly (#13097)"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [[100 4]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:distinct $name]
                                [:distinct $price]]})))))))

(deftest ^:synchronized complex-distinct-aggregation-test
  (mt/test-drivers
   ;; TODO: This test was added in PR #44442 fixing issue  #35425. Enable this test for other drivers _while_ fixing
   ;;       the issue #14523.
   #_(mt/normal-drivers) #{:mongo}
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
                   (mt/formatted-rows [boolean int]
                     (mt/run-mbql-query places
                       {:breakout     [[:field %liked nil]]
                        :aggregation  [["count"]]})))))))
  (testing "Legacy breakout on boolean field with explicit type should work correctly (#34286)"
    (mt/dataset places-cam-likes
      (is (= {false 1, true 2}
             (into {}
                   (mt/formatted-rows [boolean int]
                     (mt/run-mbql-query places
                       {:breakout     [[:field %liked {:base-type :type/Boolean}]]
                        :aggregation  [["count"]]}))))))))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !                                                                                                                   !
;; !                    tests for named aggregations can be found in `expression-aggregations-test`                    !
;; !                                                                                                                   !
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
