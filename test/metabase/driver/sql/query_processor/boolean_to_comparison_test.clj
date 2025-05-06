(ns metabase.driver.sql.query-processor.boolean-to-comparison-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.boolean-to-comparison :as sql.qp.boolean-to-comparison]
   [metabase.driver.sql.util :as sql.u]
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

(driver/register! ::test-driver, :parent #{:sql})

(defmethod sql.qp/->honeysql [::test-driver Boolean]
  [_ bool]
  (if bool 1 0))

(deftest ^:parallel logical-op->honeysql-test
  (are [clause expected] (= expected
                            (-> (sql.u/->honeysql-parent-method ::test-driver :sql clause)
                                (sql.qp.boolean-to-comparison/logical-op->honeysql clause)))
    [:and true false]
    [:and [:= 1 1] [:= 0 1]]

    [:and true-value false-value]
    [:and [:= 1 1] [:= 0 1]]

    [:or true false]
    [:or [:= 1 1] [:= 0 1]]

    [:or true-value false-value]
    [:or [:= 1 1] [:= 0 1]]

    [:not true]
    [:not [:= 1 1]]

    [:not false]
    [:not [:= 0 1]]

    [:not true-value]
    [:not [:= 1 1]]

    [:not false-value]
    [:not [:= 0 1]]))

(deftest ^:parallel case->honeysql-test
  (are [clause expected] (= expected
                            (-> (sql.u/->honeysql-parent-method ::test-driver :sql clause)
                                (sql.qp.boolean-to-comparison/case->honeysql clause)))
    [:case
     [[true true]
      [true-value true]
      [false false]
      [false-value false]]]
    [:case
     [:= 1 1] 1
     [:= 1 1] 1
     [:= 0 1] 0
     [:= 0 1] 0]))
