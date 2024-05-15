(ns metabase.query-processor-test.filter-test
  "Tests for the `:filter` clause."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test.timezones-test :as timezones-test]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel and-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":and, :<, :>, :!="
      (is (= [[21 "PizzaHacker"          58 37.7441 -122.421 2]
              [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:and [:< $id 24] [:> $id 20] [:!= $id 22]]
                  :order-by [[:asc $id]]})))))))

(deftest ^:parallel and-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing ":and, :<, :>, :!="
      (is (= [[21 "PizzaHacker"          58 37.7441 -122.421 2]
              [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:and [:< $id 24] [:> $id 20] [:!= $id 22]]
                  :order-by [[:asc $id]]})))))))

(deftest ^:parallel filter-by-false-test
  (mt/test-drivers (mt/normal-drivers)
    (testing (str "Check that we're checking for non-nil values, not just logically true ones. There's only one place "
                  "(out of 3) that I don't like")
      (is (= [[1]]
             (mt/formatted-rows [int]
               (mt/dataset places-cam-likes
                 (mt/run-mbql-query places
                   {:aggregation [[:count]]
                    :filter      [:= $liked false]}))))))))

(defn- ->bool [x] ; SQLite returns 0/1 for false/true;
  (condp = x      ; Redshift returns nil/true.
    0   false     ; convert to false/true and restore sanity.
    0M  false
    1   true
    1M  true
    nil false
    x))

(deftest ^:parallel comparison-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset places-cam-likes
      (testing "Can we use true literal in comparisons"
        (is (= [[1 "Tempest" true]
                [2 "Bullit"  true]]
               (mt/formatted-rows [int str ->bool]
                 :format-nil-values
                 (mt/run-mbql-query places
                   {:filter   [:= $liked true]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel comparison-test-2
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset places-cam-likes
      (testing "Can we use true literal in comparisons"
        (is (= [[3 "The Dentist" false]]
               (mt/formatted-rows [int str ->bool]
                 :format-nil-values
                 (mt/run-mbql-query places
                   {:filter   [:!= $liked true]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel comparison-test-3
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset places-cam-likes
      (testing "Can we use false literal in comparisons"
        (is (= [[1 "Tempest" true]
                [2 "Bullit"  true]]
               (mt/formatted-rows [int str ->bool]
                 :format-nil-values
                 (mt/run-mbql-query places
                   {:filter   [:!= $liked false]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel comparison-test-4
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset places-cam-likes
      (testing "Can we use nil literal in comparisons"
        (is (= [[3]]
               (mt/formatted-rows [int]
                 (mt/run-mbql-query places
                   {:filter      [:!= $liked nil]
                    :aggregation [[:count]]}))))))))

(deftest ^:parallel comparison-test-5
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset places-cam-likes
      (testing "Can we use nil literal in comparisons"
        ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround (#5419)
        (is (contains? #{[0] [0M] [nil] nil}
                       (->> (mt/formatted-rows [int]
                              (mt/run-mbql-query places
                                {:filter      [:= $liked nil]
                                 :aggregation [[:count]]}))
                            first)))))))

(deftest ^:parallel between-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":between filter, single subclause (neither :and nor :or)"
      (is (= [[21 "PizzaHacker"    58 37.7441 -122.421 2]
              [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:between $id 21 22]
                  :order-by [[:asc $id]]})))))))

(deftest between-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing ":between with dates"
      ;; Prevent an issue with Snowflake were a previous connection's report-timezone setting can affect this
      ;; test's results
      (when (= :snowflake driver/*driver*)
        (driver/notify-database-updated driver/*driver* (mt/id)))
      (is (=? {:rows [[29]]
               :cols [(qp.test-util/aggregate-col :count)]}
              (qp.test-util/rows-and-cols
               (mt/format-rows-by [int]
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:between !day.date "2015-04-01" "2015-05-01"]}))))))))

(defn- timezone-arithmetic-drivers []
  (set/intersection
    (mt/normal-drivers-with-feature :expressions)
    (mt/normal-drivers-with-feature :date-arithmetics)
    (timezones-test/timezone-aware-column-drivers)))

(deftest ^:parallel temporal-arithmetic-test
  (testing "Should be able to use temporal arithmetic expressions in filters (#22531)"
    (mt/test-drivers (timezone-arithmetic-drivers)
      (mt/dataset attempted-murders
        (doseq [offset-unit   [:year :day]
                interval-unit [:year :day]
                compare-op    [:between := :< :<= :> :>=]
                compare-order (cond-> [:field-first]
                                (not= compare-op :between) (conj :value-first))]
          (let [query (mt/mbql-query attempts
                        {:aggregation [[:count]]
                         :filter      (cond-> [compare-op]
                                        (= compare-order :field-first)
                                        (conj [:+ !default.datetime_tz [:interval 3 offset-unit]]
                                              [:relative-datetime -7 interval-unit])
                                        (= compare-order :value-first)
                                        (conj [:relative-datetime -7 interval-unit]
                                              [:+ !default.datetime_tz [:interval 3 offset-unit]])
                                        (= compare-op :between)
                                        (conj [:relative-datetime 0 interval-unit]))})]
            ;; we are not interested in the exact result, just want to check
            ;; that the query can be compiled and executed
            (mt/with-native-query-testing-context query
              (let [[[result]] (mt/formatted-rows [int]
                                 (qp/process-query query))]
                (if (= driver/*driver* :mongo)
                  (is (or (nil? result)
                          (pos-int? result)))
                  (is (nat-int? result)))))))))))

(deftest ^:parallel nonstandard-temporal-arithmetic-test
  (testing "Nonstandard temporal arithmetic should also be supported"
    (mt/test-drivers (timezone-arithmetic-drivers)
      (mt/dataset attempted-murders
        (doseq [offset-unit   [:year :day]
                interval-unit [:year :day]
                compare-op    [:between := :< :<= :> :>=]
                add-op        [:+ :-]
                compare-order (cond-> [:field-first]
                                (not= compare-op :between) (conj :value-first))]
          (let [add-fn (fn [field interval]
                         (if (= add-op :-)
                           [add-op field interval interval]
                           [add-op interval field interval]))
                query  (mt/mbql-query attempts
                         {:aggregation [[:count]]
                          :filter      (cond-> [compare-op]
                                         (= compare-order :field-first)
                                         (conj (add-fn !default.datetime_tz [:interval 3 offset-unit])
                                               [:relative-datetime -7 interval-unit])
                                         (= compare-order :value-first)
                                         (conj [:relative-datetime -7 interval-unit]
                                               (add-fn !default.datetime_tz [:interval 3 offset-unit]))
                                         (= compare-op :between)
                                         (conj [:relative-datetime 0 interval-unit]))})]
            ;; we are not interested in the exact result, just want to check
            ;; that the query can be compiled and executed
            (mt/with-native-query-testing-context query
              (let [[[result]] (mt/formatted-rows [int]
                                 (qp/process-query query))]
                (if (= driver/*driver* :mongo)
                  (is (or (nil? result)
                          (pos-int? result)))
                  (is (nat-int? result)))))))))))

(deftest ^:parallel or-test
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

(deftest ^:parallel inside-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":inside"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter [:inside $latitude $longitude 10.0649 -165.379 10.0641 -165.371]})))))))

(deftest ^:parallel is-null-test
  (mt/test-drivers (mt/normal-drivers)
    (let [result (mt/first-row (mt/run-mbql-query checkins
                                 {:aggregation [[:count]]
                                  :filter      [:is-null $date]}))]
      ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround (#5419)
      (is (contains? #{[0] [0M] [nil] nil} result)))))

(deftest ^:parallel not-null-test
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
                   {:source-query {:source-table $$checkins}
                    :aggregation  [[:count]]
                    :filter       [:not-null *date]}))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            STRING SEARCH FILTERS - CONTAINS, STARTS-WITH, ENDS-WITH                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- starts-with ---------------------------------------------------

(deftest ^:parallel starts-with-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
            [74 "Chez Jay"           2 34.0104 -118.493 2]]
           (mt/formatted-rows :venues
             (mt/run-mbql-query venues
               {:filter   [:starts-with $name "Che"]
                :order-by [[:asc $id]]}))))))

(deftest ^:parallel starts-with-case-sensitive-test
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (default)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:starts-with $name "CHE"]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel starts-with-case-sensitive-test-2
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (explicitly specified)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:starts-with $name "CHE" {:case-sensitive true}]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel starts-with-case-sensitive-test-3
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-insensitive"
        (is (= [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
                [74 "Chez Jay"           2 34.0104 -118.493 2]]
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:starts-with $name "CHE" {:case-sensitive false}]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel starts-with-expression-argument-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "expression argument"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:starts-with $name [:lower [:substring $name 1 3]] {:case-sensitive false}]
                  :order-by [[:asc $id]]
                  :limit 3})))))))

(deftest ^:parallel starts-with-field-argument-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "field argument"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:starts-with $name $name]
                  :order-by [[:asc $id]]
                  :limit    3})))))))

;;; --------------------------------------------------- ends-with ----------------------------------------------------

(deftest ^:parallel ends-with-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
            [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
            [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
            [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
            [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
           (mt/formatted-rows :venues
             (mt/run-mbql-query venues
               {:filter   [:ends-with $name "Restaurant"]
                :order-by [[:asc $id]]}))))))

(deftest ^:parallel ends-with-case-sensitive-test
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (default)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:ends-with $name "RESTAURANT"]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel ends-with-case-sensitive-test-2
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (explicitly specified)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:ends-with $name "RESTAURANT" {:case-sensitive true}]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel ends-with-case-sensitive-test-3
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
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

(deftest ^:parallel ends-with-expression-argument-test
  (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
    (testing "expression argument"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:ends-with $name [:upper $name] {:case-sensitive false}]
                  :order-by [[:asc $id]]
                  :limit 3})))))))

(deftest ^:parallel ends-with-field-argument-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "field argument"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:ends-with $name $name]
                  :order-by [[:asc $id]]
                  :limit 3})))))))

;;; ---------------------------------------------------- contains ----------------------------------------------------

(deftest ^:parallel contains-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
            [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
            [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
           (mt/formatted-rows :venues
             (mt/run-mbql-query venues
               {:filter   [:contains $name "BBQ"]
                :order-by [[:asc $id]]}))))))

(deftest ^:parallel contains-case-sensitive-test
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (default)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:contains $name "bbq"]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel contains-case-sensitive-test-2
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-sensitive (explicitly specified)"
        (is (= []
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:contains $name "bbq" {:case-sensitive true}]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel contains-case-sensitive-test-3
  (testing "case sensitivity option"
    (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
      (testing "case-insensitive"
        (is (= [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
                [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
                [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
               (mt/formatted-rows :venues
                 (mt/run-mbql-query venues
                   {:filter   [:contains $name "bbq" {:case-sensitive false}]
                    :order-by [[:asc $id]]}))))))))

(deftest ^:parallel contains-expression-argument-test
  (mt/test-drivers (mt/normal-drivers-with-feature :case-sensitivity-string-filter-options)
    (testing "expression argument"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:contains $name [:lower [:substring $name 1 3]] {:case-sensitive false}]
                  :order-by [[:asc $id]]
                  :limit 3})))))))

(deftest ^:parallel contains-field-argument-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "field argument"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:filter   [:contains $name $name]
                  :order-by [[:asc $id]]
                  :limit 3})))))))

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

(deftest ^:parallel equals-and-not-equals-with-extra-args-test
  (mt/test-drivers (mt/normal-drivers)
    (testing ":= with >2 args"
      (is (= 81
             (count-with-filter-clause [:= $price 1 2]))))))

(deftest ^:parallel equals-and-not-equals-with-extra-args-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing ":!= with >2 args"
      (is (= 19
             (count-with-filter-clause [:!= $price 1 2]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   NOT FILTER                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; `not` filter -- Test that we can negate the various other filter clauses
;;
;; The majority of these tests aren't necessary since `not` automatically translates them to simpler, logically
;; equivalent expressions but I already wrote them so in this case it doesn't hurt to have a little more test coverage
;; than we need

(deftest ^:parallel not-filter-test-1
  (mt/test-drivers (mt/normal-drivers)
    (testing "="
      (is (= 99
             (count-with-filter-clause [:not [:= $id 1]]))))))

(deftest ^:parallel not-filter-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "!="
      (is (= 1
             (count-with-filter-clause [:not [:!= $id 1]]))))))

(deftest ^:parallel not-filter-test-3
  (mt/test-drivers (mt/normal-drivers)
    (testing "<"
      (is (= 61
             (count-with-filter-clause [:not [:< $id 40]]))))))

(deftest ^:parallel not-filter-test-4
  (mt/test-drivers (mt/normal-drivers)
    (testing ">"
      (is (= 40
             (count-with-filter-clause [:not [:> $id 40]]))))))

(deftest ^:parallel not-filter-test-5
  (mt/test-drivers (mt/normal-drivers)
    (testing "<="
      (is (= 60
             (count-with-filter-clause [:not [:<= $id 40]]))))))

(deftest ^:parallel not-filter-test-6
  (mt/test-drivers (mt/normal-drivers)
    (testing ">="
      (is (= 39
             (count-with-filter-clause [:not [:>= $id 40]]))))))

(deftest ^:parallel not-filter-test-7
  (mt/test-drivers (mt/normal-drivers)
    (testing "is-null"
      (is (= 100
             (count-with-filter-clause [:not [:is-null $id]]))))))

(deftest ^:parallel not-filter-test-8
  (mt/test-drivers (mt/normal-drivers)
    (testing "between"
      (is (= 89
             (count-with-filter-clause [:not [:between $id 30 40]]))))))

(deftest ^:parallel not-filter-test-9
  (mt/test-drivers (mt/normal-drivers)
    (testing "inside"
      (is (= 39
             (count-with-filter-clause [:not [:inside $latitude $longitude 40 -120 30 -110]]))))))

(deftest ^:parallel not-filter-test-10
  (mt/test-drivers (mt/normal-drivers)
    (testing "starts-with"
      (is (= 80
             (count-with-filter-clause [:not [:starts-with $name "T"]]))))))

(deftest ^:parallel not-filter-test-11
  (mt/test-drivers (mt/normal-drivers)
    (testing "contains"
      (is (= 97
             (count-with-filter-clause [:not [:contains $name "BBQ"]]))))))

(deftest ^:parallel not-filter-test-12
  (mt/test-drivers (mt/normal-drivers)
    (testing "does-not-contain"
      (is (= 97
             (count-with-filter-clause [:does-not-contain $name "BBQ"]))
          "sanity check — does-not-contain should get converted to `:not` + `:contains` by QP middleware"))))

(deftest ^:parallel not-filter-test-13
  (mt/test-drivers (mt/normal-drivers)
    (testing "ends-with"
      (is (= 87
             (count-with-filter-clause [:not [:ends-with $name "a"]]))))))

(deftest ^:parallel not-filter-test-14
  (mt/test-drivers (mt/normal-drivers)
    (testing "and"
      (is (= 98
             (count-with-filter-clause [:not [:and [:> $id 32] [:contains $name "BBQ"]]]))))))

(deftest ^:parallel not-filter-test-15
  (mt/test-drivers (mt/normal-drivers)
    (testing "or"
      (is (= 31
             (count-with-filter-clause [:not [:or [:> $id 32] [:contains $name "BBQ"]]]))))))

(deftest ^:parallel not-filter-test-16
  (mt/test-drivers (mt/normal-drivers)
    (testing "nested and/or"
      (is (= 96
             (count-with-filter-clause [:not [:or [:and [:> $id 32] [:< $id 35]] [:contains $name "BBQ"]]]))))))

(deftest ^:parallel not-filter-test-17
  (mt/test-drivers (mt/normal-drivers)
    (testing "nested not"
      (is (= 3
             (count-with-filter-clause [:not [:not [:contains $name "BBQ"]]]))))))

(deftest ^:parallel not-filter-test-18
  (mt/test-drivers (mt/normal-drivers)
    (testing "not nested inside and/or"
      (is (= 1
             (count-with-filter-clause [:and [:not [:> $id 32]] [:contains $name "BBQ"]]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Etc                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel etc-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset office-checkins
      (testing "make sure that filtering with timestamps truncating to minutes works (#4632)"
        (is (= 4
               (count-with-filter-clause checkins [:between
                                                   !minute.timestamp
                                                   "2019-01-01T12:30:00"
                                                   "2019-01-14"])))))))

(deftest ^:parallel etc-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "make sure that filtering with dates bucketing by weeks works (#4956)"
      (is (= 7
             (count-with-filter-clause checkins [:= !week.date "2015-06-21T07:00:00.000000000-00:00"]))))))

(deftest ^:parallel string-escape-test
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
            (testing (format "\nquery = %s" (pr-str (:query (qp.compile/compile-and-splice-parameters query))))
              ;; Mongo returns empty results if count is zero -- see #5419
              (is (= (if (and (= driver/*driver* :mongo)
                              (zero? expected-count))
                       []
                       [[expected-count]])
                     (mt/formatted-rows [int]
                       (qp/process-query query)))))))))))

(deftest ^:parallel string-escape-test-2
  ;; test `:sql` drivers that support native parameters
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (testing "Make sure we're not being too aggressive and encoding percent signs (e.g. SQL `LIKE`)"
      (is (= [[1]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :filter      [:starts-with $name "In-N-Out"]})))))))

(deftest ^:parallel automatically-parse-strings-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "The QP should automatically parse String parameters in filter clauses to the correct type"
      (testing "String parameter to an Integer Field"
        (is (= (mt/rows (mt/run-mbql-query venues {:filter [:= $price 4] :order-by [[:asc $id]]}))
               (mt/rows (mt/run-mbql-query venues {:filter [:= $price "4"] :order-by [[:asc $id]]}))))))))

;; For the tests below:
;;
;; - there are 415 regions, and 8 have a `nil` name; 407 have non-empty, non-nil names
;; - there are 601 airports, and 1 has a `""` code; 600 have non-empty, non-nil codes

(deftest ^:parallel text-equals-nil-empty-string-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":= against a text column should match the correct columns when value is"
        (testing "nil"
          (is (= [[8]]
                 (mt/formatted-rows [int]
                   (mt/run-mbql-query region {:aggregation [:count], :filter [:= $name nil]})))))))))

(deftest ^:parallel text-equals-nil-empty-string-test-2
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":= against a text column should match the correct columns when value is"
        (testing "nil"
          (testing "an empty string (#13158)"
            (is (= [[1]]
                   (mt/formatted-rows [int]
                     (mt/run-mbql-query airport {:aggregation [:count], :filter [:= $code ""]}))))))))))

(deftest ^:parallel text-not-equals-nil-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":!= against a nil/NULL in a text column should be truthy"
        (testing "should match non-nil, non-empty strings"
          (is (= [[414]]
                 (mt/formatted-rows [int]
                   (mt/run-mbql-query region {:aggregation [:count], :filter [:!= $name "California"]})))))))))

(deftest ^:parallel text-not-equals-nil-test-2
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":!= against a nil/NULL in a text column should be truthy"
        (testing "should match non-nil, non-empty strings"
          (is (= [[600]]
                 (mt/formatted-rows [int]
                   (mt/run-mbql-query airport {:aggregation [:count], :filter [:!= $code "SFO"]})))))))))

(deftest ^:parallel is-empty-not-empty-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":is-empty and :not-empty filters should work correctly (#13158)"
        (testing :is-empty
          (testing "should match nil strings"
            (is (= [[8]]
                   (mt/formatted-rows [int]
                     (mt/run-mbql-query region {:aggregation [:count], :filter [:is-empty $name]}))))))))))

(deftest ^:parallel is-empty-not-empty-test-2
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":is-empty and :not-empty filters should work correctly (#13158)"
        (testing :is-empty
          (testing "should match EMPTY strings"
            (is (= [[1]]
                   (mt/formatted-rows [int]
                     (mt/run-mbql-query airport {:aggregation [:count], :filter [:is-empty $code]}))))))))))

(deftest ^:parallel is-empty-not-empty-test-3
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":is-empty and :not-empty filters should work correctly (#13158)"
        (testing :not-empty
          (testing "should match non-nil, non-empty strings"
            (is (= [[407]]
                   (mt/formatted-rows [int]
                     (mt/run-mbql-query region {:aggregation [:count], :filter [:not-empty $name]}))))))))))

(deftest ^:parallel is-empty-not-empty-test-4
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset airports
      (testing ":is-empty and :not-empty filters should work correctly (#13158)"
        (testing :not-empty
          (testing "should match non-nil, non-empty strings"
            (is (= [[600]]
                   (mt/formatted-rows [int]
                     (mt/run-mbql-query airport {:aggregation [:count], :filter [:not-empty $code]}))))))))))

(deftest ^:parallel is-empty-not-empty-with-not-emptyable-args-test
  (mt/test-drivers
   ;; TODO: Investigate how to make the test work with Athena!
   (disj (mt/normal-drivers) :athena)
   (mt/dataset
    test-data-null-date
    (testing ":is-empty works with not emptyable type argument (#40883)"
      (is (= [[1 1]]
             (mt/formatted-rows
              [int int]
              (mt/run-mbql-query
               checkins
               {:expressions {"caseExpr" [:case
                                          [[[:is-empty [:field %null_only_date {:base-type :type/Date}]] 1]]
                                          {:default 0}]}
                :fields [$id [:expression "caseExpr"]]
                :order-by [[$id :asc]]
                :limit 1})))))
    (testing ":not-empty works with not emptyable type argument (#40883)"
      (is (= [[1 0]]
             (mt/formatted-rows
              [int int]
              (mt/run-mbql-query
               checkins
               {:expressions {"caseExpr" [:case
                                          [[[:not-empty [:field %null_only_date {:base-type :type/Date}]] 1]]
                                          {:default 0}]}
                :fields [$id [:expression "caseExpr"]]
                :order-by [[$id :asc]]
                :limit 1})))))
    (testing (str "nil base-type arg of :not-empty should behave as not emptyable")
      (is (= [[1 1]]
             (mt/formatted-rows
              [int int]
              (mt/run-mbql-query
               checkins
               {:expressions {"caseExpr" [:case
                                          [[[:is-empty [:field %null_only_date nil]] 1]]
                                          {:default 0}]}
                :fields [$id [:expression "caseExpr"]]
                :order-by [[$id :asc]]
                :limit 1}))))))))

(deftest ^:parallel order-by-nulls-test
  (testing "Check that we can sort by numeric columns that contain NULLs (#6615)"
    (mt/dataset daily-bird-counts
      (mt/test-drivers (mt/normal-drivers)
        ;; the rows returned should be the ones with a nil count, in increasing ID order
        (is (= (if (mt/sorts-nil-first? driver/*driver* :type/Integer)
                 ;; if nils come first, we expect the first three rows having a nil count, in id ascending order
                 [[1 "2018-09-20T00:00:00Z" nil]
                  [8 "2018-09-27T00:00:00Z" nil]
                  [15 "2018-10-04T00:00:00Z" nil]]
                 ;; if nils come last, we expect the first three rows having a count of 0, in id ascending order
                 [[2 "2018-09-21T00:00:00Z" 0]
                  [3 "2018-09-22T00:00:00Z" 0]
                  [9 "2018-09-28T00:00:00Z" 0]])
              (mt/formatted-rows [int identity int]
                (mt/run-mbql-query bird-count
                  {:order-by [[:asc $count] [:asc $id]]
                   :limit    3}))))))))

(deftest filter-on-specific-date-test
  (testing (str "Filtering on a specific date (DATE column) should work correctly regardless of report timezone/DB"
                " timezone support (#39769)")
    (mt/test-drivers (mt/normal-drivers)
      (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
        (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                                 (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                 {:database {:timezone "US/Pacific"}})
              checkins          (lib.metadata/table metadata-provider (mt/id :checkins))
              checkins-id       (lib.metadata/field metadata-provider (mt/id :checkins :id))
              checkins-date     (lib.metadata/field metadata-provider (mt/id :checkins :date))
              query             (-> (lib/query metadata-provider checkins)
                                    (lib/filter (lib/= checkins-date "2014-05-08"))
                                    (lib/order-by checkins-id)
                                    (lib/with-fields [checkins-id checkins-date]))
              preprocessed      (qp.preprocess/preprocess query)]
          ;; skip this test for drivers that don't create checkins.date as a `DATETIME` (or equivalent), since we can't
          ;; really expect DateTime-specific stuff to work correctly. MongoDB is one example, since BSON only has the
          ;; one `org.bson.BsonDateTime` type, and checkins.date is created as a `:type/Instant`
          (when (isa? (:base-type checkins-date) :type/Date)
            (testing (format "\ncheckins.date type info:\n%s"
                             (u/pprint-to-str
                              (select-keys checkins-date [:base-type :effective-type :database-type])))
              (testing "\nPreprocessing should give us a [:= field date] filter, not [:between field datetime datetime]"
                (is (=? {:query {:filter [:=
                                          [:field (mt/id :checkins :date) {:base-type #(isa? % :type/Date), :temporal-unit :default}]
                                          [:absolute-datetime #t "2014-05-08" :default]]}}
                        preprocessed)))
              (testing (format "\nPreprocessed =\n%s" (u/pprint-to-str preprocessed))
                (mt/with-native-query-testing-context query
                  (testing "Results: should return correct rows"
                    (is (= [[629 "2014-05-08T00:00:00-07:00"]
                            [733 "2014-05-08T00:00:00-07:00"]
                            [813 "2014-05-08T00:00:00-07:00"]]
                           ;; WRONG => [[991 "2014-05-09T00:00:00-07:00"]]
                           (mt/formatted-rows
                            [int str]
                            (qp/process-query query))))))))))))))

(deftest filter-on-specific-date-timestamptz-test
  (testing (str "Filtering on a specific date (TIMESTAMP WITH TIME ZONE column) should work correctly regardless of"
                " report timezone/DB timezone support (#39769)")
    (mt/test-drivers (mt/normal-drivers)
      (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
        (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                                 (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                 {:database {:timezone "US/Pacific"}})
              orders            (lib.metadata/table metadata-provider (mt/id :orders))
              orders-id         (lib.metadata/field metadata-provider (mt/id :orders :id))
              orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
              query             (-> (lib/query metadata-provider orders)
                                    (lib/filter (lib/= orders-created-at "2019-02-11"))
                                    (lib/order-by orders-id)
                                    (lib/with-fields [orders-id orders-created-at]))
              preprocessed      (qp.preprocess/preprocess query)]
          ;; only bother testing this on databases that have an actual `:type/DateTimeWithTZ` type e.g. `timestamp with
          ;; time zone`, we're not testing anything interesting in things like SQLite that just create regular datetime
          ;; columns here.
          (when (isa? (:base-type orders-created-at) :type/DateTimeWithTZ)
            (testing (format "\norders.created_at type info:\n%s"
                             (u/pprint-to-str
                              (select-keys orders-created-at [:base-type :effective-type :database-type])))
              (testing "\nPreprocessing should give us an optimized temporal filter"
                (is (=? {:query {:filter [:and
                                          [:>=
                                           [:field (:id orders-created-at) {:temporal-unit :default}]
                                           [:absolute-datetime #t "2019-02-11T00:00-08:00" :default]]
                                          [:<
                                           [:field (:id orders-created-at) {:temporal-unit :default}]
                                           [:absolute-datetime #t "2019-02-12T00:00-08:00" :default]]]}}
                        preprocessed)))
              (testing (format "\nPreprocessed =\n%s" (u/pprint-to-str preprocessed))
                (mt/with-native-query-testing-context query
                  (testing "Results: should return correct rows"
                    (let [results (qp/process-query query)]
                      (is (= [[1     "2019-02-11T13:40:27.892-08:00"]
                              [1560  "2019-02-11T05:35:50.709-08:00"]
                              [1768  "2019-02-11T16:22:03.679-08:00"]
                              [3057  "2019-02-11T11:01:05.112-08:00"]
                              [5334  "2019-02-11T07:20:25.814-08:00"]
                              [5902  "2019-02-11T01:16:45.812-08:00"]
                              [8154  "2019-02-11T07:31:06.657-08:00"]
                              [8592  "2019-02-11T06:00:37.007-08:00"]
                              [12089 "2019-02-11T04:08:01.067-08:00"]
                              [12560 "2019-02-11T18:05:40.702-08:00"]
                              [13398 "2019-02-11T07:53:09.529-08:00"]
                              [13404 "2019-02-11T23:47:23.748-08:00"]
                              [13528 "2019-02-11T23:39:11.61-08:00"]
                              [13771 "2019-02-11T19:55:32.041-08:00"]
                              [14334 "2019-02-11T13:49:10.115-08:00"]
                              [14607 "2019-02-11T06:31:17.147-08:00"]
                              [14615 "2019-02-11T05:04:04.546-08:00"]
                              [15385 "2019-02-11T07:17:31.071-08:00"]
                              [16099 "2019-02-11T02:40:38.227-08:00"]
                              [18503 "2019-02-11T08:57:06.93-08:00"]]
                             (mt/formatted-rows
                              [int str]
                              results))))))))))))))

(deftest ^:parallel date-filter-on-datetime-column-test
  (testing "Filtering a DATETIME expression by a DATE literal string should do something sane (#17807)"
    (qp.store/with-metadata-provider (mt/id)
      (let [people     (lib.metadata/table (qp.store/metadata-provider) (mt/id :people))
            created-at (lib.metadata/field (qp.store/metadata-provider) (mt/id :people :created_at))
            query      (as-> (lib/query (qp.store/metadata-provider) people) query
                         (lib/expression query "CC Created At" created-at)
                         (lib/filter query (lib/=
                                            (lib/expression-ref query "CC Created At")
                                            "2017-10-07"))
                         (lib/aggregate query (lib/count)))]
        (testing (str "\nquery =\n" (u/pprint-to-str query))
          (mt/with-native-query-testing-context query
            (is (= [[2]]
                   (mt/rows (qp/process-query query))))))))))
