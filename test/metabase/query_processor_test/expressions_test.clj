(ns metabase.query-processor-test.expressions-test
  "Tests for expressions (calculated columns)."
  (:require [expectations :refer :all]
            [metabase
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.query-processor
             [expand :as ql]
             [interface :as qpi]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;; Test the expansion of the expressions clause
(expect
  {:expressions {:my-cool-new-field (qpi/map->Expression {:operator :*
                                                          :args [{:field-id 10, :fk-field-id nil, :datetime-unit nil}
                                                                 20.0]})}}                                            ; 20 should be converted to a FLOAT
  (ql/expressions {} {:my-cool-new-field (ql/* (ql/field-id 10) 20)}))


;; Do a basic query including an expression
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"                 4  10.0646 -165.374 3 5.0]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2 4.0]
   [3 "The Apple Pan"                11 34.0406 -118.428 2 4.0]
   [4 "Wurstküche"                   29 33.9997 -118.465 2 4.0]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2 4.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-query venues
            (ql/expressions {:my-cool-new-field (ql/+ $price 2)})
            (ql/limit 5)
            (ql/order-by (ql/asc $id))))))

;; Make sure FLOATING POINT division is done
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 1.5]     ; 3 / 2 SHOULD BE 1.5, NOT 1 (!)
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-query venues
            (ql/expressions {:my-cool-new-field (ql// $price 2)})
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we do NESTED EXPRESSIONS ?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 3.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 2.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-query venues
            (ql/expressions {:wow (ql/- (ql/* $price 2) (ql/+ $price 0))})
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we have MULTIPLE EXPRESSIONS?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 2.0 4.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0 3.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0 3.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float float]
    (rows (data/run-query venues
            (ql/expressions {:x (ql/- $price 1)
                             :y (ql/+ $price 1)})
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we refer to expressions inside a FIELDS clause?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[4] [4] [5]]
  (format-rows-by [int]
    (rows (data/run-query venues
            (ql/expressions {:x (ql/+ $price $id)})
            (ql/fields (ql/expression :x))
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we refer to expressions inside an ORDER BY clause?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[100 "Mohawk Bend"         46 34.0777 -118.265 2 102.0]
   [99  "Golden Road Brewing" 10 34.1505 -118.274 2 101.0]
   [98  "Lucky Baldwin's Pub"  7 34.1454 -118.149 2 100.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-query venues
            (ql/expressions {:x (ql/+ $price $id)})
            (ql/limit 3)
            (ql/order-by (ql/desc (ql/expression :x)))))))

;; Can we AGGREGATE + BREAKOUT by an EXPRESSION?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[2 22] [4 59] [6 13] [8 6]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/expressions {:x (ql/* $price 2.0)})
            (ql/aggregation (ql/count))
            (ql/breakout (ql/expression :x))))))
