(ns metabase.app-db.sql-errors-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.sql-errors :as sql-errors])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(deftest ^:parallel row-rejected?-test
  (testing "data exceptions and integrity-constraint violations mean the app DB rejected a row"
    (are [state] (true? (sql-errors/row-rejected? (SQLException. "rejected" state)))
      "22001" "22003" "22007" "23000" "23502" "23505"))
  (testing "a rejected row is found through causes and JDBC next-exception links"
    (is (true? (sql-errors/row-rejected? (ex-info "outer" {} (SQLException. "too long" "22001")))))
    (is (true? (sql-errors/row-rejected? (doto (SQLException. "batch failed" "HY000")
                                           (.setNextException (SQLException. "too long" "22001")))))))
  (testing "connection failures, timeouts, and other errors do not mean a row was rejected"
    (are [e] (false? (sql-errors/row-rejected? e))
      (SQLException. "connection refused" "08001")
      (java.sql.SQLTransientConnectionException. "pool checkout timed out")
      (SQLException. "syntax" "42000")
      (SQLException. "no state")
      (ex-info "plain" {}))))
