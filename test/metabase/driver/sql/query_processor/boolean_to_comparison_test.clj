(ns metabase.driver.sql.query-processor.boolean-to-comparison-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.boolean-to-comparison :as sql.qp.boolean-to-comparison]
   [metabase.test :as mt]))

(def ^:private true-value  [:value true  {:base_type :type/Boolean}])
(def ^:private false-value [:value false {:base_type :type/Boolean}])

(defn- basic-filter-query [expression]
  (mt/mbql-query venues
    {:expressions {"T" true-value, "F" false-value}
     :fields      [[:expression "T"] [:expression "F"]]
     :filter      expression}))

(deftest ^:parallel boolean->comparison-test
  (are [expression] (binding [sql.qp/*inner-query* (:query (basic-filter-query expression))]
                      (= [:= expression true]
                         (sql.qp.boolean-to-comparison/boolean->comparison expression)))
    false
    true
    true-value
    false-value
    [:expression "T"]
    [:expression "F"]
    [:field "some-bool" {:base-type :type/Boolean}]
    [:field 123 {:base-type :type/Boolean}]))

(deftest ^:parallel case-boolean->comparison
  (are [clause expected] (= expected
                            (sql.qp.boolean-to-comparison/case-boolean->comparison clause))
    [:case
     [[true true]
      [true-value true]
      [false false]
      [false-value false]]]
    [:case
     [[[:= true true] true]
      [[:= true-value true] true]
      [[:= false true] false]
      [[:= false-value true] false]]]))
