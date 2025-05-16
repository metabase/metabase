(ns metabase.driver.sql.query-processor.boolean-to-comparison-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.boolean-to-comparison :as sql.qp.boolean-to-comparison]
   [metabase.test :as mt]))

(def ^:private true-value  [:value true  {:base_type :type/Boolean}])
(def ^:private false-value [:value false {:base_type :type/Boolean}])
(def ^:private int-value   [:value 1     {:base_type :type/Integer}])

(defn- basic-filter-query [expression]
  (mt/mbql-query venues
    {:expressions {"T" true-value, "F" false-value, "I" int-value}
     :fields      [[:expression "T"] [:expression "F"] [:expression "I"]]
     :filter      expression}))

(defn- nested-filter-query [expression]
  (mt/nest-query (basic-filter-query expression) 4))

(deftest ^:parallel boolean->comparison-test
  (are [clause] (binding [sql.qp/*inner-query* (:query (basic-filter-query clause))]
                  (= [:= clause true]
                     (sql.qp.boolean-to-comparison/boolean->comparison clause)))
    false
    true
    true-value
    false-value
    [:value true nil]
    [:expression "T"]
    [:expression "F"]
    [:field "some-bool" {:base-type :type/Boolean}]
    [:field 123 {:base-type :type/Boolean}]))

(deftest ^:parallel non-boolean->comparison-test
  (are [clause] (binding [sql.qp/*inner-query* (:query (basic-filter-query clause))]
                  (= clause
                     (sql.qp.boolean-to-comparison/boolean->comparison clause)))
    0
    1
    "not a boolean"
    [:value 1 nil]
    [:expression "I"]
    [:field "some-int" {:base-type :type/Integer}]
    [:field 123 {:base-type :type/Integer}]))

(deftest ^:parallel boolean-expression-clause?-test
  (are [clause] (binding [sql.qp/*inner-query* (:query (basic-filter-query clause))]
                  (sql.qp.boolean-to-comparison/boolean-expression-clause? clause))
    [:expression "T"]
    [:expression "F"]))

(deftest ^:parallel nested-boolean-expression-clause?-test
  (are [clause] (binding [sql.qp/*inner-query* (:query (nested-filter-query clause))]
                  (sql.qp.boolean-to-comparison/boolean-expression-clause? clause))
    [:expression "T"]
    [:expression "F"]))

(deftest ^:parallel non-boolean-expression-clause?-test
  (are [clause] (binding [sql.qp/*inner-query* (:query (basic-filter-query clause))]
                  (not (sql.qp.boolean-to-comparison/boolean-expression-clause? clause)))
    0
    1
    "not a boolean"
    [:value 1 nil]
    [:expression "I"]
    [:field "some-int" {:base-type :type/Integer}]
    [:field "some-bool" {:base-type :type/Boolean}]
    [:field 123 {:base-type :type/Integer}]
    [:field 234 {:base-type :type/Boolean}]))

(deftest ^:parallel case-boolean->comparison
  (are [clause expected] (= expected
                            (sql.qp.boolean-to-comparison/case-boolean->comparison clause))
    [:case
     [[true true]
      [true-value true]
      [false false]
      [false-value false]
      [[:= true false] false]
      [[:= 1 2] false]]]
    [:case
     [[[:= true true] true]
      [[:= true-value true] true]
      [[:= false true] false]
      [[:= false-value true] false]
      [[:= true false] false]
      [[:= 1 2] false]]]))
