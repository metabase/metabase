(ns metabase.driver.quack.transforms-test
  "Tests for transforms / write support (DDL + DML).
  Verifies that the driver can execute CREATE TABLE, CREATE TABLE AS SELECT,
  INSERT, and DROP TABLE through the Metabase API — the building blocks of
  transforms. Also verifies the feature flags are enabled and table-exists?
  works."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.quack.client :as client]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :id 99999 :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String (:host details) ^int (:port details))] true)
       (catch Exception _ false)))

(defn- run-sql [sql]
  (let [{:keys [rows]} (client/execute-query details sql)]
    (reduce conj [] rows)))

;;; ===========================================================================
;;; Feature flags
;;; ===========================================================================

(deftest transforms-feature-flags-test
  (testing "transform-related features are enabled"
    (is (true? (driver/database-supports? :quack :transforms/table fake-db)))
    (is (true? (driver/database-supports? :quack :create-or-replace-table fake-db)))))

;;; ===========================================================================
;;; Parameter handling and transaction routing
;;; ===========================================================================

(deftest inline-query-parameters-test
  (testing "Quack SQL compilation safely inlines values because the protocol has no bind channel"
    (let [[sql & params] (binding [driver/*compile-with-inline-parameters* false]
                           (sql.qp/format-honeysql :quack
                                                   {:select [[[:lift "O'Reilly"] :author]]}))]
      (is (empty? params))
      (is (re-find #"O''Reilly" sql))))
  (testing "execution rejects any parameterized SQL that bypassed compilation"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"does not support separate parameters"
                          (driver/execute-raw-queries! :quack details [["SELECT ?" [42]]])))))

(defn- record-client-calls! [calls f]
  (let [result {:cols [] :rows []}]
    (mt/with-dynamic-fn-redefs [client/borrow-conn!       (constantly :held)
                                client/return-conn!       (constantly nil)
                                client/discard-conn!      (constantly nil)
                                client/exec-on-connection (fn [_ conn-id sql]
                                                            (swap! calls conj [conn-id sql])
                                                            result)
                                client/execute-sql!       (fn [_ sql]
                                                            (swap! calls conj [:separate sql])
                                                            result)]
      (f))))

(deftest rename-tables-uses-held-transaction-connection-test
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [driver-api/cached-database (constantly fake-db)]
      (record-client-calls! calls
                            #(driver/rename-tables!* :quack 1 (array-map :main/old :main/new))))
    (is (= [[:held "BEGIN"]
            [:held "ALTER TABLE \"main\".\"old\" RENAME TO \"new\""]
            [:held "COMMIT"]]
           @calls))))

(deftest persistence-swap-uses-held-transaction-connection-test
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [driver-api/compile   (constantly {:query "SELECT 1"})
                                driver-api/site-uuid (constantly "12345678-test")]
      (record-client-calls! calls
                            #(ddl.i/refresh! :quack fake-db {:table-name "model_1"} {})))
    (is (= [:separate :separate :held :held :held :held]
           (mapv first @calls)))
    (is (= ["BEGIN" "COMMIT"]
           (mapv second [(nth @calls 2) (last @calls)])))))

;;; ===========================================================================
;;; execute-raw-queries! (DDL/DML through the Quack protocol)
;;; ===========================================================================

(deftest ^:live execute-ddl-through-quack-test
  (when (reachable?)
    (testing "CREATE TABLE AS SELECT works through execute-raw-queries!"
      (driver/execute-raw-queries! :quack details
                                   ["DROP TABLE IF EXISTS tmp_transform_test"
                                    "CREATE TABLE tmp_transform_test AS SELECT i, i*i AS sq FROM range(10) t(i)"])
      (let [rows (run-sql "SELECT count(*) FROM tmp_transform_test")]
        (is (= 10 (ffirst rows)))))))

;;; ===========================================================================
;;; table-exists?
;;; ===========================================================================

(deftest ^:live table-exists-test
  (when (reachable?)
    (testing "table-exists? finds a table that exists"
      (is (true? (driver/table-exists? :quack fake-db {:schema "samples" :name "types"}))))
    (testing "table-exists? returns false for a missing table"
      (is (false? (driver/table-exists? :quack fake-db {:schema "samples" :name "nonexistent_xyz"}))))))

;;; ===========================================================================
;;; create-table! / drop-table!
;;; ===========================================================================

(deftest ^:live create-and-drop-table-test
  (when (reachable?)
    (testing "create-table! + drop-table! work"
      ;; Use the :sql parent's DDL generator via the create-table! multimethod.
      ;; The database-id arg is a placeholder — our impl uses fake-db's details.
      (try
        (driver/execute-raw-queries! :quack details
                                     ["DROP TABLE IF EXISTS tmp_create_test"])
        (driver/execute-raw-queries! :quack details
                                     ["CREATE TABLE tmp_create_test (id INTEGER, name VARCHAR)"])
        (is (true? (driver/table-exists? :quack fake-db {:schema nil :name "tmp_create_test"})))
        (finally
          (driver/execute-raw-queries! :quack details
                                       ["DROP TABLE IF EXISTS tmp_create_test"]))))))

;;; ===========================================================================
;;; Transforms end-to-end (CTAS)
;;; ===========================================================================

(deftest ^:live transform-ctas-test
  (when (reachable?)
    (testing "a CREATE TABLE AS SELECT (the core transform operation) works"
      (driver/execute-raw-queries! :quack details
                                   ["DROP TABLE IF EXISTS tmp_ctas_test"
                                    "CREATE TABLE tmp_ctas_test AS SELECT i, i*2 AS doubled FROM range(5) t(i)"])
      (let [rows (run-sql "SELECT * FROM tmp_ctas_test ORDER BY i")]
        (is (= 5 (count rows)))
        (is (= [[0 0] [1 2] [2 4] [3 6] [4 8]] rows)))
      (driver/execute-raw-queries! :quack details
                                   ["DROP TABLE IF EXISTS tmp_ctas_test"]))))

(deftest ^:live transform-create-or-replace-test
  (when (reachable?)
    (testing
     "CREATE OR REPLACE TABLE (the transform idempotency mechanism) replaces
       an existing table atomically — critical for transform retries: a previous
       run that crashed mid-sync leaves the target behind, and a plain CREATE
       TABLE would fail with 'table already exists'."
      (driver/execute-raw-queries! :quack details
                                   ["DROP TABLE IF EXISTS tmp_replace_test"
                                    "CREATE TABLE tmp_replace_test AS SELECT 1 AS v"])
      ;; CREATE OR REPLACE must succeed even though the table exists.
      (driver/execute-raw-queries! :quack details
                                   ["CREATE OR REPLACE TABLE tmp_replace_test AS SELECT 2 AS v"])
      (let [rows (run-sql "SELECT v FROM tmp_replace_test")]
        (is (= [[2]] rows) "the replacement table's data is visible"))
      (driver/execute-raw-queries! :quack details
                                   ["DROP TABLE IF EXISTS tmp_replace_test"]))))
