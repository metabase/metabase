(ns metabase.query-processor-test.filter-test
  "Tests for the `:filter` clause."
  (:require [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;;; FILTER -- "AND", ">", ">="
(qp.test/expect-with-non-timeseries-dbs
  [[55 "Dal Rae Restaurant"       67 33.983  -118.096 4]
   [61 "Lawry's The Prime Rib"    67 34.0677 -118.376 4]
   [77 "Sushi Nakazawa"           40 40.7318 -74.0045 4]
   [79 "Sushi Yasuda"             40 40.7514 -73.9736 4]
   [81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4]]
  (-> (data/run-mbql-query venues
        {:filter   [:and [:> $id 50] [:>= $price 4]]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;;; FILTER -- "AND", "<", ">", "!="
(qp.test/expect-with-non-timeseries-dbs
  [[21 "PizzaHacker"          58 37.7441 -122.421 2]
   [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
  (-> (data/run-mbql-query venues
        {:filter   [:and [:< $id 24] [:> $id 20] [:!= $id 22]]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;;; FILTER WITH A FALSE VALUE
;; Check that we're checking for non-nil values, not just logically true ones.
;; There's only one place (out of 3) that I don't like
(qp.test/expect-with-non-timeseries-dbs
  [[1]]
  (->> (data/dataset places-cam-likes
         (data/run-mbql-query places
           {:aggregation [[:count]]
            :filter      [:= $liked false]}))
       qp.test/rows
       (qp.test/format-rows-by [int])))

(defn- ->bool [x] ; SQLite returns 0/1 for false/true;
  (condp = x      ; Redshift returns nil/true.
    0   false     ; convert to false/true and restore sanity.
    0M  false
    1   true
    1M  true
    nil false
        x))

;;; filter = true
(qp.test/expect-with-non-timeseries-dbs
  [[1 "Tempest" true]
   [2 "Bullit"  true]]
  (->> (data/dataset places-cam-likes
         (data/run-mbql-query places
           {:filter   [:= $liked true]
            :order-by [[:asc $id]]}))
       qp.test/rows
       (qp.test/format-rows-by [int str ->bool] :format-nil-values)))

;;; filter != false
(qp.test/expect-with-non-timeseries-dbs
  [[1 "Tempest" true]
   [2 "Bullit"  true]]
  (->> (data/dataset places-cam-likes
         (data/run-mbql-query places
           {:filter   [:!= $liked false]
            :order-by [[:asc $id]]}))
       qp.test/rows
       (qp.test/format-rows-by [int str ->bool] :format-nil-values)))

;;; filter != true
(qp.test/expect-with-non-timeseries-dbs
  [[3 "The Dentist" false]]
  (->> (data/dataset places-cam-likes
         (data/run-mbql-query places
           {:filter   [:!= $liked true]
            :order-by [[:asc $id]]}))
       qp.test/rows
       (qp.test/format-rows-by [int str ->bool] :format-nil-values)))


;;; FILTER -- "BETWEEN", single subclause (neither "AND" nor "OR")
(qp.test/expect-with-non-timeseries-dbs
  [[21 "PizzaHacker"    58 37.7441 -122.421 2]
   [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
  (-> (data/run-mbql-query venues
        {:filter   [:between $id 21 22]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;;; FILTER -- "BETWEEN" with dates
(qp.test/qp-expect-with-all-drivers
  {:rows        [[29]]
   :columns     ["count"]
   :cols        [(qp.test/aggregate-col :count)]
   :native_form true}
  (do
    ;; Prevent an issue with Snowflake were a previous connection's report-timezone setting can affect this test's
    ;; results
    (when (= :snowflake driver/*driver*)
      (driver/notify-database-updated driver/*driver* (data/id)))
    (->> (data/run-mbql-query checkins
           {:aggregation [[:count]]
            :filter      [:between [:datetime-field $date :day] "2015-04-01" "2015-05-01"]})
         qp.test/booleanize-native-form
         (qp.test/format-rows-by [int]))))

;;; FILTER -- "OR", "<=", "="
(qp.test/expect-with-non-timeseries-dbs
  [[1 "Red Medicine"                  4 10.0646 -165.374 3]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
   [3 "The Apple Pan"                11 34.0406 -118.428 2]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
  (-> (data/run-mbql-query venues
        {:filter   [:or [:<= $id 3] [:= $id 5]]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;;; FILTER -- "INSIDE"
(qp.test/expect-with-non-timeseries-dbs
  [[1 "Red Medicine" 4 10.0646 -165.374 3]]
  (-> (data/run-mbql-query venues
        {:filter [:inside $latitude $longitude 10.0649 -165.379 10.0641 -165.371]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;;; FILTER - `is-null` & `not-null` on datetime columns
(qp.test/expect-with-non-timeseries-dbs
  [1000]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query checkins
        {:aggregation [[:count]]
         :filter      [:not-null $date]}))))

;; Creates a query that uses a field-literal. Normally our test queries will use a field placeholder, but
;; https://github.com/metabase/metabase/issues/7381 is only triggered by a field literal
(qp.test/expect-with-non-timeseries-dbs
  [1000]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query checkins
        {:aggregation [[:count]]
         :filter      ["NOT_NULL"
                       ["field-id"
                        ["field-literal" (data/format-name "date") "type/DateTime"]]]}))))

(qp.test/expect-with-non-timeseries-dbs
  true
  (let [result (qp.test/first-row (data/run-mbql-query checkins
                            {:aggregation [[:count]]
                             :filter      [:is-null $date]}))]
    ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround
    (contains? #{[0] [0M] [nil] nil} result)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            STRING SEARCH FILTERS - CONTAINS, STARTS-WITH, ENDS-WITH                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- starts-with ---------------------------------------------------

(qp.test/expect-with-non-timeseries-dbs
  [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
   [74 "Chez Jay"           2 34.0104 -118.493 2]]
  (-> (data/run-mbql-query venues
        {:filter   [:starts-with $name "Che"]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :case-sensitivity-string-filter-options)
  []
  (-> (data/run-mbql-query venues
        {:filter   [:starts-with $name "CHE"]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :case-sensitivity-string-filter-options)
  [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
   [74 "Chez Jay"           2 34.0104 -118.493 2]]
  (-> (data/run-mbql-query venues
        {:filter   [:starts-with $name "CHE" {:case-sensitive false}]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))


;;; --------------------------------------------------- ends-with ----------------------------------------------------

(qp.test/expect-with-non-timeseries-dbs
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  (-> (data/run-mbql-query venues
        {:filter   [:ends-with $name "Restaurant"]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :case-sensitivity-string-filter-options)
  []
  (-> (data/run-mbql-query venues
        {:filter   [:ends-with $name "RESTAURANT"]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :case-sensitivity-string-filter-options)
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  (-> (data/run-mbql-query venues
        {:filter   [:ends-with $name "RESTAURANT" {:case-sensitive false}]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;;; ---------------------------------------------------- contains ----------------------------------------------------
(qp.test/expect-with-non-timeseries-dbs
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (-> (data/run-mbql-query venues
        {:filter   [:contains $name "BBQ"]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;; case-insensitive
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :case-sensitivity-string-filter-options)
  []
  (-> (data/run-mbql-query venues
        {:filter   [:contains $name "bbq"]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))

;; case-insensitive
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :case-sensitivity-string-filter-options)
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (-> (data/run-mbql-query venues
        {:filter   [:contains $name "bbq" {:case-sensitive false}]
         :order-by [[:asc $id]]})
      qp.test/rows
      qp.test/formatted-venues-rows))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             NESTED AND/OR CLAUSES                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(qp.test/expect-with-non-timeseries-dbs
  [[81]]
  (->> (data/run-mbql-query venues
         {:aggregation [[:count]]
          :filter      [:and
                        [:!= $price 3]
                        [:or
                         [:= $price 1]
                         [:= $price 2]]]})
       qp.test/rows
       (qp.test/format-rows-by [int])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         = AND != WITH MULTIPLE VALUES                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(qp.test/expect-with-non-timeseries-dbs
  [[81]]
  (->> (data/run-mbql-query venues
         {:aggregation [[:count]]
          :filter      [:= $price 1 2]})
       qp.test/rows
       (qp.test/format-rows-by [int])))

(qp.test/expect-with-non-timeseries-dbs
  [[19]]
  (->> (data/run-mbql-query venues
         {:aggregation [[:count]]
          :filter      [:!= $price 1 2]})
       qp.test/rows
       (qp.test/format-rows-by [int])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   NOT FILTER                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; `not` filter -- Test that we can negate the various other filter clauses
;;
;; The majority of these tests aren't necessary since `not` automatically translates them to simpler, logically
;; equivalent expressions but I already wrote them so in this case it doesn't hurt to have a little more test coverage
;; than we need
;;

;;; =
(qp.test/expect-with-non-timeseries-dbs
  [99]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:= $id 1]]}))))

;;; !=
(qp.test/expect-with-non-timeseries-dbs
  [1]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:!= $id 1]]}))))
;;; <
(qp.test/expect-with-non-timeseries-dbs
  [61]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:< $id 40]]}))))

;;; >
(qp.test/expect-with-non-timeseries-dbs
  [40]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:> $id 40]]}))))

;;; <=
(qp.test/expect-with-non-timeseries-dbs
  [60]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:<= $id 40]]}))))

;;; >=
(qp.test/expect-with-non-timeseries-dbs
  [39]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:>= $id 40]]}))))

;;; is-null
(qp.test/expect-with-non-timeseries-dbs
  [100]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:is-null $id]]}))))

;;; between
(qp.test/expect-with-non-timeseries-dbs
  [89]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:between $id 30 40]]}))))

;;; inside
(qp.test/expect-with-non-timeseries-dbs
  [39]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:inside $latitude $longitude 40 -120 30 -110]]}))))

;;; starts-with
(qp.test/expect-with-non-timeseries-dbs
  [80]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:starts-with $name "T"]]}))))

;;; contains
(qp.test/expect-with-non-timeseries-dbs
  [97]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:contains $name "BBQ"]]}))))

;;; does-not-contain
;;
;; This should literally be the exact same query as the one above by the time it leaves the Query eXpander, so this is
;; more of a QX test than anything else
(qp.test/expect-with-non-timeseries-dbs
  [97]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:does-not-contain $name "BBQ"]}))))

;;; ends-with
(qp.test/expect-with-non-timeseries-dbs
  [87]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:ends-with $name "a"]]}))))

;;; and
(qp.test/expect-with-non-timeseries-dbs
  [98]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:and
                             [:> $id 32]
                             [:contains $name "BBQ"]]]}))))
;;; or
(qp.test/expect-with-non-timeseries-dbs
  [31]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:or
                             [:> $id 32]
                             [:contains $name "BBQ"]]]}))))

;;; nested and/or
(qp.test/expect-with-non-timeseries-dbs
  [96]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:or
                             [:and
                              [:> $id 32]
                              [:< $id 35]]
                             [:contains $name "BBQ"]]]}))))

;;; nested not
(qp.test/expect-with-non-timeseries-dbs
  [3]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:not [:not [:contains $name "BBQ"]]]}))))

;;; not nested inside and/or
(qp.test/expect-with-non-timeseries-dbs
  [1]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:and
                       [:not [:> $id 32]]
                       [:contains $name "BBQ"]]}))))


;; make sure that filtering with dates truncating to minutes works (#4632)
(qp.test/expect-with-non-timeseries-dbs
  [107]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query checkins
        {:aggregation [[:count]]
         :filter      [:between [:datetime-field $date :minute] "2015-01-01T12:30:00" "2015-05-31"]}))))

;; make sure that filtering with dates bucketing by weeks works (#4956)
(qp.test/expect-with-non-timeseries-dbs
  [7]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (data/run-mbql-query checkins
        {:aggregation [[:count]]
         :filter      [:= [:datetime-field $date :week] "2015-06-21T07:00:00.000000000-00:00"]}))))
