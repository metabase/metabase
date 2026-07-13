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

(deftest after-commit-callback-runs-outside-transaction-bindings-test
  (let [callback-state (promise)]
    (t2/with-transaction [_conn]
      (mdb.connection/do-after-commit
       #(deliver callback-state
                 {:current-connectable t2.connection/*current-connectable*
                  :in-transaction?     (mdb.connection/in-transaction?)})))
    (is (= {:current-connectable nil
            :in-transaction?     false}
           (deref callback-state 1000 ::timed-out)))))

(deftest after-commit-callback-does-not-leak-transaction-bindings-into-async-work-test
  ;; a future conveys dynamic bindings: neither the transaction connection nor the callback accumulator may
  ;; leak into async work a callback starts, or the future would reuse a pooled-back connection and an async
  ;; do-after-commit would enqueue into the already-drained accumulator and never run
  (let [conveyed-connectable (promise)
        async-callback-ran   (promise)]
    (t2/with-transaction [_conn]
      (mdb.connection/do-after-commit
       (fn []
         (future
           (deliver conveyed-connectable t2.connection/*current-connectable*)
           (mdb.connection/do-after-commit #(deliver async-callback-ran true))))))
    (is (nil? (deref conveyed-connectable 1000 ::timed-out)))
    (is (true? (deref async-callback-ran 1000 ::timed-out)))))

(deftest after-commit-callbacks-from-rolled-back-nested-transaction-are-discarded-test
  (let [calls         (atom [])
        rollback-ex   (ex-info "Rollback nested transaction" {})
        register-call #(mdb.connection/do-after-commit (fn [] (swap! calls conj %)))]
    (t2/with-transaction [conn]
      (register-call :outer-before)
      (is (thrown?
           Exception
           (t2/with-transaction [_ conn]
             (register-call :nested)
             (throw rollback-ex))))
      (register-call :outer-after))
    (is (= [:outer-before :outer-after] @calls))))

(deftest after-commit-callbacks-discarded-even-when-savepoint-rollback-throws-test
  (let [calls     (atom [])
        mock-conn (reify Connection
                    (rollback [_ _savepoint] (throw (ex-info "Rollback error" {})))
                    (setAutoCommit [_ _])
                    (getAutoCommit [_] true)
                    (setSavepoint [_])
                    (commit [_]))]
    (binding [t2.connection/*current-connectable* mock-conn]
      (t2/with-transaction [_conn]
        (mdb.connection/do-after-commit (fn [] (swap! calls conj :outer)))
        ;; the nested body registers a callback then throws; its savepoint rollback also throws
        (is (thrown?
             Exception
             (t2/with-transaction [_]
               (mdb.connection/do-after-commit (fn [] (swap! calls conj :nested)))
               (throw (ex-info "boom" {})))))))
    ;; the nested callback is discarded even though the rollback threw — only :outer survives to run
    (is (= [:outer] @calls))))

(deftest after-commit-callback-registering-another-runs-it-immediately-test
  (let [calls (atom [])]
    (t2/with-transaction [_conn]
      (mdb.connection/do-after-commit
       (fn []
         (swap! calls conj :a)
         ;; the run binds *after-commit-callbacks* to nil, so a do-after-commit here runs immediately (we are
         ;; logically outside the transaction) rather than enqueuing for a later pass
         (mdb.connection/do-after-commit (fn [] (swap! calls conj :nested-from-a)))))
      (mdb.connection/do-after-commit (fn [] (swap! calls conj :b))))
    (is (= [:a :nested-from-a :b] @calls))))

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

;;; ------------------------------ before-commit + transaction-state ------------------------------
;;; The mq transactional outbox relies on this machinery: it inserts its rows from a before-commit
;;; callback (so they commit atomically with the business transaction) and stashes the ids in
;;; transaction-state to publish them from an after-commit callback once the commit lands.

(deftest do-before-commit-runs-immediately-outside-transaction-test
  (let [calls (atom [])]
    (mdb.connection/do-before-commit (fn [] (swap! calls conj :ran)))
    (is (= [:ran] @calls) "outside a transaction do-before-commit runs the thunk immediately")))

(deftest before-commit-callbacks-run-before-commit-and-commit-their-writes-test
  (let [email (mt/random-email)
        order (atom [])]
    (try
      (t2/with-transaction [_conn]
        (mdb.connection/do-before-commit
         (fn []
           (swap! order conj :before-commit)
           (t2/insert! :model/User (assoc (mt/with-temp-defaults :model/User) :email email))))
        (swap! order conj :body)
        (is (= [:body] @order) "before-commit callback has not run during the body"))
      (is (= [:body :before-commit] @order)
          "before-commit runs after the body returns, as part of the commit sequence")
      (is (t2/exists? :model/User :email email)
          "a row inserted from a before-commit callback commits with the transaction")
      (finally
        (t2/delete! :model/User :email email)))))

(deftest before-commit-callbacks-not-run-on-rollback-test
  (let [calls (atom [])]
    (is (thrown?
         Exception
         (t2/with-transaction [_conn]
           (mdb.connection/do-before-commit (fn [] (swap! calls conj :should-not-run)))
           (throw (ex-info "force rollback" {})))))
    (is (= [] @calls) "before-commit callbacks do not run when the transaction rolls back")))

(deftest throwing-before-commit-rolls-back-the-transaction-test
  (let [email (mt/random-email)]
    (try
      (is (thrown-with-msg?
           Exception #"boom"
           (t2/with-transaction [_conn]
             (t2/insert! :model/User (assoc (mt/with-temp-defaults :model/User) :email email))
             (is (t2/exists? :model/User :email email) "row is visible inside the transaction")
             (mdb.connection/do-before-commit (fn [] (throw (ex-info "boom" {})))))))
      (is (not (t2/exists? :model/User :email email))
          "the business write rolls back when a before-commit callback throws")
      (finally
        (t2/delete! :model/User :email email)))))

(deftest before-commit-callbacks-from-rolled-back-nested-transaction-are-discarded-test
  (let [calls (atom [])]
    (t2/with-transaction [conn]
      (mdb.connection/do-before-commit (fn [] (swap! calls conj :outer)))
      (is (thrown?
           Exception
           (t2/with-transaction [_ conn]
             (mdb.connection/do-before-commit (fn [] (swap! calls conj :nested-should-not-run)))
             (throw (ex-info "force savepoint rollback" {}))))))
    (is (= [:outer] @calls)
        "only the outer before-commit callback runs; the rolled-back nested one is discarded")))

(deftest before-commit-can-schedule-after-commit-test
  ;; the mq transactional outbox works this way: a before-commit callback does its DB write, then
  ;; schedules the post-commit publish over what it just wrote.
  (let [order (atom [])]
    (t2/with-transaction [_conn]
      (mdb.connection/do-before-commit
       (fn []
         (swap! order conj :before)
         (mdb.connection/do-after-commit (fn [] (swap! order conj :after))))))
    (is (= [:before :after] @order)
        "an after-commit scheduled from a before-commit runs after the transaction commits")))

(deftest transaction-state-shared-across-nested-transactions-test
  (t2/with-transaction [conn]
    (let [outer-state mdb.connection/*transaction-state*]
      (is (some? outer-state) "transaction-state is bound inside a transaction")
      (t2/with-transaction [_ conn]
        (is (identical? outer-state mdb.connection/*transaction-state*)
            "nested transactions share the same transaction-state atom"))))
  (is (nil? mdb.connection/*transaction-state*) "transaction-state is nil outside a transaction"))

(deftest transaction-state-from-rolled-back-nested-transaction-is-discarded-test
  (t2/with-transaction [conn]
    (swap! mdb.connection/*transaction-state* assoc :outer-key "outer-val")
    (is (thrown?
         Exception
         (t2/with-transaction [_ conn]
           (swap! mdb.connection/*transaction-state* assoc :inner-key "inner-val")
           (throw (ex-info "force savepoint rollback" {})))))
    (is (= {:outer-key "outer-val"} @mdb.connection/*transaction-state*)
        "data stashed by a rolled-back nested transaction is discarded from transaction-state")))
