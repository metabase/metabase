(ns metabase.query-processor-test.page-test
  "Tests for the `:page` clause."
  (:require [expectations :refer :all]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer :all]
            [metabase.test.data :as data]
            [metabase.util :as u]))

;; Test that we can get "pages" of results.

;; get the first page
(expect-with-non-timeseries-dbs
  [[1 "African"]
   [2 "American"]
   [3 "Artisan"]
   [4 "Asian"]
   [5 "BBQ"]]
  (->> (data/run-query categories
         (ql/page {:page 1, :items 5})
         (ql/order-by (ql/asc $id)))
       rows (format-rows-by [int str])))

;; get the second page
(expect-with-non-timeseries-dbs
  [[ 6 "Bakery"]
   [ 7 "Bar"]
   [ 8 "Beer Garden"]
   [ 9 "Breakfast / Brunch"]
   [10 "Brewery"]]
  (->> (data/run-query categories
         (ql/page {:page 2, :items 5})
         (ql/order-by (ql/asc $id)))
       rows (format-rows-by [int str])))
