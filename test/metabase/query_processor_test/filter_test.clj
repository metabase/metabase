(ns metabase.query-processor-test.filter-test
  "Tests for the `:filter` clause."
  (:require [metabase.query-processor-test :refer :all]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;;; ------------------------------------------------ "FILTER" CLAUSE -------------------------------------------------

;;; FILTER -- "AND", ">", ">="
(expect-with-non-timeseries-dbs
  [[55 "Dal Rae Restaurant"       67 33.983  -118.096 4]
   [61 "Lawry's The Prime Rib"    67 34.0677 -118.376 4]
   [77 "Sushi Nakazawa"           40 40.7318 -74.0045 4]
   [79 "Sushi Yasuda"             40 40.7514 -73.9736 4]
   [81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4]]
  (-> (data/run-query venues
        (ql/filter (ql/and (ql/>  $id    50)
                           (ql/>= $price  4)))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER -- "AND", "<", ">", "!="
(expect-with-non-timeseries-dbs
  [[21 "PizzaHacker"          58 37.7441 -122.421 2]
   [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
  (-> (data/run-query venues
        (ql/filter (ql/and (ql/<  $id 24)
                           (ql/>  $id 20)
                           (ql/!= $id 22)))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER WITH A FALSE VALUE
;; Check that we're checking for non-nil values, not just logically true ones.
;; There's only one place (out of 3) that I don't like
(expect-with-non-timeseries-dbs
  [[1]]
  (->> (data/dataset places-cam-likes
         (data/run-query places
           (ql/aggregation (ql/count))
           (ql/filter (ql/= $liked false))))
       rows (format-rows-by [int])))

(defn- ->bool [x] ; SQLite returns 0/1 for false/true;
  (condp = x      ; Redshift returns nil/true.
    0   false     ; convert to false/true and restore sanity.
    0M  false
    1   true
    1M  true
    nil false
        x))

;;; filter = true
(expect-with-non-timeseries-dbs
  [[1 "Tempest" true]
   [2 "Bullit"  true]]
  (->> (data/dataset places-cam-likes
         (data/run-query places
           (ql/filter (ql/= $liked true))
           (ql/order-by (ql/asc $id))))
       rows (format-rows-by [int str ->bool] :format-nil-values)))

;;; filter != false
(expect-with-non-timeseries-dbs
  [[1 "Tempest" true]
   [2 "Bullit"  true]]
  (->> (data/dataset places-cam-likes
         (data/run-query places
           (ql/filter (ql/!= $liked false))
           (ql/order-by (ql/asc $id))))
       rows (format-rows-by [int str ->bool] :format-nil-values)))

;;; filter != true
(expect-with-non-timeseries-dbs
  [[3 "The Dentist" false]]
  (->> (data/dataset places-cam-likes
         (data/run-query places
           (ql/filter (ql/!= $liked true))
           (ql/order-by (ql/asc $id))))
       rows (format-rows-by [int str ->bool] :format-nil-values)))


;;; FILTER -- "BETWEEN", single subclause (neither "AND" nor "OR")
(expect-with-non-timeseries-dbs
  [[21 "PizzaHacker"    58 37.7441 -122.421 2]
   [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
  (-> (data/run-query venues
        (ql/filter (ql/between $id 21 22))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER -- "BETWEEN" with dates
(qp-expect-with-all-engines
  {:rows        [[29]]
   :columns     ["count"]
   :cols        [(aggregate-col :count)]
   :native_form true}
  (->> (data/run-query checkins
         (ql/aggregation (ql/count))
         (ql/filter (ql/between $date "2015-04-01" "2015-05-01")))
       booleanize-native-form
       (format-rows-by [int])))

;;; FILTER -- "OR", "<=", "="
(expect-with-non-timeseries-dbs
  [[1 "Red Medicine"                  4 10.0646 -165.374 3]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
   [3 "The Apple Pan"                11 34.0406 -118.428 2]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
  (-> (data/run-query venues
        (ql/filter (ql/or (ql/<= $id 3)
                          (ql/= $id 5)))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER -- "INSIDE"
(expect-with-non-timeseries-dbs
  [[1 "Red Medicine" 4 10.0646 -165.374 3]]
  (-> (data/run-query venues
        (ql/filter (ql/inside $latitude $longitude 10.0649 -165.379 10.0641 -165.371)))
      rows formatted-venues-rows))

;;; FILTER - `is-null` & `not-null` on datetime columns
(expect-with-non-timeseries-dbs
  [1000]
  (first-row
    (format-rows-by [int]
      (data/run-query checkins
        (ql/aggregation (ql/count))
        (ql/filter (ql/not-null $date))))))

;; Creates a query that uses a field-literal. Normally our test queries will use a field placeholder, but
;; https://github.com/metabase/metabase/issues/7381 is only triggered by a field literal
(expect-with-non-timeseries-dbs
  [1000]
  (let [vec-filter #(assoc % :filter ["NOT_NULL"
                                      ["field-id"
                                       ["field-literal" (data/format-name "date") "type/DateTime"]]])]
    (first-row
      (format-rows-by [int]
        (data/run-query checkins
          (ql/aggregation (ql/count))
          vec-filter)))))

(expect-with-non-timeseries-dbs
  true
  (let [result (first-row (data/run-query checkins
                            (ql/aggregation (ql/count))
                            (ql/filter (ql/is-null $date))))]
    ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround
    (or (= result [0])
        (= result [0M])
        (nil? result))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            STRING SEARCH FILTERS - CONTAINS, STARTS-WITH, ENDS-WITH                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- starts-with ---------------------------------------------------
(expect-with-non-timeseries-dbs
  [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
   [74 "Chez Jay"           2 34.0104 -118.493 2]]
  (-> (data/run-query venues
        (ql/filter (ql/starts-with $name "Che"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

(datasets/expect-with-engines (non-timeseries-engines-without-feature :no-case-sensitivity-string-filter-options)
  []
  (-> (data/run-query venues
        (ql/filter (ql/starts-with $name "CHE"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

(datasets/expect-with-engines (non-timeseries-engines-without-feature :no-case-sensitivity-string-filter-options)
  [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
   [74 "Chez Jay"           2 34.0104 -118.493 2]]
  (-> (data/run-query venues
        (ql/filter (ql/starts-with $name "CHE" {:case-sensitive false}))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))


;;; --------------------------------------------------- ends-with ----------------------------------------------------
(expect-with-non-timeseries-dbs
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  (-> (data/run-query venues
        (ql/filter (ql/ends-with $name "Restaurant"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

(datasets/expect-with-engines (non-timeseries-engines-without-feature :no-case-sensitivity-string-filter-options)
  []
  (-> (data/run-query venues
        (ql/filter (ql/ends-with $name "RESTAURANT"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

(datasets/expect-with-engines (non-timeseries-engines-without-feature :no-case-sensitivity-string-filter-options)
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  (-> (data/run-query venues
        (ql/filter (ql/ends-with $name "RESTAURANT" {:case-sensitive false}))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; ---------------------------------------------------- contains ----------------------------------------------------
(expect-with-non-timeseries-dbs
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (-> (data/run-query venues
        (ql/filter (ql/contains $name "BBQ"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;; case-insensitive
(datasets/expect-with-engines (non-timeseries-engines-without-feature :no-case-sensitivity-string-filter-options)
  []
  (-> (data/run-query venues
        (ql/filter (ql/contains $name "bbq"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;; case-insensitive
(datasets/expect-with-engines (non-timeseries-engines-without-feature :no-case-sensitivity-string-filter-options)
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (-> (data/run-query venues
        (ql/filter (ql/contains $name "bbq" {:case-sensitive false}))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             NESTED AND/OR CLAUSES                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect-with-non-timeseries-dbs
  [[81]]
  (->> (data/run-query venues
         (ql/aggregation (ql/count))
         (ql/filter (ql/and (ql/!= $price 3)
                            (ql/or (ql/= $price 1)
                                   (ql/= $price 2)))))
       rows (format-rows-by [int])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         = AND != WITH MULTIPLE VALUES                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect-with-non-timeseries-dbs
  [[81]]
  (->> (data/run-query venues
         (ql/aggregation (ql/count))
         (ql/filter (ql/= $price 1 2)))
       rows (format-rows-by [int])))

(expect-with-non-timeseries-dbs
  [[19]]
  (->> (data/run-query venues
         (ql/aggregation (ql/count))
         (ql/filter (ql/!= $price 1 2)))
       rows (format-rows-by [int])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   NOT FILTER                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; `not` filter -- Test that we can negate the various other filter clauses
;;
;; The majority of these tests aren't necessary since `not` automatically translates them to simpler, logically
;; equivalent expressions but I already wrote them so in this case it doesn't hurt to have a little more test coverage
;; than we need
;;
;; TODO - maybe it makes sense to have a separate namespace to test the Query eXpander so we don't need to run all
;; these extra queries?

;;; =
(expect-with-non-timeseries-dbs
  [99]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/= $id 1)))))))

;;; !=
(expect-with-non-timeseries-dbs
  [1]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/!= $id 1)))))))
;;; <
(expect-with-non-timeseries-dbs
  [61]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/< $id 40)))))))

;;; >
(expect-with-non-timeseries-dbs
  [40]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/> $id 40)))))))

;;; <=
(expect-with-non-timeseries-dbs
  [60]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/<= $id 40)))))))

;;; >=
(expect-with-non-timeseries-dbs
  [39]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/>= $id 40)))))))

;;; is-null
(expect-with-non-timeseries-dbs
  [100]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/is-null $id)))))))

;;; between
(expect-with-non-timeseries-dbs
  [89]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/between $id 30 40)))))))

;;; inside
(expect-with-non-timeseries-dbs
  [39]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/inside $latitude $longitude 40 -120 30 -110)))))))

;;; starts-with
(expect-with-non-timeseries-dbs
  [80]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/starts-with $name "T")))))))

;;; contains
(expect-with-non-timeseries-dbs
  [97]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/contains $name "BBQ")))))))

;;; does-not-contain
;;
;; This should literally be the exact same query as the one above by the time it leaves the Query eXpander, so this is
;; more of a QX test than anything else
(expect-with-non-timeseries-dbs
  [97]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/does-not-contain $name "BBQ"))))))

;;; ends-with
(expect-with-non-timeseries-dbs
  [87]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/ends-with $name "a")))))))

;;; and
(expect-with-non-timeseries-dbs
  [98]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/and (ql/> $id 32)
                                   (ql/contains $name "BBQ"))))))))
;;; or
(expect-with-non-timeseries-dbs
  [31]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/or (ql/> $id 32)
                                  (ql/contains $name "BBQ"))))))))

;;; nested and/or
(expect-with-non-timeseries-dbs
  [96]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/or (ql/and (ql/> $id 32)
                                          (ql/< $id 35))
                                  (ql/contains $name "BBQ"))))))))

;;; nested not
(expect-with-non-timeseries-dbs
  [3]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/not (ql/not (ql/contains $name "BBQ"))))))))

;;; not nested inside and/or
(expect-with-non-timeseries-dbs
  [1]
  (first-row
    (format-rows-by [int]
      (data/run-query venues
        (ql/aggregation (ql/count))
        (ql/filter (ql/and (ql/not (ql/> $id 32))
                           (ql/contains $name "BBQ")))))))


;; make sure that filtering with dates truncating to minutes works (#4632)
(expect-with-non-timeseries-dbs
  [107]
  (first-row
    (format-rows-by [int]
      (data/run-query checkins
        (ql/aggregation (ql/count))
        (ql/filter (ql/between (ql/datetime-field $date :minute) "2015-01-01T12:30:00" "2015-05-31"))))))

;; make sure that filtering with dates bucketing by weeks works (#4956)
(expect-with-non-timeseries-dbs
  [7]
  (first-row
    (format-rows-by [int]
      (data/run-query checkins
        (ql/aggregation (ql/count))
        (ql/filter (ql/= (ql/datetime-field $date :week) "2015-06-21T07:00:00.000000000-00:00"))))))
