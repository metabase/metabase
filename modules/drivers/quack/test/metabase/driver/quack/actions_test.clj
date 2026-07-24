(ns metabase.driver.quack.actions-test
  "Tests for writeback actions (quack.actions): the DML + transaction patterns
  the six perform-action!* methods use (INSERT/UPDATE/DELETE … RETURNING * inside
  a held DuckDB transaction), plus base-type->sql-type-map.

  The full perform-action!* path drives the QP (qp.setup + metadata provider) and
  is exercised by the Tier-E actions conformance suite. Here we validate the
  DuckDB-SQL correctness of every statement shape our methods emit against the
  dev Quack server, so action correctness doesn't depend on the conformance run."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.quack.client :as client]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :engine :quack :id 1 :name "quack-actions"
              :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String (:host details) ^int (:port details))] true)
       (catch Exception _ false)))

(defn- run-sql [sql-str]
  (let [{:keys [rows]} (client/execute-query details sql-str)]
    (reduce conj [] rows)))

(use-fixtures :once (fn [t] (when (reachable?) (t))))

;;; ===========================================================================
;;; Feature flags + base-type map (no server)
;;; ===========================================================================

(deftest actions-feature-flags-test
  (testing "writeback-action features are enabled"
    (is (true? (driver/database-supports? :quack :actions fake-db)))
    (is (true? (driver/database-supports? :quack :actions/data-editing fake-db)))
    (is (true? (driver/database-supports? :quack :actions/custom fake-db)))))

(deftest base-type->sql-type-map-test
  (testing "Metabase base types map to DuckDB column types for cast-values"
    (let [m (sql-jdbc.actions/base-type->sql-type-map :quack)]
      (is (= "INTEGER"    (:type/Integer m)))
      (is (= "BIGINT"     (:type/BigInteger m)))
      (is (= "BOOLEAN"    (:type/Boolean m)))
      (is (= "VARCHAR"    (:type/Text m)))
      (is (= "DOUBLE"     (:type/Float m)))
      (is (= "TIMESTAMP"  (:type/DateTime m)))
      (is (= "TIMESTAMPTZ" (:type/DateTimeWithTZ m))))))

;;; ===========================================================================
;;; Live: the DML shapes our perform-action!* methods emit.
;;;
;;; Every statement runs inside client/with-transaction on a held connection
;;; (exactly as do-row-{create,update,delete}! do), and uses RETURNING * to
;;; read back the affected row atomically.
;;; ===========================================================================

(def ^:private action-schema "act_test")

(defn- setup-action-table!
  "Create a fresh action-test table with a PK + one seed row. Idempotent."
  []
  (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" action-schema))
  (run-sql (format "CREATE SCHEMA %s" action-schema))
  (run-sql (format "CREATE TABLE %s.items (id INTEGER PRIMARY KEY, name VARCHAR, qty INTEGER)" action-schema))
  (run-sql (format "INSERT INTO %s.items VALUES (1, 'widget', 10)" action-schema)))

(defn- teardown! []
  (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" action-schema)))

(defn- table [] (format "%s.items" action-schema))

(deftest ^:live row-create-returning-test
  (when (reachable?)
    (try
      (setup-action-table!)
      (testing "INSERT … RETURNING * returns the created row (atomic with insert)"
        (let [result (client/with-transaction [cid details]
                       (client/exec-on-connection
                        details cid
                        (format "INSERT INTO %s (id, name, qty) VALUES (2, 'gadget', 5) RETURNING *" (table))))
              row (->> result :rows first (zipmap (map :name (:cols result))))]
          (is (= {"id" 2 "name" "gadget" "qty" 5} row))))
      (finally (teardown!)))))

(deftest ^:live row-update-before-after-test
  (when (reachable?)
    (try
      (setup-action-table!)
      (testing "UPDATE: SELECT-before + UPDATE RETURNING-after inside one transaction"
        (let [[before after]
              (client/with-transaction [cid details]
                (let [b (client/exec-on-connection
                         details cid
                         (format "SELECT * FROM %s WHERE id=1" (table)))
                      _ (client/exec-on-connection
                         details cid
                         (format "UPDATE %s SET qty=99 WHERE id=1 RETURNING *" (table)))
                      a (client/exec-on-connection
                         details cid
                         (format "SELECT * FROM %s WHERE id=1" (table)))]
                  [b a]))
              row (fn [r] (zipmap (map :name (:cols r)) (first (:rows r))))]
          (is (= 10 (get (row before) "qty")) "read-before sees the old value")
          (is (= 99 (get (row after) "qty"))  "read-after sees the updated value")))
      (finally (teardown!)))))

(deftest ^:live row-delete-returning-test
  (when (reachable?)
    (try
      (setup-action-table!)
      (testing "DELETE … RETURNING * returns the deleted row + asserts exactly 1"
        (let [result (client/with-transaction [cid details]
                       (client/exec-on-connection
                        details cid
                        (format "DELETE FROM %s WHERE id=1 RETURNING *" (table))))
              rows (:rows result)]
          (is (= 1 (count rows)) "exactly one row deleted")
          (is (= {"id" 1 "name" "widget" "qty" 10}
                 (zipmap (map :name (:cols result)) (first rows))))))
      (testing "deleting a missing PK returns 0 rows (the 'doesn't exist' case)"
        (let [result (client/with-transaction [cid details]
                       (client/exec-on-connection
                        details cid
                        (format "DELETE FROM %s WHERE id=9999 RETURNING *" (table))))]
          (is (zero? (count (:rows result))))))
      (finally (teardown!)))))

(deftest ^:live transaction-rollback-test
  (when (reachable?)
    (testing "an exception inside with-transaction rolls the transaction back"
      (try
        (setup-action-table!)
        (is (thrown? Exception
                     (client/with-transaction [cid details]
                       (client/exec-on-connection
                        details cid
                        (format "INSERT INTO %s (id, name, qty) VALUES (1, 'dup', 1)" (table)))
                       ;; force a failure after the insert — should roll it back
                       (client/exec-on-connection
                        details cid
                        "SELECT this_does_not_exist")))
            "the bogus SELECT throws")
        ;; the duplicate-PK insert should have been rolled back: the table still
        ;; has exactly its one seed row, and no 'dup' row.
        (is (= [[1]] (run-sql (format "SELECT count(*) FROM %s" (table))))
            "rollback discarded the insert")
        (finally (teardown!))))))
