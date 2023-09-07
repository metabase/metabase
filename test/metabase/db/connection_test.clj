(ns metabase.db.connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.initialize :as initialize]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest nested-transaction-test
  (initialize/initialize-if-needed! :db)
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
      (is (not (user-exists? user-2))))))
