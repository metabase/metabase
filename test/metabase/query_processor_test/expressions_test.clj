(ns metabase.query-processor-test.expressions-test
  "Tests for expressions (calculated columns)."
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.java.jdbc :as jdbc]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]
             [sync :as sync]
             [test :as mt]]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [metabase.util.date-2 :as u.date]))

(deftest basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Do a basic query including an expression"
      (is (= [[1 "Red Medicine"                 4  10.0646 -165.374 3 5.0]
              [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2 4.0]
              [3 "The Apple Pan"                11 34.0406 -118.428 2 4.0]
              [4 "Wurstküche"                   29 33.9997 -118.465 2 4.0]
              [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2 4.0]]
             (mt/formatted-rows [int str int 4.0 4.0 int float]
               (mt/run-mbql-query venues
                 {:expressions {:my-cool-new-field [:+ $price 2]}
                  :limit       5
                  :order-by    [[:asc $id]]})))))))

(deftest floating-point-division-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Make sure FLOATING POINT division is done"
      (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3 1.5] ; 3 / 2 SHOULD BE 1.5, NOT 1 (!)
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0]
              [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0]]
             (mt/formatted-rows [int str int 4.0 4.0 int float]
               (mt/run-mbql-query venues
                 {:expressions {:my-cool-new-field [:/ $price 2]}
                  :limit       3
                  :order-by    [[:asc $id]]})))))

    (testing "Make sure FLOATING POINT division is done when dividing by expressions/fields"
      (is (= [[0.6]
              [0.5]
              [0.5]]
             (mt/formatted-rows [1.0]
               (mt/run-mbql-query venues
                 {:expressions {:big-price         [:+ $price 2]
                                :my-cool-new-field [:/ $price [:expression "big-price"]]}
                  :fields      [[:expression "my-cool-new-field"]]
                  :limit       3
                  :order-by    [[:asc $id]]})))))))

(deftest nested-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Can we do NESTED EXPRESSIONS ?"
      (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3 3.0]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0]
              [3 "The Apple Pan"         11 34.0406 -118.428 2 2.0]]
             (mt/formatted-rows [int str int 4.0 4.0 int float]
               (mt/run-mbql-query venues
                 {:expressions {:wow [:- [:* $price 2] [:+ $price 0]]}
                  :limit       3
                  :order-by    [[:asc $id]]})))))))

(deftest multiple-expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Can we have MULTIPLE EXPRESSIONS?"
      (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3 2.0 4.0]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0 3.0]
              [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0 3.0]]
             (mt/formatted-rows [int str int 4.0 4.0 int float float]
               (mt/run-mbql-query venues
                 {:expressions {:x [:- $price 1]
                                :y [:+ $price 1]}
                  :limit       3
                  :order-by    [[:asc $id]]})))))))

(deftest expressions-in-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Can we refer to expressions inside a FIELDS clause?"
      (is (= [[4] [4] [5]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:expressions {:x [:+ $price $id]}
                  :fields      [[:expression :x]]
                  :limit       3
                  :order-by    [[:asc $id]]})))))))

(deftest expressions-in-order-by-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Can we refer to expressions inside an ORDER BY clause?"
      (is (= [[100 "Mohawk Bend"         46 34.0777 -118.265 2 102.0]
              [99  "Golden Road Brewing" 10 34.1505 -118.274 2 101.0]
              [98  "Lucky Baldwin's Pub"  7 34.1454 -118.149 2 100.0]]
             (mt/formatted-rows [int str int 4.0 4.0 int float]
               (mt/run-mbql-query venues
                 {:expressions {:x [:+ $price $id]}
                  :limit       3
                  :order-by    [[:desc [:expression :x]]]})))))))

(deftest aggregate-breakout-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Can we AGGREGATE + BREAKOUT by an EXPRESSION?"
      (is (= [[2 22] [4 59] [6 13] [8 6]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:expressions {:x [:* $price 2.0]}
                  :aggregation [[:count]]
                  :breakout    [[:expression :x]]})))))))

(deftest expressions-should-include-type-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Custom aggregation expressions should include their type"
      (is (= (conj #{{:name "x" :base_type (:base_type (qp.test/aggregate-col :sum :venues :price))}}
                   {:name      (mt/format-name "category_id")
                    :base_type (:base_type (qp.test/breakout-col :venues :category_id))})
             (set (map #(select-keys % [:name :base_type])
                       (mt/cols
                         (mt/run-mbql-query venues
                           {:aggregation [[:aggregation-options [:sum [:* $price -1]] {:name "x"}]]
                            :breakout    [$category_id]})))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           HANDLING NULLS AND ZEROES                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; "bird scarcity" is a scientific metric based on the number of birds seen in a given day
;; (at least for the purposes of the tests below)
;;
;; e.g. scarcity = 100.0 / num-birds
(defn- calculate-bird-scarcity* [formula filter-clause]
  (mt/formatted-rows [2.0]
    (mt/dataset daily-bird-counts
      (mt/run-mbql-query bird-count
        {:expressions {"bird-scarcity" formula}
         :fields      [[:expression "bird-scarcity"]]
         :filter      filter-clause
         :order-by    [[:asc $date]]
         :limit       10}))))

(defmacro ^:private calculate-bird-scarcity [formula & [filter-clause]]
  `(mt/dataset ~'daily-bird-counts
     (mt/$ids ~'bird-count
       (calculate-bird-scarcity* ~formula ~filter-clause))))

(deftest nulls-and-zeroes-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing (str "hey... expressions should work if they are just a Field! (Also, this lets us take a peek at the "
                  "raw values being used to calculate the formulas below, so we can tell at a glance if they're right "
                  "without referring to the EDN def)")
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:field-id $count]))))


    (testing (str "do expressions automatically handle division by zero? Should return `nil` in the results for places "
                  "where that was attempted")
      (is (= [[nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [9.09] [7.14]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]
                                      [:!= $count nil]))))


    (testing (str "do expressions handle division by `nil`? Should return `nil` in the results for places where that "
                  "was attempted")
      (is (= [[nil] [10.0] [12.5] [20.0] [20.0] [nil] [9.09] [7.14] [12.5] [7.14]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]
                                      [:or
                                       [:= $count nil]
                                       [:!= $count 0]]))))

    (testing "can we handle BOTH NULLS AND ZEROES AT THE SAME TIME????"
      (is (= [[nil] [nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count]]))))

    (testing "ok, what if we use multiple args to divide, and more than one is zero?"
      (is (= [[nil] [nil] [nil] [1.0] [1.56] [4.0] [4.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:/ 100.0 [:field-id $count] [:field-id $count]]))))

    (testing "are nulls/zeroes still handled appropriately when nested inside other expressions?"
      (is (= [[nil] [nil] [nil] [20.0] [25.0] [40.0] [40.0] [nil] [nil] [nil]]
             (calculate-bird-scarcity [:* [:/ 100.0 [:field-id $count]] 2]))))

    (testing (str "if a zero is present in the NUMERATOR we should return ZERO and not NULL "
                  "(`0 / 10 = 0`; `10 / 0 = NULL`, at least as far as MBQL is concerned)")
      (is (= [[nil] [0.0] [0.0] [1.0] [0.8] [0.5] [0.5] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:/ [:field-id $count] 10]))))

    (testing "can addition handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [20.0] [18.0] [15.0] [15.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:+ [:field-id $count] 10]))))

    (testing "can subtraction handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [0.0] [2.0] [5.0] [5.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:- 10 [:field-id $count]]))))


    (testing "can multiplications handle nulls & zeros?"
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:* 1 [:field-id $count]]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      DATETIME EXTRACTION AND MANIPULATION                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- maybe-truncate
  [dt]
  (if (= :sqlite driver/*driver*)
    (u.date/truncate dt :day)
    dt))

(defn- robust-dates
  [strs]
  ;; TIMEZONE FIXME — SQLite shouldn't return strings. And for whatever weird reason it's truncating to date as well?
  (let [format-fn (if (= driver/*driver* :sqlite)
                    #(u.date/format-sql (t/local-date-time (t/local-date %) (t/local-time 0)))
                    u.date/format)]
    (for [s strs]
      [(format-fn (u.date/parse s "UTC"))])))

(deftest temporal-arithmetic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Test that we can do datetime arithemtics using MBQL `:interval` clause in expressions"
      (is (= (robust-dates
              ["2014-09-02T13:45:00"
               "2014-07-02T09:30:00"
               "2014-07-01T10:30:00"])
             (mt/with-temporary-setting-values [report-timezone "UTC"]
               (-> (mt/run-mbql-query users
                     {:expressions {:prev_month [:+ $last_login [:interval -31 :day]]}
                      :fields      [[:expression :prev_month]]
                      :limit       3
                      :order-by    [[:asc $name]]})
                   mt/rows)))))
    (testing "Test interaction of datetime arithmetics with truncation"
      (is (= (robust-dates
              ["2014-09-02T00:00:00"
               "2014-07-02T00:00:00"
               "2014-07-01T00:00:00"])
             (mt/with-temporary-setting-values [report-timezone "UTC"]
               (-> (mt/run-mbql-query users
                     {:expressions {:prev_month [:+ [:datetime-field $last_login :day] [:interval -31 :day]]}
                      :fields      [[:expression :prev_month]]
                      :limit       3
                      :order-by    [[:asc $name]]})
                   mt/rows)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     JOINS                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest expressions+joins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :left-join)
    (testing "Do calculated columns play well with joins"
      (is (= "Simcha Yan"
             (-> (mt/run-mbql-query checkins
                   {:expressions {:prev_month [:+ $date [:interval -31 :day]]}
                    :fields      [[:joined-field "users__via__user_id" [:field-id (mt/id :users :name)]]
                                  [:expression :prev_month]]
                    :limit       1
                    :order-by    [[:asc $date]]
                    :joins       [{:strategy :left-join
                                   :source-table (mt/id :users)
                                   :alias        "users__via__user_id"
                                   :condition    [:= $user_id
                                                  [:joined-field "users__via__user_id" [:field-id (mt/id :users :id)]]]}]})
                 mt/rows
                 ffirst))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 MISC BUG FIXES                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure no part of query compilation is lazy as that won't play well with dynamic bindings.
;; This is not an issue limited to expressions, but using expressions is the most straightforward
;; way to reproducing it.
(deftest no-lazyness-test
  (one-off-dbs/with-blank-db
    (let [ ;; need more fields than seq chunking size
          fields (repeatedly 1000 gensym)]
      (doseq [statement ["drop table if exists \"LOTS_OF_FIELDS\";"
                         (format "create table \"LOTS_OF_FIELDS\" (a integer, b integer, %s);"
                                 (str/join ", " (for [field-name fields]
                                                  (str (name field-name) " integer"))))
                         (format "insert into \"LOTS_OF_FIELDS\" values(%s);"
                                 (str/join "," (range (+ (count fields) 2))))]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/db))
      (is (= 1
             (->> (mt/run-mbql-query lots_of_fields
                    {:expressions {:c [:+ [:field-id (mt/id :lots_of_fields :a)]
                                       [:field-id (mt/id :lots_of_fields :b)]]}
                     :fields      (concat [[:expression :c]]
                                          (for [field fields]
                                            [:field-id (mt/id :lots_of_fields (keyword field))]))})
                  (mt/formatted-rows [int])
                  ffirst))))))

;; Test for https://github.com/metabase/metabase/issues/12305
(deftest expression-with-slashes
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3 4.0]
            [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 3.0]
            [3 "The Apple Pan"         11 34.0406 -118.428 2 3.0]]
           (mt/formatted-rows [int str int 4.0 4.0 int float]
             (mt/run-mbql-query venues
               {:expressions {:TEST/my-cool-new-field [:+ $price 1]}
                :limit       3
                :order-by    [[:asc $id]]})))
        "Make sure an expression with a / in its name works")))
