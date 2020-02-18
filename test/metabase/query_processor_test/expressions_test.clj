(ns metabase.query-processor-test.expressions-test
  "Tests for expressions (calculated columns)."
  (:require [clj-time.core :as time]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.util.date-2 :as u.date]))

;; Do a basic query including an expression
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expressions)
  [[1 "Red Medicine"                 4  10.0646 -165.374 3 5.0]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2 4.0]
   [3 "The Apple Pan"                11 34.0406 -118.428 2 4.0]
   [4 "Wurstküche"                   29 33.9997 -118.465 2 4.0]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2 4.0]]
  (mt/formatted-rows [int str int 4.0 4.0 int float]
    (mt/run-mbql-query venues
      {:expressions {:my-cool-new-field [:+ $price 2]}
       :limit       5
       :order-by    [[:asc $id]]})))

(deftest floating-point-division-test
  (datasets/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3 1.5] ; 3 / 2 SHOULD BE 1.5, NOT 1 (!)
            [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0]
            [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0]]
           (mt/formatted-rows [int str int 4.0 4.0 int float]
             (mt/run-mbql-query venues
               {:expressions {:my-cool-new-field [:/ $price 2]}
                :limit       3
                :order-by    [[:asc $id]]})))
        "Make sure FLOATING POINT division is done")))

;; Make sure FLOATING POINT division is done when dividing by expressions/fields
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expressions)
  [[0.6]
   [0.5]
   [0.5]]
  (mt/formatted-rows [1.0]
    (mt/run-mbql-query venues
      {:expressions {:big-price         [:+ $price 2]
                     :my-cool-new-field [:/ $price [:expression "big-price"]]}
       :fields      [[:expression "my-cool-new-field"]]
       :limit       3
       :order-by    [[:asc $id]]})))

;; Can we do NESTED EXPRESSIONS ?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 3.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 2.0]]
  (mt/formatted-rows [int str int 4.0 4.0 int float]
    (mt/run-mbql-query venues
      {:expressions {:wow [:- [:* $price 2] [:+ $price 0]]}
       :limit       3
       :order-by    [[:asc $id]]})))

;; Can we have MULTIPLE EXPRESSIONS?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 2.0 4.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0 3.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0 3.0]]
  (mt/formatted-rows [int str int 4.0 4.0 int float float]
    (mt/run-mbql-query venues
      {:expressions {:x [:- $price 1]
                     :y [:+ $price 1]}
       :limit       3
       :order-by    [[:asc $id]]})))

;; Can we refer to expressions inside a FIELDS clause?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expressions)
  [[4] [4] [5]]
  (mt/formatted-rows [int]
    (mt/run-mbql-query venues
      {:expressions {:x [:+ $price $id]}
       :fields      [[:expression :x]]
       :limit       3
       :order-by    [[:asc $id]]})))

;; Can we refer to expressions inside an ORDER BY clause?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expressions)
  [[100 "Mohawk Bend"         46 34.0777 -118.265 2 102.0]
   [99  "Golden Road Brewing" 10 34.1505 -118.274 2 101.0]
   [98  "Lucky Baldwin's Pub"  7 34.1454 -118.149 2 100.0]]
  (mt/formatted-rows [int str int 4.0 4.0 int float]
    (mt/run-mbql-query venues
      {:expressions {:x [:+ $price $id]}
       :limit       3
       :order-by    [[:desc [:expression :x]]]})))

;; Can we AGGREGATE + BREAKOUT by an EXPRESSION?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expressions)
  [[2 22] [4 59] [6 13] [8 6]]
  (mt/formatted-rows [int int]
    (mt/run-mbql-query venues
      {:expressions {:x [:* $price 2.0]}
       :aggregation [[:count]]
       :breakout    [[:expression :x]]})))

(deftest expressions-should-include-type-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Custom aggregation expressions should include their type"
      (is (= (conj #{{:name "x" :base_type (:base_type (qp.test/aggregate-col :sum :venues :price))}}
                   {:name      (data/format-name "category_id")
                    :base_type (:base_type (qp.test/breakout-col :venues :category_id))})
             (set (map #(select-keys % [:name :base_type])
                       (qp.test/cols
                         (mt/run-mbql-query venues
                           {:aggregation [[:aggregation-options [:sum [:* $price -1]] {:name "x"}]]
                            :breakout    [$category_id]})))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           HANDLING NULLS AND ZEROES                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; "bird scarcity" is a scientific metric based on the number of birds seen in a given day
;; (at least for the purposes of the tests below)
;;
;; e.g. scarcity = 100.0 / num-birds
(defn- calculate-bird-scarcity* [formula filter-clause]
  (mt/formatted-rows [2.0]
    (data/dataset daily-bird-counts
      (mt/run-mbql-query bird-count
        {:expressions {"bird-scarcity" formula}
         :fields      [[:expression "bird-scarcity"]]
         :filter      filter-clause
         :order-by    [[:asc $date]]
         :limit       10}))))

(defmacro ^:private calculate-bird-scarcity [formula & [filter-clause]]
  `(data/dataset ~'daily-bird-counts
     (data/$ids ~'bird-count
       (calculate-bird-scarcity* ~formula ~filter-clause))))

(deftest nulls-and-zeroes-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing (str "hey... expressions should work if they are just a Field! (Also, this lets us take a peek at the "
                  "raw values being used to calculate the formulas below, so we can tell at a glance if they're right "
                  "without referring to the EDN def)")
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:field-id $count]))))


    (testing (str "do expressions automatically handle division by zero? Should return `nil` in the results for places "
                  "where that was attempted")
      (is (= [[nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [9.09] [7.14]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]
                                      [:!= $count nil]))))


    (testing (str "do expressions handle division by `nil`? Should return `nil` in the results for places where that "
                  "was attempted")
      (is (= [[nil] [10.0] [12.5] [20.0] [20.0] [nil] [9.09] [7.14] [12.5] [7.14]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]
                                      [:or
                                       [:= $count nil]
                                       [:!= $count 0]]))))

    (testing "can we handle BOTH NULLS AND ZEROES AT THE SAME TIME????"
      (is (= [[nil] [nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]))))

    (testing "ok, what if we use multiple args to divide, and more than one is zero?"
      (is (= [[nil] [nil] [nil] [1.0] [1.56] [4.0] [4.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count] [:field-id $count]]))))

    (testing "are nulls/zeroes still handled appropriately when nested inside other expressions?"
      (is (= [[nil] [nil] [nil] [20.0] [25.0] [40.0] [40.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:* [:/ 100.0 [:field-id $count]] 2]))))

    (testing (str "if a zero is present in the NUMERATOR we should return ZERO and not NULL "
                  "(`0 / 10 = 0`; `10 / 0 = NULL`, at least as far as MBQL is concerned)")
      (is (= [[nil] [0.0] [0.0] [1.0] [0.8] [0.5] [0.5] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:/ [:field-id $count] 10]))))

    (testing "can addition handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [20.0] [18.0] [15.0] [15.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:+ [:field-id $count] 10]))))

    (testing "can subtraction handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [0.0] [2.0] [5.0] [5.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:- 10 [:field-id $count]]))))


    (testing "can multiplications handle nulls & zeros?"
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:* 1 [:field-id $count]]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      DATETIME EXTRACTION AND MANIPULATION                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^org.joda.time.DateTimeZone utc-tz (time/time-zone-for-id "UTC"))

(defn- maybe-truncate
  [dt]
  (if (= :sqlite driver/*driver*)
    (u.date/truncate dt :day)
    dt))

(defn- robust-dates
  [strs]
  ;; TIMEZONE FIXME — SQLite shouldn't return strings. And for whatever weird reason it's truncating to date as well?
  (let [format-fn (if (= driver/*driver* :sqlite)
                    #(u.date/format-sql (t/local-date-time (t/local-date %) (t/local-time 0)))
                    u.date/format)]
    (for [s strs]
      [(format-fn (u.date/parse s "UTC"))])))

(deftest temporal-arithmetic-test
  (datasets/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Test that we can do datetime arithemtics using MBQL `:interval` clause in expressions"
      (is (= (robust-dates
              ["2014-09-02T13:45:00"
               "2014-07-02T09:30:00"
               "2014-07-01T10:30:00"])
             (tu/with-temporary-setting-values [report-timezone "UTC"]
               (-> (mt/run-mbql-query users
                     {:expressions {:prev_month [:+ $last_login [:interval -31 :day]]}
                      :fields      [[:expression :prev_month]]
                      :limit       3
                      :order-by    [[:asc $name]]})
                   mt/rows)))))
    (testing "Test interaction of datetime arithmetics with truncation"
      (is (= (robust-dates
              ["2014-09-02T00:00:00"
               "2014-07-02T00:00:00"
               "2014-07-01T00:00:00"])
             (tu/with-temporary-setting-values [report-timezone "UTC"]
               (-> (mt/run-mbql-query users
                     {:expressions {:prev_month [:+ [:datetime-field $last_login :day] [:interval -31 :day]]}
                      :fields      [[:expression :prev_month]]
                      :limit       3
                      :order-by    [[:asc $name]]})
                   mt/rows)))))))
