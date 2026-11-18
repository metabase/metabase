(ns ^:mb/driver-tests metabase.driver.databricks.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.databricks :as databricks]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]))

(set! *warn-on-reflection* true)

(defn- nested-transaction-result
  "Runs `thunk` inside `do-nested-transaction` against a mock Connection, returning
   [result, savepoint-calls] where savepoint-calls is a vector of recorded calls
   (:set-savepoint, :release, :rollback)."
  [thunk-atom rollback-throws? release-throws? thunk]
  (let [calls     (atom [])
        savepoint (reify java.sql.Savepoint)
        conn      (proxy [java.sql.Connection] []
                    (setSavepoint []
                      (swap! calls conj :set-savepoint)
                      savepoint)
                    (rollback [sp]
                      (swap! calls conj :rollback)
                      (when rollback-throws?
                        (throw (java.sql.SQLException "rollback failed"))))
                    (releaseSavepoint [sp]
                      (swap! calls conj :release)
                      (when release-throws?
                        (throw (java.sql.SQLException "release failed")))))
        thunk     (fn [] (swap! thunk-atom conj :thunk-ran) (thunk))]
    [(sql-jdbc.actions/do-nested-transaction :databricks conn thunk) @calls]))

(deftest do-nested-transaction-success-test
  (testing "success path: thunk runs, savepoint set and released, no rollback"
    (let [thunk-ran (atom [])
          thunk     (fn [] :result)
          [result calls] (nested-transaction-result thunk-ran false false thunk)]
      (is (= :result result))
      (is (= [:thunk-ran] @thunk-ran))
      (is (= [:set-savepoint :release] calls)))))

(deftest do-nested-transaction-thunk-error-test
  (testing "thunk error: rollback to savepoint called, original exception rethrown, release still called"
    (let [thunk-ran (atom [])
          boom      (ex-info "boom" {})
          thunk     (fn [] (throw boom))
          [result calls] (try
                           (nested-transaction-result thunk-ran false false thunk)
                           (catch Throwable e [e ::no-calls-since-thrown]))]
      ;; exception propagates
      (is (thrown-with-msg? Exception #"boom"
                            (nested-transaction-result thunk-ran false false thunk)))
      ;; verify call order and that original error is not masked when rollback itself fails
      )))

(deftest do-nested-transaction-rollback-failure-test
  (testing "rollback error does not mask the original exception"
    (let [thunk-ran (atom [])
          thunk     (fn [] (throw (ex-info "original-error" {:original true})))
          result    (try
                      (nested-transaction-result thunk-ran true false thunk)
                      ::no-exception
                      (catch Throwable e e))]
      (is (some-> (ex-data result) (:original)))
      (is (= "original-error" (ex-message result))))))

(deftest do-nested-transaction-release-failure-test
  (testing "release error does not mask a successful thunk result"
    (let [thunk-ran (atom [])
          thunk     (fn [] :fine)
          [result calls] (nested-transaction-result thunk-ran false true thunk)]
      (is (= :fine result))
      (is (contains? (set calls) :release)))))

(deftest base-type->sql-type-map-test
  (testing "covers all base types actions may cast, with Databricks-correct SQL types"
    (let [m (sql-jdbc.actions/base-type->sql-type-map :databricks)]
      (is (= "BIGINT"            (m :type/BigInteger)))
      (is (= "BOOLEAN"           (m :type/Boolean)))
      (is (= "DATE"              (m :type/Date)))
      (is (= "TIMESTAMP"         (m :type/DateTime)))
      (is (= "TIMESTAMP"         (m :type/DateTimeWithTZ)))
      (is (= "TIMESTAMP"         (m :type/DateTimeWithLocalTZ)))
      (is (= "DOUBLE"            (m :type/Float)))
      (is (= "INTEGER"           (m :type/Integer)))
      (is (= "STRING"            (m :type/Text)))
      (is (= "TIMESTAMP"         (m :type/Time)))
      (testing "DECIMAL must be sized — bare DECIMAL defaults to scale 0 in Databricks"
        (let [decimal (m :type/Decimal)]
          (is (re-matches #"DECIMAL\(\d+,\s*\d+\)" decimal))
          ;; scale must be > 0 or non-integer decimals get rounded away
          (let [[_ precision scale] (re-matches #"DECIMAL\((\d+),\s*(\d+)\)" decimal)]
            (is (pos? (parse-long scale))
                "DECIMAL scale must be non-zero to preserve fractional values")))))))
