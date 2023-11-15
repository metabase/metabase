(ns ^:mb/once metabase.setup-test
  (:require
   [clojure.test :refer :all]
   [metabase.core :as mbc]
   [metabase.db :as mdb]
   [metabase.db.schema-migrations-test.impl :as schema-migrations-test.impl]
   [metabase.setup :as setup]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest has-user-setup-test
  (testing "The has-user-setup getter should return falsey for an empty instance with only an internal user"
    ;; create a new completely empty database.
    (schema-migrations-test.impl/with-temp-empty-app-db [_conn :h2]
      ;; make sure the DB is set up
      (mdb/setup-db!)
      ;; install audit DB, which creates an internal user as a side effect (on EE instances))
      (mbc/ensure-audit-db-installed!)
      (is (= false
             (setup/has-user-setup))))))

(deftest has-user-setup-cached-test
  (testing "The has-user-setup getter should cache truthy results since it can never become falsey"
    ;; make sure some test users are created.
    (mt/initialize-if-needed! :test-users)
    (t2/with-call-count [call-count]
      ;; call has-user-setup several times.
      (dotimes [_ 5]
        (is (= true
               (setup/has-user-setup))))
      ;; `has-user-setup` should have done at most one application database call, as opposed to one call per call to
      ;; the getter
      (is (contains? #{0 1} (call-count)))))
  (testing "Return falsey for an empty instance. Values should be cached for current app DB to support swapping in tests/REPL"
    ;; create a new completely empty database.
    (mt/with-temp-empty-app-db [_conn :h2]
      ;; make sure the DB is setup (e.g., run all the Liquibase migrations)
      (mdb/setup-db!)
      (t2/with-call-count [call-count]
        (dotimes [_ 5]
          (is (= false
                 (setup/has-user-setup))))
        (testing "Should continue doing new DB calls as long as there is no User"
          (is (<= (call-count)
                  10)))))) ;; in dev/test we check settings for an override
  (testing "Switch back to the 'normal' app DB; value should still be cached for it"
    (t2/with-call-count [call-count]
      (is (= true
             (setup/has-user-setup)))
      (is (zero? (call-count))))))
