(ns metabase.query-processor-test.expressions-test
  "Tests for expressions (calculated columns)."
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.models.field :refer [Field]]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

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
                 {:expressions {:my_cool_new_field [:+ $price 2]}
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
                 {:expressions {:my_cool_new_field [:/ $price 2]}
                  :limit       3
                  :order-by    [[:asc $id]]})))))

    (testing "Make sure FLOATING POINT division is done when dividing by expressions/fields"
      (is (= [[0.6]
              [0.5]
              [0.5]]
             (mt/formatted-rows [1.0]
               (mt/run-mbql-query venues
                 {:expressions {:big_price         [:+ $price 2]
                                :my_cool_new_field [:/ $price [:expression "big_price"]]}
                  :fields      [[:expression "my_cool_new_field"]]
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

(deftest dont-return-expressions-if-fields-is-explicit-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    ;; bigquery doesn't let you have hypthens in field, table, etc names
    (let [priceplusone (if (= driver/*driver* :bigquery-cloud-sdk) "price_plus_1" "Price + 1")
          oneplusone   (if (= driver/*driver* :bigquery-cloud-sdk) "one_plus_one" "1 + 1")
          query        (mt/mbql-query venues
                         {:expressions {priceplusone [:+ $price 1]
                                        oneplusone   [:+ 1 1]}
                          :fields      [$price [:expression oneplusone]]
                          :order-by    [[:asc $id]]
                          :limit       3})]
      (testing "If an explicit `:fields` clause is present, expressions *not* in that clause should not come back"
        (is (= [[3 2] [2 2] [2 2]]
               (mt/formatted-rows [int int]
                 (qp/process-query query)))))

      (testing "If `:fields` is not explicit, then return all the expressions"
        (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3 4 2]
                [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 3 2]
                [3 "The Apple Pan"         11 34.0406 -118.428 2 3 2]]
               (mt/formatted-rows [int str int 4.0 4.0 int int int]
                 (qp/process-query (m/dissoc-in query [:query :fields]))))))

      (testing "When aggregating, expressions that aren't used shouldn't come back"
        (is (= [[2 22] [3 59] [4 13]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:expressions {priceplusone [:+ $price 1]
                                  oneplusone   [:+ 1 1]}
                    :aggregation [:count]
                    :breakout    [[:expression priceplusone]]
                    :order-by    [[:asc [:expression priceplusone]]]
                    :limit       3}))))))))

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
                  :order-by    [[:desc [:expression :x]]]})))))
    (testing "Can we refer to expressions inside an ORDER BY clause with a secondary order by?"
      (is (= [[81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4 85.0]
              [79 "Sushi Yasuda" 40 40.7514 -73.9736 4 83.0]
              [77 "Sushi Nakazawa" 40 40.7318 -74.0045 4 81.0]]
             (mt/formatted-rows [int str int 4.0 4.0 int float]
               (mt/run-mbql-query venues
                 {:expressions {:x [:+ $price $id]}
                  :limit       3
                  :order-by    [[:desc $price] [:desc [:expression :x]]]})))))))

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
      (let [cols (mt/cols
                  (mt/run-mbql-query venues
                    {:aggregation [[:aggregation-options [:sum [:* $price -1]] {:name "x"}]]
                     :breakout    [$category_id]}))]
        (testing (format "cols = %s" (u/pprint-to-str cols))
          (is (= #{"x" (mt/format-name "category_id")}
                 (set (map :name cols))))
          (let [name->base-type (into {} (map (juxt :name :base_type) cols))]
            (testing "x"
              (is (isa? (name->base-type "x")
                        :type/Number)))
            (testing "category_id"
              (is (isa? (name->base-type (mt/format-name "category_id"))
                        :type/Number)))))))))


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

(deftest ^:parallel nulls-and-zeroes-test
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :expressions)
                         ;; bigquery doesn't let you have hypthens in field, table, etc names
                         ;; therefore a different macro is tested in bigquery driver tests
                         :bigquery-cloud-sdk)
    (testing (str "hey... expressions should work if they are just a Field! (Also, this lets us take a peek at the "
                  "raw values being used to calculate the formulas below, so we can tell at a glance if they're right "
                  "without referring to the EDN def)")
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity $count))))

    (testing (str "do expressions automatically handle division by zero? Should return `nil` "
                    "in the results for places where that was attempted")
        (is (= [[nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [9.09] [7.14]]
               (calculate-bird-scarcity [:/ 100.0 $count]
                                        [:!= $count nil]))))

    (testing (str "do expressions handle division by `nil`? Should return `nil` in the results for places where that "
                  "was attempted")
      (is (= [[nil] [10.0] [12.5] [20.0] [20.0] [nil] [9.09] [7.14] [12.5] [7.14]]
             (calculate-bird-scarcity [:/ 100.0 $count]
                                      [:or
                                       [:= $count nil]
                                       [:!= $count 0]]))))

    (testing "can we handle BOTH NULLS AND ZEROES AT THE SAME TIME????"
        (is (= [[nil] [nil] [nil] [10.0] [12.5] [20.0] [20.0] [nil] [nil] [nil]]
               (calculate-bird-scarcity [:/ 100.0 $count]))))

    (testing "can we handle dividing by literal 0?"
        (is (= [[nil] [nil] [nil] [nil] [nil] [nil] [nil] [nil] [nil] [nil]]
               (calculate-bird-scarcity [:/ $count 0]))))

    (testing "ok, what if we use multiple args to divide, and more than one is zero?"
        (is (= [[nil] [nil] [nil] [1.0] [1.56] [4.0] [4.0] [nil] [nil] [nil]]
               (calculate-bird-scarcity [:/ 100.0 $count $count]))))

    (testing "are nulls/zeroes still handled appropriately when nested inside other expressions?"
        (is (= [[nil] [nil] [nil] [20.0] [25.0] [40.0] [40.0] [nil] [nil] [nil]]
               (calculate-bird-scarcity [:* [:/ 100.0 $count] 2]))))

    (testing (str "if a zero is present in the NUMERATOR we should return ZERO and not NULL "
                  "(`0 / 10 = 0`; `10 / 0 = NULL`, at least as far as MBQL is concerned)")
      (is (= [[nil] [0.0] [0.0] [1.0] [0.8] [0.5] [0.5] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:/ $count 10]))))

    (testing "can addition handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [20.0] [18.0] [15.0] [15.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:+ $count 10]))))

    (testing "can subtraction handle nulls & zeroes?"
      (is (= [[nil] [10.0] [10.0] [0.0] [2.0] [5.0] [5.0] [nil] [10.0] [10.0]]
             (calculate-bird-scarcity [:- 10 $count]))))

    (testing "can multiplications handle nulls & zeros?"
      (is (= [[nil] [0.0] [0.0] [10.0] [8.0] [5.0] [5.0] [nil] [0.0] [0.0]]
             (calculate-bird-scarcity [:* 1 $count]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      DATETIME EXTRACTION AND MANIPULATION                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- robust-dates
  [strs]
  ;; TIMEZONE FIXME — SQLite shouldn't return strings.
  (let [format-fn (if (= driver/*driver* :sqlite)
                    #(u.date/format-sql (t/local-date-time %))
                    u.date/format)]
    (for [s strs]
      [(format-fn (u.date/parse s "UTC"))])))

(deftest temporal-arithmetic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :date-arithmetics)
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
                     {:expressions {:prev_month [:+ !day.last_login [:interval -31 :day]]}
                      :fields      [[:expression :prev_month]]
                      :limit       3
                      :order-by    [[:asc $name]]})
                   mt/rows)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     JOINS                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest expressions+joins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :left-join :date-arithmetics)
    (testing "Do calculated columns play well with joins"
      (is (= "Simcha Yan"
             (-> (mt/run-mbql-query checkins
                   {:expressions {:prev_month [:+ $date [:interval -31 :day]]}
                    :fields      [[:field (mt/id :users :name) {:join-alias "users__via__user_id"}]
                                  [:expression :prev_month]]
                    :limit       1
                    :order-by    [[:asc $date]]
                    :joins       [{:strategy :left-join
                                   :source-table (mt/id :users)
                                   :alias        "users__via__user_id"
                                   :condition    [:=
                                                  $user_id
                                                  [:field (mt/id :users :id) {:join-alias "users__via__user_id"}]]}]})
                 mt/rows
                 ffirst))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 MISC BUG FIXES                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; need more fields than seq chunking size
(defrecord ^:private NoLazinessDatasetDefinition [num-fields])

(defn- no-laziness-dataset-definition-field-names [num-fields]
  (for [i (range num-fields)]
    (format "field_%04d" i)))

(defmethod mt/get-dataset-definition NoLazinessDatasetDefinition
  [{:keys [num-fields]}]
  (mt/dataset-definition
   (format "no-laziness-%d" num-fields)
   ["lots-of-fields"
    (concat
     [{:field-name "a", :base-type :type/Integer}
      {:field-name "b", :base-type :type/Integer}]
     (for [field (no-laziness-dataset-definition-field-names num-fields)]
       {:field-name (name field), :base-type :type/Integer}))
    ;; one row
    [(range (+ num-fields 2))]]))

(defn- no-laziness-dataset-definition [num-fields]
  (->NoLazinessDatasetDefinition num-fields))

;; Make sure no part of query compilation is lazy as that won't play well with dynamic bindings.
;; This is not an issue limited to expressions, but using expressions is the most straightforward
;; way to reproducing it.
(deftest no-lazyness-test
  ;; Sometimes Kondo thinks this is unused, depending on the state of the cache -- see comments in
  ;; [[hooks.metabase.test.data]] for more information. It's definitely used to.
  #_{:clj-kondo/ignore [:unused-binding]}
  (let [dataset-def (no-laziness-dataset-definition 300)]
    (mt/dataset dataset-def
      (let [query (mt/mbql-query lots-of-fields
                    {:expressions {:c [:+
                                       [:field (mt/id :lots-of-fields :a) nil]
                                       [:field (mt/id :lots-of-fields :b) nil]]}
                     :fields      (into [[:expression "c"]]
                                        (for [{:keys [id]} (t2/select [Field :id]
                                                             :table_id (mt/id :lots-of-fields)
                                                             :id       [:not-in #{(mt/id :lots-of-fields :a)
                                                                                  (mt/id :lots-of-fields :b)}]
                                                             {:order-by [[:name :asc]]})]
                                          [:field id nil]))})]
        (t2/with-call-count [call-count-fn]
          (mt/with-native-query-testing-context query
            (is (= 1
                   (-> (qp/process-query query) mt/rows ffirst))))
          (testing "# of app DB calls should not be some insane number"
            (is (< (call-count-fn) 20))))))))

(deftest expression-with-slashes
  (mt/test-drivers (disj
                     (mt/normal-drivers-with-feature :expressions)
                     ;; Slashes documented as not allowed in BQ
                     ;; https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical
                     :bigquery-cloud-sdk)
    (testing "Make sure an expression with a / in its name works (#12305)"
      (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3 4.0]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 3.0]
              [3 "The Apple Pan"         11 34.0406 -118.428 2 3.0]]
             (mt/formatted-rows [int str int 4.0 4.0 int float]
               (mt/run-mbql-query venues
                 {:expressions {:TEST/my-cool-new-field [:+ $price 1]}
                  :limit       3
                  :order-by    [[:asc $id]]})))))))

(deftest expression-using-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Can we use aggregations from previous steps in expressions (#12762)"
      (is (= [["20th Century Cafe" 2 2 0]
              [ "25°" 2 2 0]
              ["33 Taps" 2 2 0]]
             (mt/formatted-rows [str int int int]
               (mt/run-mbql-query venues
                 {:source-query {:source-table (mt/id :venues)
                                 :aggregation  [[:min (mt/id :venues :price)]
                                                [:max (mt/id :venues :price)]]
                                 :breakout     [[:field (mt/id :venues :name) nil]]
                                 :limit        3}
                  :expressions  {:price_range [:-
                                               [:field "max" {:base-type :type/Number}]
                                               [:field "min" {:base-type :type/Number}]]}})))))))

(deftest expression-with-duplicate-column-name
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "Can we use expression with same column name as table (#14267)"
      (mt/dataset sample-dataset
        (let [query (mt/mbql-query products
                      {:expressions {:CATEGORY [:concat $category "2"]}
                       :breakout    [:expression :CATEGORY]
                       :aggregation [:count]
                       :order-by    [[:asc [:expression :CATEGORY]]]
                       :limit       1})]
          (mt/with-native-query-testing-context query
            (is (= [["Doohickey2" 42]]
                   (mt/formatted-rows [str int]
                     (qp/process-query query))))))))))

(deftest fk-field-and-duplicate-names-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :foreign-keys)
    (testing "Expressions with `fk->` fields and duplicate names should work correctly (#14854)"
      (mt/dataset sample-dataset
        (let [results (mt/run-mbql-query orders
                        {:expressions {"CE" [:case
                                             [[[:> $discount 0] $created_at]]
                                             {:default $product_id->products.created_at}]}
                         :order-by    [[:asc $id]]
                         :limit       2})]
          (is (= ["ID" "User ID" "Product ID" "Subtotal" "Tax" "Total" "Discount" "Created At" "Quantity" "CE"]
                 (map :display_name (mt/cols results))))
          (is (= [[1 1  14  37.7  2.1  39.7 nil "2019-02-11T21:40:27.892Z" 2 "2017-12-31T14:41:56.87Z"]
                  [2 1 123 110.9  6.1 117.0 nil "2018-05-15T08:04:04.58Z"  3 "2017-11-16T13:53:14.232Z"]]
                 (mt/formatted-rows [int int int 1.0 1.0 1.0 identity str int str]
                   results))))))))

(deftest string-operations-from-subquery
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex)
    (testing "regex-match-first and replace work when evaluated against a subquery (#14873)"
      (mt/dataset test-data
        (let [r-word  "r_word"
              no-sp   "no_spaces"
              results (mt/run-mbql-query venues
                        {:expressions  {r-word [:regex-match-first $name "^R[^ ]+"]
                                        no-sp  [:replace $name " " ""]}
                         :source-query {:source-table $$venues}
                         :fields       [$name [:expression r-word] [:expression no-sp]]
                         :filter       [:= $id 1 95]
                         :order-by     [[:asc $id]]})]
          (is (= ["Name" r-word no-sp]
                 (map :display_name (mt/cols results))))
          (is (= [["Red Medicine" "Red" "RedMedicine"]
                  ["Rush Street" "Rush" "RushStreet"]]
                 (mt/formatted-rows [str str str] results))))))))

(deftest expression-name-weird-characters-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (testing "An expression whose name contains weird characters works properly"
      (let [query (mt/mbql-query venues
                   {:expressions {"Refund Amount (?)" [:* $price -1]}
                    :limit       1
                    :order-by    [[:asc $id]]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 -3]]
                 (mt/formatted-rows [int str int 4.0 4.0 int int]
                   (qp/process-query query)))))))))

(deftest join-table-on-itself-with-custom-column-test
  (testing "Should be able to join a source query against itself using an expression (#17770)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :expressions :left-join)
      (mt/dataset sample-dataset
        (let [query (mt/mbql-query nil
                      {:source-query {:source-query {:source-table $$products
                                                     :aggregation  [[:count]]
                                                     :breakout     [$products.category]}
                                      :expressions  {:CC [:+ 1 1]}}
                       :joins        [{:source-query {:source-query {:source-table $$products
                                                                     :aggregation  [[:count]]
                                                                     :breakout     [$products.category]}
                                                      :expressions  {:CC [:+ 1 1]}}
                                       :alias        "Q1"
                                       :condition    [:=
                                                      [:field "CC" {:base-type :type/Integer}]
                                                      [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]
                                       :fields       :all}]
                       :order-by     [[:asc $products.category]
                                      [:desc [:field "count" {:base-type :type/Integer}]]
                                      [:asc &Q1.products.category]]
                       :limit        1})]
          (mt/with-native-query-testing-context query
            ;; source.category, source.count, source.CC, Q1.category, Q1.count, Q1.CC
            (is (= [["Doohickey" 42 2 "Doohickey" 42 2]]
                   (mt/formatted-rows [str int int str int int]
                     (qp/process-query query))))))))))

(deftest nested-expressions-with-existing-names-test
  (testing "Expressions with the same name as existing columns should work correctly in nested queries (#21131)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :expressions)
      (mt/dataset sample-dataset
        (doseq [expression-name ["PRICE" "price"]]
          (testing (format "Expression name = %s" (pr-str expression-name))
            (let [query (mt/mbql-query products
                          {:source-query {:source-table $$products
                                          :expressions  {expression-name [:+ $price 2]}
                                          :fields       [$id $price [:expression expression-name]]
                                          :order-by     [[:asc $id]]
                                          :limit        2}})]
              (mt/with-native-query-testing-context query
                (is (= [[1 29.46 31.46] [2 70.08 72.08]]
                       (mt/formatted-rows [int 2.0 2.0]
                         (qp/process-query query))))))))))))
