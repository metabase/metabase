(ns metabase-enterprise.remote-sync.db-activity-test
  "Proves the JDBC-level counter counts what it claims, before any cost test relies on it. Not ^:parallel: the
  counter is JVM-wide."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db-activity :as db-activity]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- select-1! []
  (t2/query-one ["SELECT 1 AS one"]))

(defn- this-thread
  "Counts made by the calling thread only. The totals are JVM-wide and can pick up background app-DB work, so exact
  assertions use the per-thread counts."
  [counts]
  (get-in counts [:by-thread (.threadId (Thread/currentThread))]))

;; Metabase's transaction implementation (metabase.app-db.connection/do-transaction) sets a savepoint at the start
;; of EVERY transaction scope, top-level included, and a failed transaction rolls back to that savepoint and then
;; rolls back the connection. The expected counts below encode that behaviour; if it changes, these tests say so.

(deftest plain-transaction-test
  (testing "one transaction, one statement: BEGIN + SAVEPOINT + statement + COMMIT on one connection"
    (let [counts (db-activity/with-db-activity
                   (t2/with-transaction [_]
                     (select-1!)))]
      (is (= {:statements 1 :transactions 1 :savepoints 1 :releases 0 :commits 1 :rollbacks 0 :checkouts 1 :checkins 1}
             (select-keys (this-thread counts) [:statements :transactions :savepoints :releases :commits :rollbacks :checkouts :checkins]))))))

(deftest transaction-savepoint-and-statements-test
  (testing "one transaction containing one nested transaction and two statements"
    (let [counts (db-activity/with-db-activity
                   (t2/with-transaction [_]
                     (select-1!)
                     (t2/with-transaction [_]
                       (select-1!))))]
      (is (= {:statements 2 :transactions 1 :savepoints 2 :releases 1 :commits 1 :rollbacks 0 :checkouts 1 :checkins 1}
             (select-keys (this-thread counts) [:statements :transactions :savepoints :releases :commits :rollbacks :checkouts :checkins]))))))

(deftest rollback-test
  (testing "a transaction that throws rolls back instead of committing"
    (let [counts (db-activity/with-db-activity
                   (try
                     (t2/with-transaction [_]
                       (select-1!)
                       (throw (ex-info "boom" {})))
                     (catch clojure.lang.ExceptionInfo _ :caught)))]
      (is (= :caught (:result counts)))
      (is (= {:statements 1 :transactions 1 :commits 0 :rollbacks 2}
             (select-keys (this-thread counts) [:statements :transactions :commits :rollbacks]))))))

(deftest statements-outside-transactions-test
  (testing "each statement outside a transaction checks a connection out and back in"
    (let [counts (db-activity/with-db-activity
                   (select-1!)
                   (select-1!)
                   (select-1!))]
      (is (= {:statements 3 :checkouts 3 :checkins 3 :transactions 0}
             (select-keys (this-thread counts) [:statements :checkouts :checkins :transactions]))))))

(deftest raw-jdbc-test
  (testing "raw JDBC, which t2/with-call-count cannot see, is counted"
    (let [counts (db-activity/with-db-activity
                   (with-open [^Connection conn (.getConnection ^DataSource (mdb/app-db))
                               stmt             (.createStatement conn)]
                     (.execute stmt "SELECT 1")))]
      (is (= {:statements 1 :prepares 1 :checkouts 1 :checkins 1}
             (select-keys (this-thread counts) [:statements :prepares :checkouts :checkins]))))))

(deftest other-threads-test
  (testing "activity on other threads is counted (async imports/exports run on virtual threads)"
    (let [threads (atom nil)
          counts  (db-activity/with-db-activity
                    (let [platform (doto (Thread. ^Runnable select-1!) .start)
                          virtual  (.start (Thread/ofVirtual) ^Runnable select-1!)]
                      (.join platform)
                      (.join ^Thread virtual)
                      (reset! threads [platform virtual])))]
      (doseq [^Thread t @threads]
        (is (= 1 (get-in counts [:by-thread (.threadId t) :statements]))
            (str "counted on " (if (.isVirtual t) "the virtual" "the platform") " thread")))
      (is (<= 2 (:statements counts)) "and in the totals"))))

(deftest restores-application-db-test
  (testing "the original application DB is restored afterwards, even when the body throws"
    (let [before (mdb/app-db)]
      (is (thrown? clojure.lang.ExceptionInfo
                   (db-activity/with-db-activity (throw (ex-info "boom" {})))))
      (is (identical? before (mdb/app-db))))))
