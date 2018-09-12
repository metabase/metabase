(ns metabase.query-processor-test.expressions-test
  "Tests for expressions (calculated columns)."
  (:require [metabase
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;; Do a basic query including an expression
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
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
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 1.5]     ; 3 / 2 SHOULD BE 1.5, NOT 1 (!)
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-mbql-query venues
            {:expressions {:my-cool-new-field [:/ $price 2]}
             :limit       3
             :order-by    [[:asc $id]]}))))

;; Can we do NESTED EXPRESSIONS ?
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 3.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 2.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-mbql-query venues
            {:expressions {:wow [:- [:* $price 2] [:+ $price 0]]}
             :limit       3
             :order-by    [[:asc $id]]}))))

;; Can we have MULTIPLE EXPRESSIONS?
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
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
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
  [[4] [4] [5]]
  (format-rows-by [int]
    (rows (data/run-mbql-query venues
            {:expressions {:x [:+ $price $id]}
             :fields      [[:expression :x]]
             :limit       3
             :order-by    [[:asc $id]]}))))

;; Can we refer to expressions inside an ORDER BY clause?
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
  [[100 "Mohawk Bend"         46 34.0777 -118.265 2 102.0]
   [99  "Golden Road Brewing" 10 34.1505 -118.274 2 101.0]
   [98  "Lucky Baldwin's Pub"  7 34.1454 -118.149 2 100.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-mbql-query venues
            {:expressions {:x [:+ $price $id]}
             :limit       3
             :order-by    [[:desc [:expression :x]]]}))))

;; Can we AGGREGATE + BREAKOUT by an EXPRESSION?
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
  [[2 22] [4 59] [6 13] [8 6]]
  (format-rows-by [int int]
    (rows (data/run-mbql-query venues
            {:expressions {:x [:* $price 2.0]}
             :aggregation [[:count]]
             :breakout    [[:expression :x]]}))))

;; Custom aggregation expressions should include their type
(datasets/expect-with-engines (non-timeseries-engines-with-feature :expressions)
  (conj #{{:name "x" :base_type :type/Float}}
        (if (= datasets/*engine* :oracle)
          {:name (data/format-name "category_id") :base_type :type/Decimal}
          {:name (data/format-name "category_id") :base_type :type/Integer}))
  (set (map #(select-keys % [:name :base_type])
            (-> (data/run-mbql-query venues
                  {:aggregation [:named [:sum [:* $price -1]] "x"]
                   :breakout    [$category_id]})
                (get-in [:data :cols])))))
