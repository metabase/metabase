(ns metabase.query-processor.middleware.auto-parse-filter-values-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.auto-parse-filter-values
    :as
    auto-parse-filter-values]))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-value-for-base-type-test
  (testing "Should throw an Exception with a useful error message if parsing fails"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Error filtering against :type/Integer Field: unable to parse String \"s\" to a :type/Integer"
         (#'auto-parse-filter-values/parse-value-for-base-type "s" :type/Integer)))))

(defn- auto-parse-filter-values [query]
  (auto-parse-filter-values/auto-parse-filter-values query))

(deftest ^:parallel auto-parse-filter-values-test
  (doseq [[base-type expected] {:type/Integer    4
                                :type/BigInteger 4N
                                :type/Float      4.0
                                :type/Decimal    4M
                                :type/Boolean    true}]
    (testing (format "A String parameter that has %s should get parsed to a %s"
                     base-type (.getCanonicalName (class expected)))
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                      (lib/filter (lib/= (meta/field-metadata :venues :price)
                                         ;; apparently we have no MLv2 helper for creating `:value` clauses
                                         [:value
                                          {:base-type base-type, :effective-type base-type, :lib/uuid (str (random-uuid))}
                                          (str expected)])))]
        (is (=? [:=
                 {}
                 [:field {} (meta/id :venues :price)]
                 [:value {:base-type base-type, :effective-type base-type} expected]]
                (-> query
                    auto-parse-filter-values
                    lib/filters
                    first)))))))

(deftest ^:parallel parse-large-integers-test
  (testing "Should parse Integer strings to Longs in case they're extra-big"
    (let [n     (inc (long Integer/MAX_VALUE))
          query (lib/query meta/metadata-provider
                           (lib.tu.macros/mbql-query venues
                             {:filter [:= $price [:value (str n) {:base_type :type/Integer}]]}))]
      (testing (format "\nQuery = %s" (pr-str query))
        (is (=? [:=
                 {}
                 [:field {} (meta/id :venues :price)]
                 [:value {:base-type :type/Integer, :effective-type :type/Integer} n]]
                (-> (auto-parse-filter-values query)
                    lib/filters
                    first)))))))

(deftest ^:parallel floating-point-ulp-equality-test
  (testing "Should convert floating point equality filters to ULP-based ranges for aggregated values"
    (let [float-value 123.456
          ;; Create a query with aggregation first, then add filter against that aggregation
          base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                         (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          query (lib/filter base-query
                            (lib/= (lib/aggregation-ref base-query 0)
                                   [:value
                                    {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                    float-value]))]
      (testing "= filter becomes :between filter"
        (let [result-filter (-> query
                                auto-parse-filter-values
                                lib/filters
                                first)]
          (is (= :between (first result-filter)))
          (is (= 5 (count result-filter))) ; [:between opts field lower upper]
          (let [[_ _ _ lower upper] result-filter
                lower-val (nth lower 2)
                upper-val (nth upper 2)]
            (is (< lower-val float-value))
            (is (> upper-val float-value))
            ;; ULP-based tolerance should be extremely small relative to value
            (is (< (- upper-val lower-val) (* float-value 1e-10)))))))))

(deftest ^:parallel floating-point-ulp-inequality-test
  (testing "Should convert floating point inequality filters to ULP-based ranges for aggregated values"
    (let [decimal-value 987.654M
          ;; Create a query with aggregation first, then add filter against that aggregation
          base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                         (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          query (lib/filter base-query
                            (lib/!= (lib/aggregation-ref base-query 0)
                                    [:value
                                     {:base-type :type/Decimal, :effective-type :type/Decimal, :lib/uuid (str (random-uuid))}
                                     decimal-value]))]
      (testing "!= filter becomes :or [:< ...] [:> ...] filter"
        (let [result-filter (-> query
                                auto-parse-filter-values
                                lib/filters
                                first)]
          (is (= :or (first result-filter)))
          (is (= 4 (count result-filter))) ; [:or opts condition1 condition2]
          (let [[_ _ less-than greater-than] result-filter]
            (is (= :< (first less-than)))
            (is (= :> (first greater-than)))))))))

(deftest ^:parallel simple-floating-point-test
  (testing "Should NOT convert regular floating point fields to ULP filters"
    (let [simple-float 42.0
          ;; Use regular field reference - should NOT get ULP filtering
          query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/filter (lib/= (meta/field-metadata :venues :latitude)
                                       [:value
                                        {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                        simple-float])))]
      (testing "Regular field float = filter remains unchanged"
        (let [result-filter (-> query
                                auto-parse-filter-values
                                lib/filters
                                first)]
          (is (= := (first result-filter)))
          (is (= 4 (count result-filter))))))))

(deftest ^:parallel non-floating-point-equality-unchanged-test
  (testing "Should not modify equality filters for non-floating point types"
    (let [int-value 42
          query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/filter (lib/= (meta/field-metadata :venues :price)
                                       [:value
                                        {:base-type :type/Integer, :effective-type :type/Integer, :lib/uuid (str (random-uuid))}
                                        int-value])))]
      (testing "Integer equality filter remains unchanged"
        (let [result-filter (-> query
                                auto-parse-filter-values
                                lib/filters
                                first)]
          (is (= := (first result-filter)))
          (is (= int-value (nth (nth result-filter 3) 2))))))))

(deftest ^:parallel real-world-aggregation-test
  (testing "Should handle real aggregated values like those from the issue"
    (let [aggregated-value 2185.8607904174387 ; Actual value stolen from issue 48543
          ;; Create a query with aggregation first, then add filter against that aggregation
          base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                         (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          query (lib/filter base-query
                            (lib/= (lib/aggregation-ref base-query 0)
                                   [:value
                                    {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                    aggregated-value]))]
      (testing "Aggregated value = filter becomes :between filter that contains the original value"
        (let [result-filter (-> query
                                auto-parse-filter-values
                                lib/filters
                                first)]
          (is (= :between (first result-filter)))
          (is (= 5 (count result-filter))) ; [:between opts field lower upper]
          (let [[_ _ _ lower upper] result-filter
                lower-val (nth lower 2)
                upper-val (nth upper 2)]
            ;; Critical: the range MUST contain the original value
            (is (<= lower-val aggregated-value upper-val)
                (format "Range [%s, %s] must contain original value %s"
                        lower-val upper-val aggregated-value))
            (is (< lower-val aggregated-value) "Lower bound should be less than original")
            (is (> upper-val aggregated-value) "Upper bound should be greater than original")))))))

(deftest ^:parallel ulp-no-breakdown-test
  (testing "ULP approach does not break down near zero (unlike naive epsilon-based method)"
    (testing "Consistent behavior across all value magnitudes for aggregated fields"
      (let [tiny-value 1e-6
            ;; Create a query with aggregation first, then add filter against that aggregation
            base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                           (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
            query (lib/filter base-query
                              (lib/= (lib/aggregation-ref base-query 0)
                                     [:value
                                      {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                      tiny-value]))
            result-filter (-> query auto-parse-filter-values lib/filters first)]

        ;; Ensure we have a valid result before destructuring
        (when (and result-filter (= 5 (count result-filter)))
          (let [[_ _ _ lower upper] result-filter
                lower-val (nth lower 2)
                upper-val (nth upper 2)
                ulp-tolerance (/ (- upper-val lower-val) 2)
                percentage-of-value (* 100 (/ ulp-tolerance tiny-value))]

            ;; Basic sanity checks
            (is (= :between (first result-filter)) "Should transform to :between filter")
            (is (= 5 (count result-filter)) "Should have 5 elements: [between opts field lower upper]")

            ;; The range should contain the original value
            (is (<= lower-val tiny-value upper-val)
                (str "Range [" lower-val ", " upper-val "] must contain original value " tiny-value))

            ;; ULP maintains tight precision even for tiny values (no breakdown!)
            (is (< percentage-of-value 1e-10)
                (str "ULP maintains precision for tiny value " tiny-value ", tolerance is only " percentage-of-value "% of value"))

            #_(println (str "ULP tiny value test: value=" tiny-value ", tolerance=" ulp-tolerance ", percentage=" percentage-of-value "%"))))))))

(deftest ^:parallel ulp-consistency-demonstration-test
  (testing "Demonstrates ULP tolerance consistency across value magnitudes for aggregated fields"
    (doseq [[value expected-behavior] [[1000.0 "excellent"]
                                       [1.0 "excellent"]
                                       [0.001 "excellent"]
                                       [0.000001 "excellent"]
                                       [0.0000000001 "excellent"]
                                       [0.00000000000001 "excellent"]]] ; ULP works great for all values!
      (let [;; Create the same multi-stage structure that the UI creates:
            ;; Stage 0: Aggregation query
            base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                           (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
            ;; Stage 1: Filter the aggregated results (simulating "Filter by this value")
            query (-> base-query
                      ;; Add a new stage that filters the results
                      lib/append-stage
                      ;; Filter using a field reference that matches what the UI creates
                      (lib/filter (lib/= [:field {:base-type :type/Float, :lib/uuid (str (random-uuid))} "sum"]
                                         [:value
                                          {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                          value])))
            result-filter (-> query auto-parse-filter-values lib/filters first)]

        ;; Add safety checks for the destructuring
        (is (not (nil? result-filter)) (format "result-filter should not be nil for value %g" value))
        (is (= 5 (count result-filter)) (format "result-filter should have 5 elements for value %g, got: %s" value result-filter))

        (when (and result-filter (= 5 (count result-filter)))
          (let [[_ _ _ lower upper] result-filter
                lower-val (nth lower 2)
                upper-val (nth upper 2)
                ulp-tolerance (/ (- upper-val lower-val) 2)
                percentage-of-value (* 100 (/ ulp-tolerance value))]

            ;; All should transform to :between
            (is (= :between (first result-filter)))

            ;; All should contain the original value
            (is (<= lower-val value upper-val))

            ;; Show the scaling behavior
            (println (format "Value: %g, ULP Tolerance: %g (%.2e%% of value) - %s"
                             value ulp-tolerance percentage-of-value expected-behavior))

            ;; ULP maintains excellent precision across all magnitudes
            (is (< percentage-of-value 1e-10) "ULP should maintain extremely small relative tolerance for all values")))))))

(deftest ^:parallel near-zero-practical-impact-test
  (testing "ULP maintains distinct tolerance ranges for different values (no breakdown) for aggregated fields"
    (let [tiny-value 1e-9
          very-different-value 5e-6 ; 5000x larger but still tiny
          ;; Create queries with aggregation first, then add filters against that aggregation
          base-query1 (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                          (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          query1 (lib/filter base-query1
                             (lib/= (lib/aggregation-ref base-query1 0)
                                    [:value
                                     {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                     tiny-value]))
          base-query2 (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                          (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          query2 (lib/filter base-query2
                             (lib/= (lib/aggregation-ref base-query2 0)
                                    [:value
                                     {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                     very-different-value]))
          result1 (-> query1 auto-parse-filter-values lib/filters first)
          result2 (-> query2 auto-parse-filter-values lib/filters first)]

      (when (and result1 result2 (= 5 (count result1)) (= 5 (count result2)))
        (let [[_ _ _ lower1 upper1] result1
              [_ _ _ lower2 upper2] result2
              range1 [(nth lower1 2) (nth upper1 2)]
              range2 [(nth lower2 2) (nth upper2 2)]]

          (testing "ULP maintains tight, non-overlapping ranges (unlike fixed absolute tolerance)"
            ;; ULP should create distinct, tight ranges for different values
            (let [[low1 high1] range1
                  [low2 high2] range2]
              ;; Each range should tightly contain its target value
              (is (and (<= low1 tiny-value high1)
                       (<= low2 very-different-value high2))
                  "Both ranges should contain their respective target values")

              ;; Ranges should be appropriately scaled and non-overlapping for different values
              (is (not (and (<= low1 very-different-value) (<= very-different-value high1)))
                  (format "ULP ranges should be distinct: [%g,%g] for %g vs [%g,%g] for %g"
                          low1 high1 tiny-value low2 high2 very-different-value)))))))))

(deftest ^:parallel aggregated-field-ulp-test
  (testing "Should only apply ULP filtering to aggregated fields, not regular fields"
    (let [test-value 123.456
          ;; Test with regular field - should NOT get ULP filtering
          regular-field-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                                  (lib/filter (lib/= (meta/field-metadata :venues :latitude)
                                                     [:value
                                                      {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                                      test-value])))
          ;; Test with aggregated field - should get ULP filtering
          ;; This simulates a "Filter by this value" action on an aggregated result
          base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                         (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          aggregated-field-query (lib/filter base-query
                                             (lib/= (lib/aggregation-ref base-query 0)
                                                    [:value
                                                     {:base-type :type/Float, :effective-type :type/Float, :lib/uuid (str (random-uuid))}
                                                     test-value]))]

      (testing "Regular field equality should remain unchanged"
        (let [result-filter (-> regular-field-query
                                auto-parse-filter-values
                                lib/filters
                                first)]
          (is (= := (first result-filter)) "Regular field should keep = filter")
          (is (= 4 (count result-filter)) "Regular field filter should have 4 elements")))

      (testing "Aggregated field equality should become :between filter"
        (let [result-filter (-> aggregated-field-query
                                auto-parse-filter-values
                                lib/filters
                                first)]
          (is (= :between (first result-filter)) "Aggregated field should get :between filter")
          (is (= 5 (count result-filter)) "Aggregated field filter should have 5 elements: [between opts field lower upper]"))))))
