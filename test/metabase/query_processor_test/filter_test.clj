(ns metabase.query-processor-test.filter-test
  "Tests for the `:filter` clause."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;;; FILTER -- "AND", ">", ">="
(qp.test/expect-with-non-timeseries-dbs
  [[55 "Dal Rae Restaurant"       67 33.983  -118.096 4]
   [61 "Lawry's The Prime Rib"    67 34.0677 -118.376 4]
   [77 "Sushi Nakazawa"           40 40.7318 -74.0045 4]
   [79 "Sushi Yasuda"             40 40.7514 -73.9736 4]
   [81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:and [:> $id 50] [:>= $price 4]]
       :order-by [[:asc $id]]})))

;;; FILTER -- "AND", "<", ">", "!="
(qp.test/expect-with-non-timeseries-dbs
  [[21 "PizzaHacker"          58 37.7441 -122.421 2]
   [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:and [:< $id 24] [:> $id 20] [:!= $id 22]]
       :order-by [[:asc $id]]})))

;;; FILTER WITH A FALSE VALUE
;; Check that we're checking for non-nil values, not just logically true ones.
;; There's only one place (out of 3) that I don't like
(qp.test/expect-with-non-timeseries-dbs
  [[1]]
  (qp.test/formatted-rows [int]
    (data/dataset places-cam-likes
      (data/run-mbql-query places
        {:aggregation [[:count]]
         :filter      [:= $liked false]}))))

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
  (qp.test/formatted-rows [int str ->bool] :format-nil-values
    (data/dataset places-cam-likes
      (data/run-mbql-query places
        {:filter   [:= $liked true]
         :order-by [[:asc $id]]}))))

;;; filter != false
(qp.test/expect-with-non-timeseries-dbs
  [[1 "Tempest" true]
   [2 "Bullit"  true]]
  (qp.test/formatted-rows [int str ->bool] :format-nil-values
    (data/dataset places-cam-likes
      (data/run-mbql-query places
        {:filter   [:!= $liked false]
         :order-by [[:asc $id]]}))))

;;; filter != true
(qp.test/expect-with-non-timeseries-dbs
  [[3 "The Dentist" false]]
  (qp.test/formatted-rows [int str ->bool] :format-nil-values
    (data/dataset places-cam-likes
      (data/run-mbql-query places
        {:filter   [:!= $liked true]
         :order-by [[:asc $id]]}))))


(deftest between-test
  (datasets/test-drivers (qp.test/normal-drivers)
    (testing ":between filter, single subclause (neither :and nor :or)"
      (is (= [[21 "PizzaHacker"    58 37.7441 -122.421 2]
              [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
             (qp.test/formatted-rows :venues
               (data/run-mbql-query venues
                 {:filter   [:between $id 21 22]
                  :order-by [[:asc $id]]})))))
    (testing ":between with dates"
      (is (= {:rows [[29]]
              :cols [(qp.test/aggregate-col :count)]}
             (do
               ;; Prevent an issue with Snowflake were a previous connection's report-timezone setting can affect this
               ;; test's results
               (when (= :snowflake driver/*driver*)
                 (driver/notify-database-updated driver/*driver* (data/id)))
               (qp.test/rows-and-cols
                 (qp.test/format-rows-by [int]
                   (data/run-mbql-query checkins
                     {:aggregation [[:count]]
                      :filter      [:between [:datetime-field $date :day] "2015-04-01" "2015-05-01"]})))))))))

;;; FILTER -- "OR", "<=", "="
(qp.test/expect-with-non-timeseries-dbs
  [[1 "Red Medicine"                  4 10.0646 -165.374 3]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
   [3 "The Apple Pan"                11 34.0406 -118.428 2]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:or [:<= $id 3] [:= $id 5]]
       :order-by [[:asc $id]]})))

;;; FILTER -- "INSIDE"
(qp.test/expect-with-non-timeseries-dbs
  [[1 "Red Medicine" 4 10.0646 -165.374 3]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter [:inside $latitude $longitude 10.0649 -165.379 10.0641 -165.371]})))

(deftest is-null-test
  (mt/test-drivers (mt/normal-drivers)
    (let [result (qp.test/first-row (data/run-mbql-query checkins
                                      {:aggregation [[:count]]
                                       :filter      [:is-null $date]}))]
      ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround
      (is (= true
             (contains? #{[0] [0M] [nil] nil} result))))))

(deftest not-null-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [1000]
           (qp.test/first-row
             (qp.test/format-rows-by [int]
               (data/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:not-null $date]})))))
    (testing "Make sure :not-null filters work correctly with field literals (#7381)"
      (is (= [1000]
             (qp.test/first-row
               (qp.test/format-rows-by [int]
                 (data/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not-null *date]}))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            STRING SEARCH FILTERS - CONTAINS, STARTS-WITH, ENDS-WITH                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- starts-with ---------------------------------------------------

(qp.test/expect-with-non-timeseries-dbs
  [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
   [74 "Chez Jay"           2 34.0104 -118.493 2]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:starts-with $name "Che"]
       :order-by [[:asc $id]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
  []
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:starts-with $name "CHE"]
       :order-by [[:asc $id]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
  [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
   [74 "Chez Jay"           2 34.0104 -118.493 2]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:starts-with $name "CHE" {:case-sensitive false}]
       :order-by [[:asc $id]]})))


;;; --------------------------------------------------- ends-with ----------------------------------------------------

(qp.test/expect-with-non-timeseries-dbs
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:ends-with $name "Restaurant"]
       :order-by [[:asc $id]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
  []
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:ends-with $name "RESTAURANT"]
       :order-by [[:asc $id]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:ends-with $name "RESTAURANT" {:case-sensitive false}]
       :order-by [[:asc $id]]})))

;;; ---------------------------------------------------- contains ----------------------------------------------------
(qp.test/expect-with-non-timeseries-dbs
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:contains $name "BBQ"]
       :order-by [[:asc $id]]})))

;; case-insensitive
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
  []
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:contains $name "bbq"]
       :order-by [[:asc $id]]})))

;; case-insensitive
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (qp.test/formatted-rows :venues
    (data/run-mbql-query venues
      {:filter   [:contains $name "bbq" {:case-sensitive false}]
       :order-by [[:asc $id]]})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             NESTED AND/OR CLAUSES                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- count-with-filter-clause* [table-name filter-clause]
  (first
   (qp.test/first-row
     (qp.test/format-rows-by [int]
       (data/run-mbql-query nil
         {:source-table (data/id table-name)
          :aggregation  [[:count]]
          :filter       filter-clause})))))

(defmacro ^:private count-with-filter-clause
  ([filter-clause]
   `(count-with-filter-clause ~'venues ~filter-clause))

  ([table-name filter-clause]
   `(count-with-filter-clause* ~(keyword table-name) (data/$ids ~table-name ~filter-clause))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         = AND != WITH MULTIPLE VALUES                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest equals-and-not-equals-with-extra-args-test
  (datasets/test-drivers (qp.test/normal-drivers))
  (testing ":= with >2 args"
    (is (= 81
           (count-with-filter-clause [:= $price 1 2]))))
  (testing ":!= with >2 args"
    (is (= 19
           (count-with-filter-clause [:!= $price 1 2])))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   NOT FILTER                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; `not` filter -- Test that we can negate the various other filter clauses
;;
;; The majority of these tests aren't necessary since `not` automatically translates them to simpler, logically
;; equivalent expressions but I already wrote them so in this case it doesn't hurt to have a little more test coverage
;; than we need

(deftest not-filter-test
  (datasets/test-drivers (qp.test/normal-drivers)
    (testing "="
      (is (= 99
             (count-with-filter-clause [:not [:= $id 1]]))))
    (testing "!="
      (is (= 1
             (count-with-filter-clause [:not [:!= $id 1]]))))
    (testing "<"
      (is (= 61
             (count-with-filter-clause [:not [:< $id 40]]))))
    (testing ">"
      (is (= 40
             (count-with-filter-clause [:not [:> $id 40]]))))
    (testing "<="
      (is (= 60
             (count-with-filter-clause [:not [:<= $id 40]]))))
    (testing ">="
      (is (= 39
             (count-with-filter-clause [:not [:>= $id 40]]))))
    (testing "is-null"
      (is (= 100
             (count-with-filter-clause [:not [:is-null $id]]))))
    (testing "between"
      (is (= 89
             (count-with-filter-clause [:not [:between $id 30 40]]))))
    (testing "inside"
      (is (= 39
             (count-with-filter-clause [:not [:inside $latitude $longitude 40 -120 30 -110]]))))
    (testing "starts-with"
      (is (= 80
             (count-with-filter-clause [:not [:starts-with $name "T"]]))))
    (testing "contains"
      (is (= 97
             (count-with-filter-clause [:not [:contains $name "BBQ"]]))))
    (testing "does-not-contain"
      (is (= 97
             (count-with-filter-clause [:does-not-contain $name "BBQ"]))
          "sanity check — does-not-contain should get converted to `:not` + `:contains` by QP middleware"))
    (testing "ends-with"
      (is (= 87
             (count-with-filter-clause [:not [:ends-with $name "a"]]))))
    (testing "and"
      (is (= 98
             (count-with-filter-clause [:not [:and
                                              [:> $id 32]
                                              [:contains $name "BBQ"]]]))))
    (testing "or"
      (is (= 31
             (count-with-filter-clause [:not [:or
                                              [:> $id 32]
                                              [:contains $name "BBQ"]]]))))

    (testing "nested and/or"
      (is (= 96
             (count-with-filter-clause [:not [:or
                                              [:and
                                               [:> $id 32]
                                               [:< $id 35]]
                                              [:contains $name "BBQ"]]]))))

    (testing "nested not"
      (is (= 3
             (count-with-filter-clause [:not [:not [:contains $name "BBQ"]]]))))

    (testing "not nested inside and/or"
      (is (= 1
             (count-with-filter-clause [:and
                                        [:not [:> $id 32]]
                                        [:contains $name "BBQ"]]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Etc                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest etc-test
  (datasets/test-drivers (qp.test/normal-drivers)
    (testing "make sure that filtering with dates truncating to minutes works (#4632)"
      (is (= 107
             (count-with-filter-clause checkins [:between
                                                 [:datetime-field $date :minute]
                                                 "2015-01-01T12:30:00"
                                                 "2015-05-31"]))))
    (testing "make sure that filtering with dates bucketing by weeks works (#4956)"
      (is (= 7
             (count-with-filter-clause checkins [:= [:datetime-field $date :week] "2015-06-21T07:00:00.000000000-00:00"]))))))
