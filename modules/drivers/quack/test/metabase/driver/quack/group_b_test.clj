(ns metabase.driver.quack.group-b-test
  "Tests for the 'rest of group B' feature-parity items (see
  docs/FEATURE-PARITY-PLAN.md §2):

  - :convert-timezone  — sql.qp/->honeysql [:quack :convert-timezone] (DuckDB timezone())
  - :split-part         — sql.qp/->honeysql [:quack :split-part] (DuckDB split_part())
  - :expressions/{integer,float} — inherited :sql casts (compile + live)
  - :rename / :atomic-renames — driver/rename-tables!* inside a transaction
  - :describe-is-nullable / :describe-default-expr — describe-fields enrichment

  The flag tests run without a server. The behavior tests run the exact DuckDB
  SQL our ->honeysql methods emit against the dev Quack server, isolating SQL
  correctness from the metadata-provider plumbing (covered in Tier E)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.quack.client :as client]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]
           [java.time LocalDateTime]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String (:host details) ^int (:port details))] true)
       (catch Exception _ false)))

(defn- run-sql [sql-str]
  (let [{:keys [rows]} (client/execute-query details sql-str)]
    (reduce conj [] rows)))

(use-fixtures :once (fn [t] (when (reachable?) (t))))

;;; ===========================================================================
;;; Feature flags
;;; ===========================================================================

(deftest group-b-feature-flags-test
  (testing "group-B features are advertised"
    (is (true? (driver/database-supports? :quack :convert-timezone fake-db)))
    (is (true? (driver/database-supports? :quack :split-part fake-db)))
    (is (true? (driver/database-supports? :quack :expressions/integer fake-db)))
    (is (true? (driver/database-supports? :quack :expressions/float fake-db)))
    (is (true? (driver/database-supports? :quack :rename fake-db)))
    (is (true? (driver/database-supports? :quack :atomic-renames fake-db)))
    (is (true? (driver/database-supports? :quack :describe-is-nullable fake-db)))
    (is (true? (driver/database-supports? :quack :describe-default-expr fake-db)))
    ;; DuckDB does not populate information_schema.columns.is_generated, so we
    ;; do NOT advertise :describe-is-generated — assert that here as a guard.
    (is (false? (driver/database-supports? :quack :describe-is-generated fake-db)))))

;;; ===========================================================================
;;; convert-timezone — DuckDB timezone() function (same shape as Postgres)
;;; ===========================================================================

(deftest ^:live convert-timezone-timestamptz-test
  (when (reachable?)
    (testing "TIMESTAMPTZ input: 12:00 UTC → 07:00 America/New_York (the [:timezone tz expr] form)"
      ;; This is exactly what ->honeysql [:quack :convert-timezone] emits for a
      ;; timestamptz input: timezone('America/New_York', expr).
      (let [v (ffirst (run-sql "SELECT timezone('America/New_York', '2020-01-01 12:00:00 UTC'::TIMESTAMPTZ)"))]
        (is (= (LocalDateTime/parse "2020-01-01T07:00:00") v))))))

(deftest ^:live convert-timezone-naive-test
  (when (reachable?)
    (testing "naive TIMESTAMP input: interpret as UTC, output in America/New_York"
      ;; ->honeysql wraps with the source zone: timezone(target, timezone(source, expr)).
      (let [v (ffirst (run-sql "SELECT timezone('America/New_York', timezone('UTC', '2020-01-01 12:00:00'::TIMESTAMP))"))]
        (is (= (LocalDateTime/parse "2020-01-01T07:00:00") v))))))

;;; ===========================================================================
;;; split-part — DuckDB split_part() (1-based, '' for out-of-range)
;;; ===========================================================================

(deftest ^:live split-part-behavior-test
  (when (reachable?)
    (testing "split_part is 1-based and returns '' for out-of-range positions"
      (is (= [["b"]] (run-sql "SELECT split_part('a-b-c', '-', 2)")))
      (is (= [[""]]  (run-sql "SELECT split_part('a-b-c', '-', 0)")))
      (is (= [[""]]  (run-sql "SELECT split_part('a-b-c', '-', 99)"))))))

;;; ===========================================================================
;;; expressions/integer + expressions/float (inherited :sql casts: BIGINT / DOUBLE)
;;; ===========================================================================

(deftest ^:live cast-expressions-test
  (when (reachable?)
    (testing "integer()/float() casts resolve to DuckDB-compatible types"
      (is (= [[42]]   (run-sql "SELECT CAST('42' AS BIGINT)")))
      (is (= [[1.5]]  (run-sql "SELECT CAST('1.5' AS DOUBLE)"))))))

;;; ===========================================================================
;;; describe-fields enrichment (nullable / default)
;;; ===========================================================================

(deftest ^:live describe-fields-enrichment-test
  (when (reachable?)
    (let [schema "grp_b_test"]
      (try
        (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema))
        (run-sql (format "CREATE SCHEMA %s" schema))
        (run-sql (format "CREATE TABLE %s.t (id INTEGER PRIMARY KEY,
                                              name VARCHAR NOT NULL DEFAULT 'x',
                                              opt VARCHAR)" schema))
        (let [fields (driver/describe-fields :quack fake-db)
              by-name (->> fields
                           (filter #(and (= "t" (:table-name %))
                                         (= schema (:table-schema %))))
                           (map (juxt :name identity))
                           (into {}))]
          (testing ":database-required reflects NOT NULL"
            (is (true? (:database-required (by-name "name"))))
            (is (nil?   (:database-required (by-name "opt")))))
          (testing ":database-default reflects column_default"
            (is (= "'x'" (:database-default (by-name "name")))))
          (testing "a column with no default has no :database-default"
            (is (nil? (:database-default (by-name "opt"))))))
        (finally
          (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema)))))))

;;; ===========================================================================
;;; rename (atomic, inside a transaction) — reproduces the exact SQL
;;; rename-tables!* :quack emits: a held-connection BEGIN / ALTER…RENAME / COMMIT.
;;; ===========================================================================

(deftest ^:live rename-tables-atomic-test
  (when (reachable?)
    (let [schema "grp_b_rename"]
      (try
        (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema))
        (run-sql (format "CREATE SCHEMA %s" schema))
        (run-sql (format "CREATE TABLE %s.old AS SELECT 1 AS i" schema))
        (run-sql (format "CREATE TABLE %s.tmp AS SELECT 2 AS i" schema))
        ;; The exact sequence rename-tables!* emits: a transaction with one
        ;; ALTER…RENAME per entry. Two renames here (old→renamed, tmp→old).
        (client/with-transaction [cid details]
          (client/exec-on-connection
           details cid
           (format "ALTER TABLE %s.old RENAME TO \"renamed\"" schema))
          (client/exec-on-connection
           details cid
           (format "ALTER TABLE %s.tmp RENAME TO \"old\"" schema)))
        (let [tables (->> (run-sql (format "SELECT table_name FROM information_schema.tables WHERE table_schema='%s' ORDER BY 1" schema))
                          (map first) set)]
          (is (= #{"renamed" "old"} tables)
              "both renames landed atomically inside the transaction"))
        (finally
          (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema)))))))
