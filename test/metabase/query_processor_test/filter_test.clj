(ns metabase.query-processor-test.filter-test
  "Tests for the `:filter` clause."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]]))

(deftest and-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":and, :>, :>="
      (is (= [[55 "Dal Rae Restaurant"       67 33.983  -118.096 4]
              [61 "Lawry's The Prime Rib"    67 34.0677 -118.376 4]
              [77 "Sushi Nakazawa"           40 40.7318 -74.0045 4]
              [79 "Sushi Yasuda"             40 40.7514 -73.9736 4]
              [81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:and [:> $id 50] [:>= $price 4]]
                  :order-by [[:asc $id]]})))))

    (testing ":and, :<, :>, :!="
      (is (= [[21 "PizzaHacker"          58 37.7441 -122.421 2]
              [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:and [:< $id 24] [:> $id 20] [:!= $id 22]]
                  :order-by [[:asc $id]]})))))))

(deftest filter-by-false-test
  (mt/test-drivers (mt/normal-drivers)
    (testing (str "Check that we're checking for non-nil values, not just logically true ones. There's only one place "
                  "(out of 3) that I don't like")
      (is (= [[1]]
             (mt/formatted-rows [int]
               (mt/dataset places-cam-likes
                 (mt/run-mbql-query places
                   {:aggregation [[:count]]
                    :filter      [:= $liked false]}))))))))

(defn- ->bool [x]                       ; SQLite returns 0/1 for false/true;
  (condp = x                            ; Redshift returns nil/true.
    0   false                           ; convert to false/true and restore sanity.
    0M  false
    1   true
    1M  true
    nil false
    x))

(deftest comparison-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset places-cam-likes
      (testing "Can we use true literal in comparisons"
        (is (= [[1 "Tempest" true]
                [2 "Bullit"  true]]
               (mt/formatted-rows [int str ->bool]
                 :format-nil-values
                 (mt/run-mbql-query places
                   {:filter   [:= $liked true]
                    :order-by [[:asc $id]]}))))
        (is (= [[3 "The Dentist" false]]
               (mt/formatted-rows [int str ->bool]
                 :format-nil-values
                 (mt/run-mbql-query places
                   {:filter   [:!= $liked true]
                    :order-by [[:asc $id]]})))))
      (testing "Can we use false literal in comparisons"
        (is (= [[1 "Tempest" true]
                [2 "Bullit"  true]]
               (mt/formatted-rows [int str ->bool]
                 :format-nil-values
                 (mt/run-mbql-query places
                   {:filter   [:!= $liked false]
                    :order-by [[:asc $id]]})))))
      (testing "Can we use nil literal in comparisons"
        (is (= [[3]]
               (mt/formatted-rows [int]
                 (mt/run-mbql-query places
                   {:filter      [:!= $liked nil]
                    :aggregation [[:count]]}))))
        ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround (#5419)
        (is (contains? #{[0] [0M] [nil] nil}
                       (->> (mt/formatted-rows [int]
                              (mt/run-mbql-query places
                                {:filter      [:= $liked nil]
                                 :aggregation [[:count]]}))
                            first)))))))

(deftest between-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":between filter, single subclause (neither :and nor :or)"
      (is (= [[21 "PizzaHacker"    58 37.7441 -122.421 2]
              [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:between $id 21 22]
                  :order-by [[:asc $id]]})))))

    (testing ":between with dates"
      ;; Prevent an issue with Snowflake were a previous connection's report-timezone setting can affect this
      ;; test's results
      (when (= :snowflake driver/*driver*)
        (driver/notify-database-updated driver/*driver* (mt/id)))
      (is (= {:rows [[29]]
              :cols [(qp.test/aggregate-col :count)]}
             (qp.test/rows-and-cols
               (mt/format-rows-by [int]
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:between [:datetime-field $date :day] "2015-04-01" "2015-05-01"]}))))))))

(deftest or-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":or, :<=, :="
      (is (= [[1 "Red Medicine"                  4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
              [3 "The Apple Pan"                11 34.0406 -118.428 2]
              [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:or [:<= $id 3] [:= $id 5]]
                  :order-by [[:asc $id]]})))))))

(deftest inside-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":inside"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter [:inside $latitude $longitude 10.0649 -165.379 10.0641 -165.371]})))))))

(deftest is-null-test
  (mt/test-drivers (mt/normal-drivers)
    (let [result (mt/first-row (mt/run-mbql-query checkins
                                 {:aggregation [[:count]]
                                  :filter      [:is-null $date]}))]
      ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround (#5419)
      (is (= true
             (contains? #{[0] [0M] [nil] nil} result))))))

(deftest not-null-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [1000]
           (mt/first-row
             (mt/format-rows-by [int]
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:not-null $date]})))))
    (testing "Make sure :not-null filters work correctly with field literals (#7381)"
      (is (= [1000]
             (mt/first-row
               (mt/format-rows-by [int]
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not-null *date]}))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            STRING SEARCH FILTERS - CONTAINS, STARTS-WITH, ENDS-WITH                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- starts-with ---------------------------------------------------

(deftest starts-with-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
            [74 "Chez Jay"           2 34.0104 -118.493 2]]
           (mt/formatted-rows :venues
             (mt/run-mbql-query venues
               {:filter   [:starts-with $name "Che"]
                :order-by [[:asc $id]]})))))

  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (default)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:starts-with $name "CHE"]
                    :order-by [[:asc $id]]})))))

      (testing "case-sensitive (explicitly specified)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:starts-with $name "CHE" {:case-sensitive true}]
                    :order-by [[:asc $id]]})))))

      (testing "case-insensitive"
        (is (= [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
                [74 "Chez Jay"           2 34.0104 -118.493 2]]
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:starts-with $name "CHE" {:case-sensitive false}]
                    :order-by [[:asc $id]]}))))))))




;;; --------------------------------------------------- ends-with ----------------------------------------------------

(deftest ends-with-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
            [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
            [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
            [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
            [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
           (mt/formatted-rows :venues
             (mt/run-mbql-query venues
               {:filter   [:ends-with $name "Restaurant"]
                :order-by [[:asc $id]]})))))

  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (default)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:ends-with $name "RESTAURANT"]
                    :order-by [[:asc $id]]})))))

      (testing "case-sensitive (explicitly specified)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:ends-with $name "RESTAURANT" {:case-sensitive true}]
                    :order-by [[:asc $id]]})))))

      (testing "case-insensitive"
        (is (= [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
                [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
                [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
                [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
                [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:ends-with $name "RESTAURANT" {:case-sensitive false}]
                    :order-by [[:asc $id]]}))))))))


;;; ---------------------------------------------------- contains ----------------------------------------------------

(deftest contains-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
            [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
            [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
           (mt/formatted-rows :venues
             (mt/run-mbql-query venues
               {:filter   [:contains $name "BBQ"]
                :order-by [[:asc $id]]})))))

  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (default)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:contains $name "bbq"]
                    :order-by [[:asc $id]]})))))

      (testing "case-sensitive (explicitly specified)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:contains $name "bbq" {:case-sensitive true}]
                    :order-by [[:asc $id]]})))))

      (testing "case-insensitive"
        (is (= [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
                [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
                [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:contains $name "bbq" {:case-sensitive false}]
                    :order-by [[:asc $id]]}))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             NESTED AND/OR CLAUSES                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- count-with-filter-clause* [table-name filter-clause]
  (first
   (mt/first-row
     (mt/format-rows-by [int]
       (mt/run-mbql-query nil
         {:source-table (mt/id table-name)
          :aggregation  [[:count]]
          :filter       filter-clause})))))

(defmacro ^:private count-with-filter-clause
  ([filter-clause]
   `(count-with-filter-clause ~'venues ~filter-clause))

  ([table-name filter-clause]
   `(count-with-filter-clause* ~(keyword table-name) (mt/$ids ~table-name ~filter-clause))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         = AND != WITH MULTIPLE VALUES                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest equals-and-not-equals-with-extra-args-test
  (mt/test-drivers (mt/normal-drivers))
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
  (mt/test-drivers (mt/normal-drivers)
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
  (mt/test-drivers (mt/normal-drivers)
    (testing "make sure that filtering with dates truncating to minutes works (#4632)"
      (is (= 107
             (count-with-filter-clause checkins [:between
                                                 [:datetime-field $date :minute]
                                                 "2015-01-01T12:30:00"
                                                 "2015-05-31"]))))
    (testing "make sure that filtering with dates bucketing by weeks works (#4956)"
      (is (= 7
             (count-with-filter-clause checkins [:= [:datetime-field $date :week] "2015-06-21T07:00:00.000000000-00:00"]))))))

(deftest string-escape-test
  ;; test `:sql` drivers that support native parameters
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (testing "Make sure single quotes in parameters are escaped properly for the current driver"
      (doseq [[v expected-count] {"Tito's Tacos"          1
                                  "In-N-Out Burger"       1
                                  "\\\\\\\\' OR 1 = 1 --" 0
                                  "\\\\' OR 1 = 1 --"     0
                                  "\\' OR 1 = 1 --"       0
                                  "' OR 1 = 1 --"         0}]
        (testing (str "\n" (pr-str v))
          (let [query (mt/mbql-query venues
                        {:aggregation [[:count]]
                         :filter      [:= $name v]})]
            (testing (format "\nquery = %s" (pr-str (:query (qp/query->native-with-spliced-params query))))
              ;; Mongo returns empty results if count is zero -- see #5419
              (is (= (if (and (= driver/*driver* :mongo)
                              (zero? expected-count))
                       []
                       [[expected-count]])
                     (mt/formatted-rows [int]
                                        (qp/process-query query)))))))))

    (testing "Make sure we're not being too aggressive and encoding percent signs (e.g. SQL `LIKE`)"
      (is (= [[1]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :filter      [:starts-with $name "In-N-Out"]})))))))
