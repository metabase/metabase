(ns metabase.driver.sql.query-processor.boolean-is-comparison-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.boolean-is-comparison :as sql.qp.boolean-is-comparison]))

(driver/register! ::test-driver, :parent #{::sql.qp.boolean-is-comparison/boolean-is-comparison})

(defmethod sql.qp/->honeysql [::test-driver Boolean]
  [_ bool]
  (if bool 1 0))

(deftest ^:parallel boolean->comparison->honeysql-test
  (are [clause expected] (= expected
                            (sql.qp/->honeysql ::test-driver clause))
    false 0
    true  1

    [:and true false]
    [:and [:= 1 1] [:= 0 1]]

    [:or  true false]
    [:or  [:= 1 1] [:= 0 1]]

    [:and
     [:or false [:and true false]]
     [:and [:or true true] false]]
    [:and
     [:or [:= 0 1] [:and [:= 1 1] [:= 0 1]]]
     [:and [:or [:= 1 1] [:= 1 1]] [:= 0 1]]]

    [:case
     [[true true]
      [false false]]]
    [:case
     [:= 1 1] 1
     [:= 0 1] 0]))

(deftest ^:parallel boolean->comparison-apply-filter-clause-test
  (are [clause expected] (= expected
                            (sql.qp/apply-top-level-clause ::test-driver :filter {} {:filter clause}))
    true  {:where [:= 1 1]}
    false {:where [:= 0 1]}

    [:and true false]
    {:where [:and [:= 1 1] [:= 0 1]]}

    [:or  true false]
    {:where [:or  [:= 1 1] [:= 0 1]]}))
