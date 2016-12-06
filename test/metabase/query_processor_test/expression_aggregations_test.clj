(ns metabase.query-processor-test.expression-aggregations-test
  "Tests for expression aggregations."
  (:require [expectations :refer :all]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets, :refer [*engine*]]
            [metabase.util :as u]))

;; sum, *
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1 1211]
   [2 5710]
   [3 1845]
   [4 1476]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/sum (ql/* $id $price)))
            (ql/breakout $price)))))

;; min, +
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1 10]
   [2  4]
   [3  4]
   [4 20]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/min (ql/+ $id $price)))
            (ql/breakout $price)))))

;; max, /
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1 94]
   [2 50]
   [3 26]
   [4 20]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/max (ql// $id $price)))
            (ql/breakout $price)))))

;; avg, -
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  (if (= *engine* :h2)
    [[1  55]
     [2  97]
     [3 142]
     [4 246]]
    [[1  55]
     [2  96]
     [3 141]
     [4 246]])
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/avg (ql/* $id $price)))
            (ql/breakout $price)))))

;; post-aggregation math w/ 2 args: count + sum
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1  44]
   [2 177]
   [3  52]
   [4  30]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/sum $price)))
            (ql/breakout $price)))))

;; post-aggregation math w/ 3 args: count + sum + count
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1  66]
   [2 236]
   [3  65]
   [4  36]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/sum $price)
                                  (ql/count $price)))
            (ql/breakout $price)))))

;; post-aggregation math w/ a constant: count * 10
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1 220]
   [2 590]
   [3 130]
   [4  60]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/* (ql/count $id)
                                  10))
            (ql/breakout $price)))))

;; nested post-aggregation math: count + (count * sum)
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1  506]
   [2 7021]
   [3  520]
   [4  150]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/* (ql/count $id)
                                        (ql/sum $price))))
            (ql/breakout $price)))))

;; post-aggregation math w/ avg: count + avg
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  (if (= *engine* :h2)
    [[1  77]
     [2 107]
     [3  60]
     [4  68]]
    [[1  77]
     [2 107]
     [3  60]
     [4  67]])
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/count $id)
                                  (ql/avg $id)))
            (ql/breakout $price)))))

;; post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1 -92]
   [2 -96]
   [3 -74]
   [4 -73]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ (ql/max $price)
                                  (ql/min (ql/- $price $id))))
            (ql/breakout $price)))))

;; aggregation w/o field
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1 23]
   [2 60]
   [3 14]
   [4  7]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/+ 1 (ql/count)))
            (ql/breakout $price)))))

;; aggregation with math inside the aggregation :scream_cat:
(datasets/expect-with-engines (engines-that-support :expression-aggregations)
  [[1  44]
   [2 177]
   [3  52]
   [4  30]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/sum (ql/+ $price 1)))
            (ql/breakout $price)))))
