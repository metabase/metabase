(ns ^:mb/driver-tests metabase.driver.sql-jdbc.execute-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.sql Connection DatabaseMetaData)
   (javax.sql DataSource)))

(deftest ^:parallel ConnectionOptions-test
  (are [options error] (= error
                          (me/humanize (mr/explain sql-jdbc.execute/ConnectionOptions options)))
    nil                              nil
    {}                               nil
    {:session-timezone nil}          nil
    {:session-timezone "US/Pacific"} nil
    {:session-timezone "X"}          {:session-timezone ["invalid timezone ID: \"X\"" "timezone offset string literal"]}))

(set! *warn-on-reflection* true)

#_(deftest connection-reuse-test
    (testing "resilient context reuses reconnected connections"
      (mt/test-drivers (descendants driver/hierarchy :sql-jdbc)
        (let [test-db-id (mt/id)  ;; Get the test database ID
              connection-count (volatile! 0)
              orig-do-with-resolved-connection-data-source @#'sql-jdbc.execute/do-with-resolved-connection-data-source]
          (with-redefs [sql-jdbc.execute/do-with-resolved-connection-data-source
                        (fn [driver db opts]
                        ;; Only count connections for our test database because on startup the audit-db will be
                        ;; synced, which causes this to fail intermittently because it creates connections (to db
                        ;; 13371337)
                          (if (= db test-db-id)
                            (reify javax.sql.DataSource
                              (getConnection [_]
                                (vswap! connection-count inc)
                                (.getConnection ^DataSource (orig-do-with-resolved-connection-data-source driver db opts))))
                          ;; For other databases (like audit DB), just pass through
                            (orig-do-with-resolved-connection-data-source driver db opts)))]
            (let [closed-conn (doto (.getConnection ^DataSource
                                     (orig-do-with-resolved-connection-data-source driver/*driver* test-db-id {}))
                                (.close))]
              (driver/do-with-resilient-connection
               driver/*driver* test-db-id
               (fn [driver _]
               ;; reinit, as we it has been used for setup
                 (vreset! connection-count 0)
                 (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
                 (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
                 (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
                 (is (= 1 @connection-count))
                 (.close (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn))
                 (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)
                 (is (= 2 @connection-count))))))))))

(deftest try-ensure-open-conn-sets-non-recursive-options-test
  (testing "try-ensure-open-conn! sets connection options as non-recursive"
    #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
    (mt/test-drivers (disj (descendants driver/hierarchy :sql-jdbc)
                           ;; too tricky to stub the connection
                           :presto-jdbc :databricks :starburst)
      (let [connection-option-calls (volatile! [])
            is-default-options
            (identical? (get-method sql-jdbc.execute/do-with-connection-with-options :sql-jdbc)
                        (get-method sql-jdbc.execute/do-with-connection-with-options driver/*driver*))

            orig-do-with-resolved-connection-data-source @#'sql-jdbc.execute/do-with-resolved-connection-data-source
            closed-conn (proxy [Connection] []
                          (isClosed [] true)
                          (close [] nil))

            new-conn (proxy [Connection] []
                       (isClosed [] false)
                       (close [] nil)
                       (isReadOnly [] true)
                       (getMetaData []
                         (reify DatabaseMetaData
                           (supportsTransactionIsolationLevel [_ _] false)))
                       (createStatement []
                         (reify java.sql.Statement
                           (execute [_ _] true)
                           (close [_] nil)))
                       (setReadOnly [read-only]
                         (vswap! connection-option-calls conj [:setReadOnly read-only]))
                       (setAutoCommit [auto-commit]
                         (vswap! connection-option-calls conj [:setAutoCommit auto-commit]))
                       (setTransactionIsolation [level]
                         (vswap! connection-option-calls conj [:setTransactionIsolation level]))
                       (setHoldability [holdability]
                         (vswap! connection-option-calls conj [:setHoldability holdability]))
                       (setNetworkTimeout [executor timeout-ms]
                         (vswap! connection-option-calls conj [:setNetworkTimeout timeout-ms])))]
        (with-redefs [sql-jdbc.execute/do-with-resolved-connection-data-source
                      (fn [driver db options]
                        (if (:keep-open? options)
                          (reify javax.sql.DataSource
                            (getConnection [_] new-conn))
                          (orig-do-with-resolved-connection-data-source driver db options)))

                      sql-jdbc.execute/recursive-connection?
                      (let [original-recursive-fn sql-jdbc.execute/recursive-connection?]
                        (fn []
                          (let [ret (original-recursive-fn)]
                            (vswap! connection-option-calls conj [:recursive-connection-check ret])
                            ret)))]

          (driver/do-with-resilient-connection
           driver/*driver* (mt/id)
           (fn [driver _db]
             (let [result (sql-jdbc.execute/try-ensure-open-conn! driver closed-conn)]
               ;; Should return the new connection
               (is (identical? new-conn result))

               (is (some #(= % [:recursive-connection-check false]) @connection-option-calls))

               ;; Should have set connection options (since it's non-recursive)
               (when is-default-options
                 (let [calls @connection-option-calls]
                   (is (some #(= [:setReadOnly true] %) calls))
                   (is (some #(= [:setAutoCommit true] %) calls))
                   (is (some #(= (first %) :setHoldability) calls))
                   (is (some #(= (first %) :setNetworkTimeout) calls))))))))))))

(deftest is-conn-open-test
  (testing "is-conn-open with valid check"
    (testing "returns true when connection is open and valid"
      (let [conn (reify Connection
                   (isClosed [_] false)
                   (isValid [_ _] true))]
        (is (true? (sql-jdbc.execute/is-conn-open? conn :check-valid? true)))))

    (testing "returns false when connection is closed"
      (let [conn (reify Connection
                   (isClosed [_] true)
                   (isValid [_ _] true))]
        (is (false? (sql-jdbc.execute/is-conn-open? conn :check-valid? true)))))

    (testing "closes connection and returns false when connection is open but not valid"
      (let [close-called? (atom false)
            conn (reify Connection
                   (isClosed [_] @close-called?)
                   (isValid [_ _] false)
                   (close [_] (reset! close-called? true)))]
        (is (false? (sql-jdbc.execute/is-conn-open? conn :check-valid? true)))
        (is (true? @close-called?) "Connection should be closed when invalid")
        (is (true? (.isClosed conn)))))))

(deftest statement-is-closed-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc})
    (testing "can check isClosed on statement"
      (when (driver/database-supports? driver/*driver* :jdbc/statements nil)
        (sql-jdbc.execute/do-with-connection-with-options
         driver/*driver* (mt/id) nil
         (fn [^Connection conn]
           (let [stmt (sql-jdbc.execute/statement driver/*driver* conn)]
             (is (false? (.isClosed stmt)))
             (.close stmt)
             (is (true? (.isClosed stmt))))))))
    (testing "can check isClosed on prepared statement"
      (sql-jdbc.execute/do-with-connection-with-options
       driver/*driver* (mt/id) nil
       (fn [^Connection conn]
         (let [prepared-stmt (sql-jdbc.execute/prepared-statement driver/*driver* conn "select 1" [])]
           (is (false? (.isClosed prepared-stmt)))
           (.close prepared-stmt)
           (is (true? (.isClosed prepared-stmt)))))))))
