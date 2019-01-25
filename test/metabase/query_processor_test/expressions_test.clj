(ns metabase.query-processor-test.expressions-test
  "Tests for expressions (calculated columns)."
  (:require [metabase
             [driver :as driver]
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;; Do a basic query including an expression
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[1 "Red Medicine"                 4  10.0646 -165.374 3 5.0]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2 4.0]
   [3 "The Apple Pan"                11 34.0406 -118.428 2 4.0]
   [4 "Wurstküche"                   29 33.9997 -118.465 2 4.0]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2 4.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-mbql-query venues
            {:expressions {:my-cool-new-field [:+ $price 2]}
             :limit       5
             :order-by    [[:asc $id]]}))))

;; Make sure FLOATING POINT division is done
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 1.5]     ; 3 / 2 SHOULD BE 1.5, NOT 1 (!)
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-mbql-query venues
            {:expressions {:my-cool-new-field [:/ $price 2]}
             :limit       3
             :order-by    [[:asc $id]]}))))

;; Can we do NESTED EXPRESSIONS ?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 3.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 2.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-mbql-query venues
            {:expressions {:wow [:- [:* $price 2] [:+ $price 0]]}
             :limit       3
             :order-by    [[:asc $id]]}))))

;; Can we have MULTIPLE EXPRESSIONS?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 2.0 4.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0 3.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0 3.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float float]
    (rows (data/run-mbql-query venues
            {:expressions {:x [:- $price 1]
                           :y [:+ $price 1]}
             :limit       3
             :order-by    [[:asc $id]]}))))

;; Can we refer to expressions inside a FIELDS clause?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[4] [4] [5]]
  (format-rows-by [int]
    (rows (data/run-mbql-query venues
            {:expressions {:x [:+ $price $id]}
             :fields      [[:expression :x]]
             :limit       3
             :order-by    [[:asc $id]]}))))

;; Can we refer to expressions inside an ORDER BY clause?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[100 "Mohawk Bend"         46 34.0777 -118.265 2 102.0]
   [99  "Golden Road Brewing" 10 34.1505 -118.274 2 101.0]
   [98  "Lucky Baldwin's Pub"  7 34.1454 -118.149 2 100.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-mbql-query venues
            {:expressions {:x [:+ $price $id]}
             :limit       3
             :order-by    [[:desc [:expression :x]]]}))))

;; Can we AGGREGATE + BREAKOUT by an EXPRESSION?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[2 22] [4 59] [6 13] [8 6]]
  (format-rows-by [int int]
    (rows (data/run-mbql-query venues
            {:expressions {:x [:* $price 2.0]}
             :aggregation [[:count]]
             :breakout    [[:expression :x]]}))))

;; Custom aggregation expressions should include their type
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  (conj #{{:name "x" :base_type :type/Float}}
        {:name      (data/format-name "category_id")
         :base_type (case driver/*driver*
                      :oracle    :type/Decimal
                      :snowflake :type/Number
                      :type/Integer)})
  (set (map #(select-keys % [:name :base_type])
            (-> (data/run-mbql-query venues
                  {:aggregation [:named [:sum [:* $price -1]] "x"]
                   :breakout    [$category_id]})
                (get-in [:data :cols])))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           HANDLING NULLS AND ZEROES                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; "bird scarcity" is a scientific metric based on the number of birds seen in a given day
;; (at least for the purposes of the tests below)
;;
;; e.g. scarcity = 100.0 / num-birds
(defmacro ^:private calculate-bird-scarcity [formula & [filter-clause]]
  `(data/dataset ~'daily-bird-counts
     (->> (data/run-mbql-query ~'bird-count
            {:expressions {"bird-scarcity" ~formula}
             :fields      [[:expression "bird-scarcity"]]
             :filter      ~filter-clause
             :order-by    [[:asc [:field-id $date]]]
             :limit       10})
          rows
          (format-rows-by [(partial u/round-to-decimals 2)]))))

;; hey... expressions should work if they are just a Field! (Also, this lets us take a peek at the raw values being
;; used to calculate the formulas below, so we can tell at a glance if they're right without referring to the EDN def)
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
  (calculate-bird-scarcity [:field-id $count]))

;; do expressions automatically handle division by zero? Should return `nil` in the results for places where that was
;; attempted
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [9.09] [7.14]]
  (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]
                           [:!= $count nil]))

;; do expressions handle division by `nil`? Should return `nil` in the results for places where that was attempted
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [10.0] [12.5] [20.0] [20.0] [nil] [9.09] [7.14] [12.5] [7.14]]
  (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]
                           [:or
                            [:= $count nil]
                            [:!= $count 0]]))

;; can we handle BOTH NULLS AND ZEROES AT THE SAME TIME????
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [nil]]
  (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]))

;; ok, what if we use multiple args to divide, and more than one is zero?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [nil] [nil] [1.0] [1.56] [4.0] [4.0] [nil] [nil] [nil]]
  (calculate-bird-scarcity [:/ 100.0 [:field-id $count] [:field-id $count]]))

;; are nulls/zeroes still handled appropriately when nested inside other expressions?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [nil] [nil] [20.0] [25.0] [40.0] [40.0] [nil] [nil] [nil]]
  (calculate-bird-scarcity [:* [:/ 100.0 [:field-id $count]] 2]))

;; if a zero is present in the NUMERATOR we should return ZERO and not NULL
;; (`0 / 10 = 0`; `10 / 0 = NULL`, at least as far as MBQL is concerned)
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
 [[nil] [0.0] [0.0] [1.0] [0.8] [0.5] [0.5] [nil] [0.0] [0.0]]
 (calculate-bird-scarcity [:/ [:field-id $count] 10]))

;; can addition handle nulls & zeroes?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [10.0] [10.0] [20.0] [18.0] [15.0] [15.0] [nil] [10.0] [10.0]]
  (calculate-bird-scarcity [:+ [:field-id $count] 10]))

;; can subtraction handle nulls & zeroes?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [10.0] [10.0] [0.0] [2.0] [5.0] [5.0] [nil] [10.0] [10.0]]
  (calculate-bird-scarcity [:- 10 [:field-id $count]]))

;; can multiplications handle nulls & zeros?
(datasets/expect-with-drivers (non-timeseries-drivers-with-feature :expressions)
  [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
  (calculate-bird-scarcity [:* 1 [:field-id $count]]))
