(ns metabase.db.connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.db.connection :as mdb.connection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.util.concurrent Semaphore)))

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
                                    (t2/insert! :model/User (assoc (t2.with-temp/with-temp-defaults :model/User) :email email)))
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
        (is (true? (.getAutoCommit conn)))))

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
