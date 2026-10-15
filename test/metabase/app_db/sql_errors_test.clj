(ns metabase.app-db.sql-errors-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.sql-errors :as sql-errors])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(deftest ^:parallel error-kind-test
  (testing "missing tables"
    (are [state] (= :table-not-found (sql-errors/error-kind (SQLException. "missing" state)))
      "42P01" "42S02" "42S03" "42S04"))
  (testing "duplicate keys"
    (is (= :duplicate-key (sql-errors/error-kind (SQLException. "duplicate" "23505"))))
    (testing "MySQL and MariaDB report a catch-all state, disambiguated by the vendor code"
      (is (= :duplicate-key (sql-errors/error-kind (SQLException. "Duplicate entry" "23000" 1062))))
      (is (nil? (sql-errors/error-kind (SQLException. "Cannot add foreign key" "23000" 1452))))))
  (testing "unrecognized errors"
    (is (nil? (sql-errors/error-kind (SQLException. "syntax" "42000"))))
    (is (nil? (sql-errors/error-kind (SQLException. "no state"))))
    (is (nil? (sql-errors/error-kind (ex-info "plain" {}))))))

(deftest ^:parallel error-kind-cause-chain-test
  (testing "the first recognized cause wins, however deeply it is wrapped"
    (let [wrapped (ex-info "outer" {} (RuntimeException. "middle" (SQLException. "missing" "42P01")))]
      (is (= :table-not-found (sql-errors/error-kind wrapped)))
      (is (true? (sql-errors/table-not-found? wrapped)))))
  (testing "an unrecognized outer SQLException does not hide a recognized cause"
    (is (= :duplicate-key (sql-errors/error-kind (SQLException. "outer" "HY000" 0 (SQLException. "dup" "23505"))))))
  (testing "a chain with no recognized cause"
    (let [wrapped (ex-info "outer" {} (SQLException. "syntax" "42000"))]
      (is (nil? (sql-errors/error-kind wrapped)))
      (is (false? (sql-errors/table-not-found? wrapped))))))

(deftest ^:parallel error-kind-next-exception-chain-test
  (testing "a recognized JDBC sibling is reached through getNextException"
    (let [batch-error (doto (SQLException. "batch failed" "HY000")
                        (.setNextException (SQLException. "missing" "42S02")))]
      (is (= :table-not-found (sql-errors/error-kind batch-error)))
      (is (true? (sql-errors/table-not-found? batch-error)))))
  (testing "cycles across cause and next-exception links terminate"
    (let [outer (SQLException. "outer" "HY000")
          inner (SQLException. "inner" "42000" outer)]
      (.setNextException outer inner)
      (is (nil? (sql-errors/error-kind outer))))))
