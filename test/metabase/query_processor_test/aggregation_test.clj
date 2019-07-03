(ns metabase.query-processor-test.aggregation-test
  "Tests for MBQL aggregations."
  (:require [expectations :refer [expect]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor-test :as qp.test]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]))

;; count aggregation
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[100]]
   :cols [(qp.test/aggregate-col :count)]}
  (qp.test/format-rows-by [int]
    (qp.test/rows-and-cols
      (data/run-mbql-query venues
        {:aggregation [[:count]]}))))


;; sum aggregation
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[203]]
   :cols [(qp.test/aggregate-col :sum :venues :price)]}
  (qp.test/format-rows-by [int]
    (qp.test/rows-and-cols
     (data/run-mbql-query venues
       {:aggregation [[:sum $price]]}))))


;; avg aggregation
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[35.5059]]
   :cols [(qp.test/aggregate-col :avg  :venues :latitude)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [4.0]
      (data/run-mbql-query venues
        {:aggregation [[:avg $latitude]]}))))


;; distinct count aggregation
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[15]]
   :cols [(qp.test/aggregate-col :distinct :checkins :user_id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int]
      (data/run-mbql-query checkins
        {:aggregation [[:distinct $user_id]]}))))

;; Test that no aggregation (formerly known as a 'rows' aggregation in MBQL '95) just returns rows as-is.
(qp.test/expect-with-non-timeseries-dbs
  [[ 1 "Red Medicine"                  4 10.0646 -165.374 3]
   [ 2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
   [ 3 "The Apple Pan"                11 34.0406 -118.428 2]
   [ 4 "Wurstküche"                   29 33.9997 -118.465 2]
   [ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 6 "The 101 Coffee Shop"          20 34.1054 -118.324 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [ 8 "25°"                          11 34.1015 -118.342 2]
   [ 9 "Krua Siri"                    71 34.1018 -118.301 1]
   [10 "Fred 62"                      20 34.1046 -118.292 2]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:limit    10
       :order-by [[:asc $id]]})))


;; standard deviation aggregations
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :standard-deviation-aggregations)
  {:cols [(qp.test/aggregate-col :stddev :venues :latitude)]
   :rows [[3.4]]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [1.0]
      (data/run-mbql-query venues {:aggregation [[:stddev $latitude]]}))))

;; Make sure standard deviation fails for the Mongo driver since its not supported
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-without-feature :standard-deviation-aggregations)
  {:status :failed
   :error  "standard-deviation-aggregations is not supported by this driver."}
  (select-keys (data/run-mbql-query venues
                 {:aggregation [[:stddev $latitude]]})
               [:status :error]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIN & MAX                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(qp.test/expect-with-non-timeseries-dbs
  [1]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:min $price]]}))))

(qp.test/expect-with-non-timeseries-dbs
  [4]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:max $price]]}))))

(qp.test/expect-with-non-timeseries-dbs
  [[1 34.0071] [2 33.7701] [3 10.0646] [4 33.983]]
  (qp.test/formatted-rows [int 4.0]
    (data/run-mbql-query venues
      {:aggregation [[:min $latitude]]
       :breakout    [$price]})))

(qp.test/expect-with-non-timeseries-dbs
  [[1 37.8078] [2 40.7794] [3 40.7262] [4 40.7677]]
  (qp.test/formatted-rows [int 4.0]
    (data/run-mbql-query venues
      {:aggregation [[:max $latitude]]
       :breakout    [$price]})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             MULTIPLE AGGREGATIONS                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; can we run a simple query with *two* aggregations?
(qp.test/expect-with-non-timeseries-dbs
  [[100 203]]
  (qp.test/formatted-rows [int int]
    (data/run-mbql-query venues
      {:aggregation [[:count] [:sum $price]]})))

;; how about with *three* aggregations?
(qp.test/expect-with-non-timeseries-dbs
  [[2 100 203]]
  (qp.test/formatted-rows [int int int]
    (data/run-mbql-query venues
      {:aggregation [[:avg $price] [:count] [:sum $price]]})))

;; make sure that multiple aggregations of the same type have the correct metadata (#4003)
;;
;; TODO - this isn't tested against Mongo because those driver doesn't currently work correctly with multiple columns
;; with the same name. It seems like it would be pretty easy to take the stuff we have for BigQuery and generalize it
;; so we can use it with Mongo
(datasets/expect-with-drivers (disj qp.test/non-timeseries-drivers :mongo)
  [(qp.test/aggregate-col :count)
   (assoc (qp.test/aggregate-col :count) :name "count_2", :field_ref [:aggregation 1])]
  (qp.test/cols
    (data/run-mbql-query venues
      {:aggregation [[:count] [:count]]})))


;;; ------------------------------------------------- CUMULATIVE SUM -------------------------------------------------

;;; cum_sum w/o breakout should be treated the same as sum
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[120]]
   :cols [(qp.test/aggregate-col :sum :users :id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int]
      (data/run-mbql-query users
        {:aggregation [[:cum-sum $id]]}))))


;;; Simple cumulative sum where breakout field is same as cum_sum field
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[ 1   1]
          [ 2   3]
          [ 3   6]
          [ 4  10]
          [ 5  15]
          [ 6  21]
          [ 7  28]
          [ 8  36]
          [ 9  45]
          [10  55]
          [11  66]
          [12  78]
          [13  91]
          [14 105]
          [15 120]]
   :cols [(qp.test/breakout-col :users :id)
          (qp.test/aggregate-col :sum :users :id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (data/run-mbql-query users
        {:aggregation [[:cum-sum $id]]
         :breakout    [$id]}))))


;;; Cumulative sum w/ a different breakout field
(qp.test/expect-with-non-timeseries-dbs
  {:rows [["Broen Olujimi"        14]
          ["Conchúr Tihomir"      21]
          ["Dwight Gresham"       34]
          ["Felipinho Asklepios"  36]
          ["Frans Hevel"          46]
          ["Kaneonuskatew Eiran"  49]
          ["Kfir Caj"             61]
          ["Nils Gotam"           70]
          ["Plato Yeshua"         71]
          ["Quentin Sören"        76]
          ["Rüstem Hebel"         91]
          ["Shad Ferdynand"       97]
          ["Simcha Yan"          101]
          ["Spiros Teofil"       112]
          ["Szymon Theutrich"    120]]
   :cols [(qp.test/breakout-col :users :name)
          (qp.test/aggregate-col :sum :users :id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [str int]
      (data/run-mbql-query users
        {:aggregation [[:cum-sum $id]]
         :breakout    [$name]}))))


;;; Cumulative sum w/ a different breakout field that requires grouping
(qp.test/expect-with-non-timeseries-dbs
  {:cols [(qp.test/breakout-col :venues :price)
          (qp.test/aggregate-col :sum :venues :id)]
   :rows [[1 1211]
          [2 4066]
          [3 4681]
          [4 5050]]}
  (qp.test/rows-and-cols
   (qp.test/format-rows-by [int int]
     (data/run-mbql-query venues
       {:aggregation [[:cum-sum $id]]
        :breakout    [$price]}))))


;;; ------------------------------------------------ CUMULATIVE COUNT ------------------------------------------------

;;; cum_count w/o breakout should be treated the same as count
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[15]]
   :cols [(qp.test/aggregate-col :cum-count :users :id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int]
      (data/run-mbql-query users
        {:aggregation [[:cum-count $id]]}))))

;;; Cumulative count w/ a different breakout field
(qp.test/expect-with-non-timeseries-dbs
  {:rows [["Broen Olujimi"        1]
          ["Conchúr Tihomir"      2]
          ["Dwight Gresham"       3]
          ["Felipinho Asklepios"  4]
          ["Frans Hevel"          5]
          ["Kaneonuskatew Eiran"  6]
          ["Kfir Caj"             7]
          ["Nils Gotam"           8]
          ["Plato Yeshua"         9]
          ["Quentin Sören"       10]
          ["Rüstem Hebel"        11]
          ["Shad Ferdynand"      12]
          ["Simcha Yan"          13]
          ["Spiros Teofil"       14]
          ["Szymon Theutrich"    15]]
   :cols [(qp.test/breakout-col :users :name)
          (qp.test/aggregate-col :cum-count :users :id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [str int]
      (data/run-mbql-query users
        {:aggregation [[:cum-count $id]]
         :breakout    [$name]}))))


;; Cumulative count w/ a different breakout field that requires grouping
(qp.test/expect-with-non-timeseries-dbs
  {:cols        [(qp.test/breakout-col :venues :price)
                 (qp.test/aggregate-col :cum-count :venues :id)]
   :rows        [[1 22]
                 [2 81]
                 [3 94]
                 [4 100]]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (data/run-mbql-query venues
        {:aggregation [[:cum-count $id]]
         :breakout    [$price]}))))

;; Does Field.settings show up for aggregate Fields?
(expect
  (assoc (qp.test/aggregate-col :sum :venues :price)
    :settings {:is_priceless false})
  (tu/with-temp-vals-in-db Field (data/id :venues :price) {:settings {:is_priceless false}}
    (let [results (data/run-mbql-query venues
                    {:aggregation [[:sum [:field-id $price]]]})]
      (or (-> results :data :cols first)
          results))))

;; Do we properly handle queries that have more than one of the same aggregation? (#5393)
(expect
  [[5050 203]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:sum $id] [:sum $price]]}))))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !                                                                                                                   !
;; !                    tests for named aggregations can be found in `expression-aggregations-test`                    !
;; !                                                                                                                   !
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
