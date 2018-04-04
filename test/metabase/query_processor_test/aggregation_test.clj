(ns metabase.query-processor-test.aggregation-test
  "Tests for MBQL aggregations."
  (:require [metabase
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util :as tu]))

;;; ---------------------------------------------- "COUNT" AGGREGATION -----------------------------------------------

(qp-expect-with-all-engines
    {:rows        [[100]]
     :columns     ["count"]
     :cols        [(aggregate-col :count)]
     :native_form true}
    (->> (data/run-query venues
           (ql/aggregation (ql/count)))
         booleanize-native-form
         (format-rows-by [int])))


;;; ----------------------------------------------- "SUM" AGGREGATION ------------------------------------------------
(qp-expect-with-all-engines
    {:rows        [[203]]
     :columns     ["sum"]
     :cols        [(aggregate-col :sum (venues-col :price))]
     :native_form true}
    (->> (data/run-query venues
           (ql/aggregation (ql/sum $price)))
         booleanize-native-form
         (format-rows-by [int])))


;;; ----------------------------------------------- "AVG" AGGREGATION ------------------------------------------------
(qp-expect-with-all-engines
    {:rows        [[35.5059]]
     :columns     ["avg"]
     :cols        [(aggregate-col :avg (venues-col :latitude))]
     :native_form true}
    (->> (data/run-query venues
           (ql/aggregation (ql/avg $latitude)))
         booleanize-native-form
         (format-rows-by [(partial u/round-to-decimals 4)])))


;;; ------------------------------------------ "DISTINCT COUNT" AGGREGATION ------------------------------------------
(qp-expect-with-all-engines
    {:rows        [[15]]
     :columns     ["count"]
     :cols        [(aggregate-col :count)]
     :native_form true}
    (->> (data/run-query checkins
           (ql/aggregation (ql/distinct $user_id)))
         booleanize-native-form
         (format-rows-by [int])))


;;; ------------------------------------------------- NO AGGREGATION -------------------------------------------------
;; Test that no aggregation (formerly known as a 'rows' aggregation in MBQL '95) just returns rows as-is.
(qp-expect-with-all-engines
    {:rows        [[ 1 "Red Medicine"                  4 10.0646 -165.374 3]
                   [ 2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
                   [ 3 "The Apple Pan"                11 34.0406 -118.428 2]
                   [ 4 "Wurstküche"                   29 33.9997 -118.465 2]
                   [ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
                   [ 6 "The 101 Coffee Shop"          20 34.1054 -118.324 2]
                   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
                   [ 8 "25°"                          11 34.1015 -118.342 2]
                   [ 9 "Krua Siri"                    71 34.1018 -118.301 1]
                   [10 "Fred 62"                      20 34.1046 -118.292 2]]
     :columns     (venues-columns)
     :cols        (venues-cols)
     :native_form true}
    (-> (data/run-query venues
           (ql/limit 10)
           (ql/order-by (ql/asc $id)))
        booleanize-native-form
        formatted-venues-rows
        tu/round-fingerprint-cols))


;;; ----------------------------------------------- STDDEV AGGREGATION -----------------------------------------------

(qp-expect-with-engines (non-timeseries-engines-with-feature :standard-deviation-aggregations)
  {:columns     ["stddev"]
   :cols        [(aggregate-col :stddev (venues-col :latitude))]
   :rows        [[3.4]]
   :native_form true}
  (-> (data/run-query venues
        (ql/aggregation (ql/stddev $latitude)))
      booleanize-native-form
      (update-in [:data :rows] (fn [[[v]]]
                                 [[(u/round-to-decimals 1 v)]]))))

;; Make sure standard deviation fails for the Mongo driver since its not supported
(datasets/expect-with-engines (non-timeseries-engines-without-feature :standard-deviation-aggregations)
  {:status :failed
   :error  "standard-deviation-aggregations is not supported by this driver."}
  (select-keys (data/run-query venues
                 (ql/aggregation (ql/stddev $latitude)))
               [:status :error]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIN & MAX                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect-with-non-timeseries-dbs [1] (first-row
                                      (format-rows-by [int]
                                        (data/run-query venues
                                          (ql/aggregation (ql/min $price))))))

(expect-with-non-timeseries-dbs [4] (first-row
                                      (format-rows-by [int]
                                        (data/run-query venues
                                          (ql/aggregation (ql/max $price))))))

(expect-with-non-timeseries-dbs
  [[1 34.0071] [2 33.7701] [3 10.0646] [4 33.983]]
  (format-rows-by [int (partial u/round-to-decimals 4)]
    (rows (data/run-query venues
            (ql/aggregation (ql/min $latitude))
            (ql/breakout $price)))))

(expect-with-non-timeseries-dbs
  [[1 37.8078] [2 40.7794] [3 40.7262] [4 40.7677]]
  (format-rows-by [int (partial u/round-to-decimals 4)]
    (rows (data/run-query venues
            (ql/aggregation (ql/max $latitude))
            (ql/breakout $price)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             MULTIPLE AGGREGATIONS                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; can we run a simple query with *two* aggregations?
(expect-with-non-timeseries-dbs
  [[100 203]]
  (format-rows-by [int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/count) (ql/sum $price))))))

;; how about with *three* aggregations?
(expect-with-non-timeseries-dbs
  [[2 100 203]]
  (format-rows-by [int int int]
    (rows (data/run-query venues
            (ql/aggregation (ql/avg $price) (ql/count) (ql/sum $price))))))

;; make sure that multiple aggregations of the same type have the correct metadata (#4003)
;;
;; (TODO - this isn't tested against Mongo or BigQuery because those drivers don't currently work correctly with
;; multiple columns with the same name)
(datasets/expect-with-engines (disj non-timeseries-engines :mongo :bigquery)
  [(aggregate-col :count)
   (assoc (aggregate-col :count)
     :display_name    "Count 2"
     :name            "count_2"
     :preview_display true)]
  (-> (data/run-query venues
        (ql/aggregation (ql/count) (ql/count)))
      :data :cols))


;;; ------------------------------------------------- CUMULATIVE SUM -------------------------------------------------

;;; cum_sum w/o breakout should be treated the same as sum
(qp-expect-with-all-engines
  {:rows        [[120]]
   :columns     ["sum"]
   :cols        [(aggregate-col :sum (users-col :id))]
   :native_form true}
  (->> (data/run-query users
         (ql/aggregation (ql/cum-sum $id)))
       booleanize-native-form
       (format-rows-by [int])))


;;; Simple cumulative sum where breakout field is same as cum_sum field
(qp-expect-with-all-engines
  {:rows        [[ 1   1]
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
   :columns     [(data/format-name "id")
                 "sum"]
   :cols        [(breakout-col (users-col :id))
                 (aggregate-col :sum (users-col :id))]
   :native_form true}
  (->> (data/run-query users
         (ql/aggregation (ql/cum-sum $id))
         (ql/breakout $id))
       booleanize-native-form
       (format-rows-by [int int])))


;;; Cumulative sum w/ a different breakout field
(qp-expect-with-all-engines
  {:rows        [["Broen Olujimi"        14]
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
   :columns     [(data/format-name "name")
                 "sum"]
   :cols        [(breakout-col (users-col :name))
                 (aggregate-col :sum (users-col :id))]
   :native_form true}
  (->> (data/run-query users
         (ql/aggregation (ql/cum-sum $id))
         (ql/breakout $name))
       booleanize-native-form
       (format-rows-by [str int])
       tu/round-fingerprint-cols))


;;; Cumulative sum w/ a different breakout field that requires grouping
(qp-expect-with-all-engines
  {:columns     [(data/format-name "price")
                 "sum"]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :sum (venues-col :id))]
   :rows        [[1 1211]
                 [2 4066]
                 [3 4681]
                 [4 5050]]
   :native_form true}
  (->> (data/run-query venues
         (ql/aggregation (ql/cum-sum $id))
         (ql/breakout $price))
       booleanize-native-form
       (format-rows-by [int int])))


;;; ------------------------------------------------ CUMULATIVE COUNT ------------------------------------------------

(defn- cumulative-count-col [col-fn col-name]
  (assoc (aggregate-col :count (col-fn col-name))
    :base_type    :type/Integer
    :special_type :type/Number))

;;; cum_count w/o breakout should be treated the same as count
(qp-expect-with-all-engines
    {:rows    [[15]]
     :columns ["count"]
     :cols    [(cumulative-count-col users-col :id)]
     :native_form true}
  (->> (data/run-query users
                  (ql/aggregation (ql/cum-count)))
       booleanize-native-form
       (format-rows-by [int])))

;;; Cumulative count w/ a different breakout field
(qp-expect-with-all-engines
  {:rows        [["Broen Olujimi"        1]
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
   :columns     [(data/format-name "name")
                 "count"]
   :cols        [(breakout-col (users-col :name))
                 (cumulative-count-col users-col :id)]
   :native_form true}
  (->> (data/run-query users
         (ql/aggregation (ql/cum-count))
         (ql/breakout $name))
       booleanize-native-form
       (format-rows-by [str int])
       tu/round-fingerprint-cols))


;;; Cumulative count w/ a different breakout field that requires grouping
(qp-expect-with-all-engines
  {:columns     [(data/format-name "price")
                 "count"]
   :cols        [(breakout-col (venues-col :price))
                 (cumulative-count-col venues-col :id)]
   :rows        [[1 22]
                 [2 81]
                 [3 94]
                 [4 100]]
   :native_form true}
  (->> (data/run-query venues
         (ql/aggregation (ql/cum-count))
         (ql/breakout $price))
       booleanize-native-form
       (format-rows-by [int int])))
