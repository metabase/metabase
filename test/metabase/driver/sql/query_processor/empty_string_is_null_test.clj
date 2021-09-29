(ns metabase.driver.sql.query-processor.empty-string-is-null-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.query-processor.empty-string-is-null :as sql.qp.empty-string-is-null]))

(driver/register! ::test-driver, :parent #{::sql.qp.empty-string-is-null/empty-string-is-null :sql})

(deftest empty-string-is-null-test
  (are [s expected] (= expected
                       (sql.qp/->honeysql ::test-driver [:value s {}]))
    nil nil
    ""  nil
    ;; BLANK string = not nil
    " " " "
    "a" "a"))
