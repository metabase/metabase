(ns metabase.app-db.transient-error-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.transient-error :as transient-error])
  (:import
   (java.sql SQLException)))

(deftest transient-error-h2-test
  (testing "H2 deadlock (error code 40001)"
    (is (transient-error/transient-error? :h2 (SQLException. "Deadlock" "40001" 40001))))
  (testing "H2 lock timeout (error code 50200)"
    (is (transient-error/transient-error? :h2 (SQLException. "Timeout" "HY000" 50200))))
  (testing "H2 non-transient error"
    (is (not (transient-error/transient-error? :h2 (SQLException. "Syntax error" "42000" 42000))))))

(deftest transient-error-postgres-test
  (testing "PostgreSQL deadlock (SQL state 40P01)"
    (is (transient-error/transient-error? :postgres (SQLException. "deadlock detected" "40P01"))))
  (testing "PostgreSQL serialization failure (SQL state 40001)"
    (is (transient-error/transient-error? :postgres (SQLException. "serialization failure" "40001"))))
  (testing "PostgreSQL lock timeout (SQL state 55P03)"
    (is (transient-error/transient-error? :postgres (SQLException. "lock not available" "55P03"))))
  (testing "PostgreSQL non-transient error"
    (is (not (transient-error/transient-error? :postgres (SQLException. "unique violation" "23505"))))))

(deftest transient-error-mysql-test
  (testing "MySQL deadlock (error code 1213)"
    (is (transient-error/transient-error? :mysql (SQLException. "Deadlock" "40001" 1213))))
  (testing "MySQL lock wait timeout (error code 1205)"
    (is (transient-error/transient-error? :mysql (SQLException. "Lock wait timeout" "HY000" 1205))))
  (testing "MySQL non-transient error"
    (is (not (transient-error/transient-error? :mysql (SQLException. "Duplicate entry" "23000" 1062))))))

(deftest transient-error-cause-chain-test
  (testing "Walks cause chain to find transient error"
    (let [sql-ex  (SQLException. "Deadlock" "40001" 40001)
          wrapper (ex-info "wrapped" {} sql-ex)]
      (is (transient-error/transient-error? :h2 wrapper))))
  (testing "Non-transient cause chain"
    (let [sql-ex  (SQLException. "Syntax error" "42000" 42000)
          wrapper (ex-info "wrapped" {} sql-ex)]
      (is (not (transient-error/transient-error? :h2 wrapper)))))
  (testing "No SQLException in chain"
    (is (not (transient-error/transient-error? :h2 (ex-info "plain error" {}))))))
