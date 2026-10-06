(ns metabase.app-db.activity-counter-test
  "Proves the JDBC-level counter counts what it claims, before any cost test relies on it. Not ^:parallel: the
  counter is JVM-wide."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.activity-test-util :as activity]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (java.util.concurrent.atomic AtomicLong)
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
    (let [counts (activity/with-db-activity!
                   (t2/with-transaction [_]
                     (select-1!)))]
      (is (=? {:statements 1 :transactions 1 :savepoints 1 :releases 0 :commits 1 :rollbacks 0 :checkouts 1 :checkins 1}
              (this-thread counts))))))

(deftest transaction-savepoint-and-statements-test
  (testing "one transaction containing one nested transaction and two statements"
    (let [counts (activity/with-db-activity!
                   (t2/with-transaction [_]
                     (select-1!)
                     (t2/with-transaction [_]
                       (select-1!))))]
      (is (=? {:statements 2 :transactions 1 :savepoints 2 :releases 1 :commits 1 :rollbacks 0 :checkouts 1 :checkins 1}
              (this-thread counts))))))

(deftest rollback-test
  (testing "a transaction that throws rolls back instead of committing"
    (let [counts (activity/with-db-activity!
                   (try
                     (t2/with-transaction [_]
                       (select-1!)
                       (throw (ex-info "boom" {})))
                     (catch clojure.lang.ExceptionInfo _ :caught)))]
      (is (= :caught (:result counts)))
      (is (=? {:statements 1 :transactions 1 :commits 0 :rollbacks 2}
              (this-thread counts))))))

(deftest statements-outside-transactions-test
  (testing "each statement outside a transaction checks a connection out and back in"
    (let [counts (activity/with-db-activity!
                   (select-1!)
                   (select-1!)
                   (select-1!))]
      (is (=? {:statements 3 :checkouts 3 :checkins 3 :transactions 0}
              (this-thread counts))))))

(deftest raw-jdbc-test
  (testing "raw JDBC, which t2/with-call-count cannot see, is counted"
    (let [counts (activity/with-db-activity!
                   (with-open [^Connection conn (.getConnection ^DataSource (mdb/app-db))
                               stmt             (.createStatement conn)]
                     (.execute stmt "SELECT 1")))]
      (is (=? {:statements 1 :prepares 1 :checkouts 1 :checkins 1}
              (this-thread counts))))))

(deftest other-threads-test
  (testing "activity on other threads is counted (async imports/exports run on virtual threads)"
    (let [threads (atom nil)
          counts  (activity/with-db-activity!
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
                   (activity/with-db-activity! (throw (ex-info "boom" {})))))
      (is (identical? before (mdb/app-db))))))

(deftest thread-bound-application-db-test
  (testing "the application DB that the calling thread has bound (for example an empty H2 app DB) is counted"
    (mt/with-empty-h2-app-db!
      (let [before (mdb/app-db)
            counts (activity/with-db-activity! (select-1!))]
        (is (=? {:statements 1 :checkouts 1 :checkins 1}
                (this-thread counts)))
        (testing "and the calling thread's binding is restored afterwards"
          (is (identical? before (mdb/app-db))))))))

(deftest connection-checked-out-before-the-count-test
  (testing "inside a default mt/with-temp, a statement is counted or the counter throws; never a silent zero"
    (mt/with-temp [:model/Collection _ {}]
      (let [result (try
                     (activity/with-db-activity! (select-1!))
                     (catch Exception e e))]
        (if (instance? Exception result)
          (is (some? (ex-message result)))
          (is (=? {:statements 1} (this-thread result))))))))

(deftest overlapping-counts-on-two-threads-test
  (testing "two counts that overlap on two threads and end out of order leave the original application DB in the root"
    (let [app-db-var #'mdb.connection/*application-db*
          original   (.getRawRoot app-db-var)
          a-started  (promise)
          a-may-end  (promise)]
      (try
        (let [a (future (activity/count-db-activity! (fn [] (deliver a-started true) (deref a-may-end 10000 ::timeout))))
              _ (deref a-started 10000 ::timeout)
              ;; the second count may run, or it may refuse to start; either way the first count must end
              b (future (try
                          (activity/count-db-activity! (fn [] (deliver a-may-end true) (deref a 10000 ::timeout)))
                          (catch Exception e e)
                          (finally (deliver a-may-end true))))]
          (deref b 10000 ::timeout)
          (deref a 10000 ::timeout)
          (is (identical? original (.getRawRoot app-db-var))))
        (finally
          (alter-var-root app-db-var (constantly original)))))))

(deftest statement-get-connection-test
  (testing "a statement made on the connection that Statement.getConnection returns is counted"
    (let [counts (activity/with-db-activity!
                   (with-open [^Connection conn (.getConnection ^DataSource (mdb/app-db))
                               stmt             (.createStatement conn)]
                     (.execute stmt "SELECT 1")
                     (with-open [stmt2 (.createStatement (.getConnection stmt))]
                       (.execute stmt2 "SELECT 1"))))]
      (is (=? {:statements 2 :prepares 2} (this-thread counts))))))

(deftest uncounted-statements-test
  (testing "the statements that the ns docstring says the counter does not see are not counted"
    (let [counts (activity/with-db-activity!
                   (with-open [^Connection conn (.getConnection ^DataSource (mdb/app-db))
                               stmt             (.createStatement conn)
                               rs               (.executeQuery stmt "SELECT 1")]
                     (doseq [^Connection other [(.getConnection (.getStatement rs))
                                                (.getConnection (.getMetaData conn))
                                                (.unwrap conn Connection)]]
                       (with-open [other-stmt (.createStatement other)]
                         (.execute other-stmt "SELECT 1")))))]
      (testing "only the statement on the counting connection counts"
        (is (=? {:statements 1 :prepares 1} (this-thread counts)))))))

(defn- make-settings-check-due!
  "Reset the 60 s throttle of the settings-cache check, so that the next setting read sends the check."
  []
  (.set ^AtomicLong (var-get #'metabase.settings.models.setting.cache/last-update-check) 0))

(defn- read-cached-setting []
  (setting/get :site-name))

(deftest settings-check-is-outside-the-count-test
  (testing "a setting read in a count sends no settings check, also when the check is due at the start"
    (mt/with-temporary-setting-values [site-name "activity counter"]
      (make-settings-check-due!)
      (let [counts (activity/count-db-activity! read-cached-setting)]
        (is (= "activity counter" (:result counts)))
        (is (=? {:statements 0} (this-thread counts)))
        (is (nat-int? (:elapsed-ms counts)))))))

(deftest settings-check-due-inside-the-thunk-is-counted-test
  (testing "a thunk that makes the settings check due and then reads a setting sends the check inside the count"
    (mt/with-temporary-setting-values [site-name "activity counter"]
      (let [counts (activity/count-db-activity! #(do (make-settings-check-due!)
                                                     (read-cached-setting)))]
        (is (=? {:statements 1} (this-thread counts)))))))

(deftest failed-settings-check-leaves-no-count-running-test
  (testing "a settings check that throws makes the count throw"
    (mt/with-dynamic-fn-redefs [setting/restore-cache-if-needed! (fn [& _] (throw (ex-info "settings check failed" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"settings check failed"
                            (activity/count-db-activity! (constantly :never))))))
  (testing "and a later count runs"
    (is (= :ran (:result (activity/count-db-activity! (constantly :ran)))))))
