(ns metabase.app-db.connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (java.util.concurrent Semaphore)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(use-fixtures
  :once
  (fixtures/initialize :db))

(deftest nested-transaction-test
  (let [user-1                    (mt/random-email)
        user-2                    (mt/random-email)
        user-exists?              (fn [email]
                                    (t2/exists? :model/User :email email))
        create-user!              (fn [email]
                                    (t2/insert! :model/User (assoc (mt/with-temp-defaults :model/User) :email email)))
        transaction-exception     (Exception. "(Abort the current transaction)")
        is-transaction-exception? (fn is-transaction-exception? [e]
                                    (or (identical? e transaction-exception)
                                        (some-> (ex-cause e) is-transaction-exception?)))
        do-in-transaction         (fn [thunk]
                                    (try
                                      (t2/with-transaction []
                                        (thunk))
                                      (catch Throwable e
                                        (when-not (is-transaction-exception? e)
                                          (throw e)))))]
    (testing "inside transaction"
      (do-in-transaction
       (fn []
         (create-user! user-1)
         (is (user-exists? user-1))
         (testing "inside nested transaction"
           ;; do this on a separate thread to make sure we're not deadlocking, see
           ;; https://github.com/seancorfield/next-jdbc/issues/244
           (let [futur (future
                         (do-in-transaction
                          (fn []
                            (create-user! user-2)
                            (is (user-exists? user-2))
                            (throw transaction-exception))))]
             (is (not= ::timed-out
                       (deref futur 1000 ::timed-out)))))
         (testing "nested transaction aborted"
           (is (user-exists? user-1))
           (is (not (user-exists? user-2)))
           (throw transaction-exception)))))
    (testing "top-level transaction aborted"
      (is (not (user-exists? user-1)))
      (is (not (user-exists? user-2))))
    (testing "make sure we set autocommit back after the transaction"
      (t2/with-connection [^java.sql.Connection conn]
        (t2/with-transaction [_t-conn conn]
          ;; dummy op
          (is (false? (.getAutoCommit conn))))
        ;; On a Postgres app DB the connection runs with autoCommit off for its whole scope (so SELECTs stream from a
        ;; cursor); on H2/MySQL the transaction restores the JDBC default of true.
        (is (= (not= (mdb.connection/db-type) :postgres)
               (.getAutoCommit conn)))))
    (testing "throw error when trying to create nested transaction when nested-transaction-rule=:prohibit"
      (t2/with-connection [conn]
        (t2/with-transaction [t-conn conn]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Attempted to create nested transaction with :nested-transaction-rule set to :prohibit"
               (t2/with-transaction [_ t-conn {:nested-transaction-rule :prohibit}]))))))
    (testing "reuse transaction when creating nested transaction with nested-transaction-rule=:ignore"
      (is (not (user-exists? user-1)))
      (try
        ;; the top-level transaction cleans up everything
        (t2/with-transaction []
          ;; This transaction doesn't modify the DB. It catches the exception
          ;; from the nested transaction and sees its change because the nested
          ;; transaction doesn't set any new savepoint.
          (t2/with-transaction [t-conn]
            (try
              (t2/with-transaction [_ t-conn {:nested-transaction-rule :ignore}]
                ;; Create a user...
                (create-user! user-1)
                (is (user-exists? user-1))
                ;; and fail.
                (throw transaction-exception))
              (catch Exception e
                (when-not (is-transaction-exception? e)
                  (throw e)))))
          ;; this user has not been rolled back because of :ignore
          (is (user-exists? user-1))
          (throw transaction-exception))
        (catch Exception e
          (when-not (is-transaction-exception? e)
            (throw e))))
      (is (not (user-exists? user-1))))
    (testing "nested transaction anomalies -- this is not desired behavior"
      (testing "commit and rollback"
        (try
          (t2/with-transaction []
            (let [finished1 (Semaphore. 0)
                  finished2 (Semaphore. 0)
                  futur1 (future
                           (do-in-transaction
                            (fn []
                              (create-user! user-1)
                              (is (user-exists? user-1))
                              (.release finished1)
                              (.acquire finished2)
                              (throw transaction-exception))))
                  futur2 (future
                           (.acquire finished1)
                           (do-in-transaction
                            (fn []
                              ;; can see uncommited change
                              (is (user-exists? user-1))
                              (create-user! user-2)
                              (is (user-exists? user-2))))
                           (.release finished2))]
              @futur2
              @futur1)
            (is (not (user-exists? user-1)))
            ;; "committed" change has been rolled back
            (is (not (user-exists? user-2)))
            (throw transaction-exception))
          (catch Exception e
            (when-not (is-transaction-exception? e)
              (throw e))))))))

(deftest ^:parallel transaction-isolation-level-test
  (testing "We should always use READ_COMMITTED for the app DB (#44505)"
    (with-open [conn (.getConnection mdb.connection/*application-db*)]
      (is (= java.sql.Connection/TRANSACTION_READ_COMMITTED
             (.getTransactionIsolation conn))))))

(deftest rollback-error-handling
  (testing "rollback error handling"
    (let [mock-conn (reify Connection
                      (rollback [_ _savepoint]
                        (throw (ex-info "Rollback error" {})))
                      (setAutoCommit [_ _])
                      (getAutoCommit [_] true)
                      (setSavepoint [_])
                      (commit [_]))]
      (binding [t2.connection/*current-connectable* mock-conn]
        (let [e (is (thrown? Exception
                             (t2/with-transaction [_t-conn] (throw (ex-info "Original error" {})))))]
          (is (= "Error rolling back after previous error: Original error" (ex-message e)))
          (is (= "Rollback error" (-> e ex-data :rollback-error ex-message)))
          (is (= "Original error" (-> e ex-cause ex-message))))))))

(deftest exception-when-resetting-autocommit-does-not-mask-original-exception-test
  (testing "when setAutoCommit fails in finally block, the original exception is not masked"
    (let [msg "Original transaction error"
          autocommit-reset-called (volatile! false)
          mock-conn  (reify Connection
                       (rollback [_ _savepoint])
                       (setAutoCommit [_ value]
                         (when value
                           (vreset! autocommit-reset-called true)
                           ;; Simulate setAutoCommit(true) failing in the finally block
                           (throw (ex-info (str "setAutoCommit failed, hiding " msg) {}))))
                       (getAutoCommit [_] true)
                       (setSavepoint [_])
                       (commit [_]))]
      (binding [t2.connection/*current-connectable* mock-conn]
        (let [e (is (thrown? clojure.lang.ExceptionInfo
                             (t2/with-transaction [_t-conn]
                               (throw (ex-info msg {})))))]
          ;; The original exception should be thrown, not the setAutoCommit exception
          (is (= msg (ex-message e))))
        (is (true? @autocommit-reset-called))))))

(deftest ^:synchronized reducible-query-streams-large-result-set-test
  (testing "when using a Postgres app DB, [[t2/reducible-query]] streams via a server-side cursor (autoCommit=false + fetch size)"
    (when (= (mdb.connection/db-type) :postgres)
      (let [n      Integer/MAX_VALUE
            result (t2/reducible-query [(format "SELECT generate_series(1, %d) AS i" n)])]
        (testing "only the first rows are pulled, not all ~2 billion"
          (is (= [1 2 3] (into [] (comp (take 3) (map :i)) result))))))))

(deftest ^:synchronized postgres-app-db-runs-with-autocommit-off-test
  (testing "when using a Postgres app DB, toucan2 connections run with autoCommit off and we commit manually"
    (when (= (mdb.connection/db-type) :postgres)
      (testing "a connection handed out by toucan2 has autoCommit disabled for its whole scope"
        (t2/with-connection [^java.sql.Connection conn]
          (is (false? (.getAutoCommit conn)))))
      (testing "writes are still committed (manually, at the end of the connection scope) and survive"
        (let [email (mt/random-email)]
          (t2/insert! :model/User (assoc (mt/with-temp-defaults :model/User) :email email))
          (is (true? (t2/exists? :model/User :email email))))))))

(defn- recording-connection
  "A bare [[Connection]] that starts at `initial-autocommit` and appends a marker for each setAutoCommit/commit/rollback/
  close call to the `calls` volatile (holding a vector). Lets us assert the exact side effects
  [[mdb.connection/do-with-app-db-connection]] performs against a connection without needing a real database."
  ^Connection [initial-autocommit calls]
  (let [autocommit (volatile! initial-autocommit)]
    (reify Connection
      (getAutoCommit [_] @autocommit)
      (setAutoCommit [_ v] (vswap! calls conj [:set-autocommit v]) (vreset! autocommit v))
      (commit        [_] (vswap! calls conj :commit))
      (rollback      [_] (vswap! calls conj :rollback))
      (close         [_] (vswap! calls conj :close)))))

(defn- mock-app-db
  "An [[mdb.connection/ApplicationDB]] of `db-type` (no pool) that always hands out `conn`."
  [db-type ^Connection conn]
  (mdb.connection/application-db db-type (reify DataSource (getConnection [_] conn))))

(deftest do-with-app-db-connection-postgres-test
  (testing "when using a Postgres app DB, we flip autoCommit off for the scope, then commit/rollback and reset it before returning to the pool"
    (testing "happy path: autoCommit off -> commit -> reset to true -> close"
      (let [calls  (volatile! [])
            conn   (recording-connection true calls)
            result (#'mdb.connection/do-with-app-db-connection
                    (mock-app-db :postgres conn)
                    (fn [^Connection c]
                      (is (false? (.getAutoCommit c)) "autoCommit is off while f runs")
                      :result))]
        (is (= :result result))
        (is (= [[:set-autocommit false] :commit [:set-autocommit true] :close] @calls))))
    (testing "error path: rolls back, still resets autoCommit, and propagates the original exception"
      (let [calls (volatile! [])
            conn  (recording-connection true calls)
            boom  (ex-info "boom" {})]
        (is (identical? boom
                        (try
                          (#'mdb.connection/do-with-app-db-connection
                           (mock-app-db :postgres conn)
                           (fn [_] (throw boom)))
                          (catch clojure.lang.ExceptionInfo e e))))
        (is (= [[:set-autocommit false] :rollback [:set-autocommit true] :close] @calls))))
    (testing "a connection that comes back already in manual-commit mode is taken over and reset (self-healing)"
      (let [calls (volatile! [])
            conn  (recording-connection false calls)]
        (is (= :result
               (#'mdb.connection/do-with-app-db-connection
                (mock-app-db :postgres conn)
                (fn [_] :result))))
        (is (= [[:set-autocommit false] :commit [:set-autocommit true] :close] @calls))))))

(deftest do-with-app-db-connection-non-postgres-test
  (testing "when using a non-Postgres app DB, autoCommit is never touched -- the connection is just used and closed"
    (doseq [db-type [:h2 :mysql]]
      (let [calls (volatile! [])
            conn  (recording-connection true calls)]
        (is (= :result
               (#'mdb.connection/do-with-app-db-connection
                (mock-app-db db-type conn)
                (fn [_] :result))))
        (is (= [:close] @calls) (str "db-type " db-type))))))
