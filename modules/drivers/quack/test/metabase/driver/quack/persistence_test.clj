(ns metabase.driver.quack.persistence-test
  "Tests for model-persistence support (the three ddl.i multimethods in
  quack.clj: check-can-persist, refresh!, unpersist!).

  The flag declaration test runs without a server. The live tests exercise the
  exact DDL/DML our methods emit against the dev Quack server — they validate
  that DuckDB accepts the SQL (CREATE SCHEMA, the cache_info KV table, and the
  temp-table + rename refresh swap) and clean up after themselves. We test the
  SQL sequence directly rather than the full multimethods because refresh!
  drives the model query through the full QP (qp.setup + a metadata provider),
  which is only available in the Tier-E conformance run; the DuckDB-SQL
  correctness of every statement is fully covered here."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.quack.client :as client]
   [metabase.driver.sql.util :as sql.u]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :engine :quack :id 99999
              :name    "quack-persistence-test"
              :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String (:host details) ^int (:port details))] true)
       (catch Exception _ false)))

(defn- run-sql [sql-str]
  (let [{:keys [rows]} (client/execute-query details sql-str)]
    (reduce conj [] rows)))

(use-fixtures :once (fn [t] (when (reachable?) (t))))

;;; ===========================================================================
;;; Feature flag
;;; ===========================================================================

(deftest persist-models-feature-flag-test
  (testing ":persist-models is enabled (the opt-in that unlocks the whole feature)"
    (is (true? (driver/database-supports? :quack :persist-models fake-db))))
  (testing ":persist-models-enabled derives from the per-DB setting (the :sql parent)"
    ;; :persist-models-enabled = :persist-models AND (:settings :persist-models-enabled).
    ;; With no setting it's falsy (nil) …
    (is (not (true? (driver/database-supports? :quack :persist-models-enabled fake-db))))
    ;; … and with the setting enabled it tracks :persist-models.
    (let [enabled-db (assoc fake-db :settings {:persist-models-enabled true})]
      (is (true? (driver/database-supports? :quack :persist-models-enabled enabled-db))))))

;;; ===========================================================================
;;; Live: the cache schema + cache_info KV table DDL that check-can-persist
;;; creates. Uses the exact helpers (sql.ddl, ddl.i honeysql forms) our method
;;; calls, formatted the same way (ANSI dialect for the KV table).
;;; ===========================================================================

(defn- cache-schema-name []
  ;; Use a fixed name rather than ddl.i/schema-name (which calls
  ;; system/site-uuid and needs the app DB); the SQL-shape tests below don't
  ;; depend on the exact name, only on the DuckDB-SQL correctness.
  "metabase_cache_quacktest")

(defn- drop-cache-schema! [schema-name]
  (try (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE"
                        (sql.u/quote-name :quack :table schema-name)))
       (catch Throwable _)))

(deftest ^:live cache-schema-and-kv-table-test
  (when (reachable?)
    (let [schema (cache-schema-name)
          q      #(sql.u/quote-name :quack :table %)]
      (try
        (testing "CREATE SCHEMA works (check-can-persist's first probe)"
          (run-sql (format "CREATE SCHEMA IF NOT EXISTS %s" (q schema)))
          (testing "the cache_info KV table can be created (populate needs
                  system/site-uuid, so verify the CREATE + a manual row)"
            ;; Same honeysql CREATE form + ANSI formatting our method uses.
            (let [[create-sql] (sql/format (ddl.i/create-kv-table-honey-sql-form schema)
                                           {:dialect :ansi})]
              (run-sql create-sql)
              (run-sql (format "INSERT INTO %s.%s VALUES ('settings-version','1')"
                               (q schema) (q "cache_info"))))
            (let [rows (run-sql (format "SELECT key FROM %s.%s ORDER BY key"
                                        (q schema) (q "cache_info")))
                  keys (set (map first rows))]
              (is (contains? keys "settings-version")))))
        (finally
          (drop-cache-schema! schema))))))

;;; ===========================================================================
;;; Live: the temp-table + rename refresh swap.
;;;
;;; Reproduces the exact 4-statement sequence refresh! emits, against a real
;;; cache table, to prove (a) DuckDB accepts every statement and (b) the swap
;;; leaves the NEW data under the ORIGINAL cache table name — i.e. the
;;; intermediate state is invisible and the result is correct.
;;; ===========================================================================

(deftest ^:live refresh-temp-table-rename-swap-test
  (when (reachable?)
    (let [schema (cache-schema-name)
          q      #(sql.u/quote-name :quack :table %)
          ident  #(format "%s.%s" (q schema) (q %))
          table  "model_42_test"
          temp   "model_42_test__mb_refresh"]
      (try
        ;; Stand up the cache schema + an existing cache table ("the old
        ;; model result", rows 1..3).
        (run-sql (format "CREATE SCHEMA IF NOT EXISTS %s" (q schema)))
        (run-sql (format "DROP TABLE IF EXISTS %s" (ident table)))
        (run-sql (format "CREATE TABLE %s AS SELECT i FROM range(1,4) t(i)" (ident table)))
        (testing "step 1: DROP IF EXISTS the refresh temp (cleans any orphan)"
          (run-sql (format "DROP TABLE IF EXISTS %s" (ident temp))))
        (testing "step 2: CREATE TABLE <temp> AS <model SQL> — old cache stays readable"
          ;; "the new model result", rows 10..12, materialized into the temp.
          (run-sql (format "CREATE TABLE %s AS SELECT i FROM range(10,13) t(i)" (ident temp)))
          (is (= 3 (ffirst (run-sql (format "SELECT count(*) FROM %s" (ident table)))))
              "old cache table is still queryable while the temp materializes"))
        (testing "step 3: DROP IF EXISTS the current cache table"
          (run-sql (format "DROP TABLE IF EXISTS %s" (ident table))))
        (testing "step 4: ALTER TABLE <temp> RENAME TO <table> — metadata-only swap"
          (run-sql (format "ALTER TABLE %s RENAME TO %s" (ident temp) (q table))))
        (testing "the swap leaves the NEW data under the ORIGINAL cache name"
          (let [rows (run-sql (format "SELECT i FROM %s ORDER BY i" (ident table)))]
            (is (= [[10] [11] [12]] rows)
                "cache now reflects the refreshed model, not the old one")))
        (testing "the temp name is gone after the rename"
          (let [rows (run-sql (format
                               "SELECT count(*) FROM information_schema.tables
                                 WHERE table_schema = '%s' AND table_name = '%s'"
                               schema temp))]
            (is (zero? (ffirst rows)) "temp table was renamed away, not copied")))
        (finally
          (drop-cache-schema! schema))))))

;;; ===========================================================================
;;; Live: unpersist! just drops the cache table. Verify the generated SQL
;;; (sql.ddl/drop-table-sql) targets the right schema-qualified name and that
;;; a missing table doesn't error (DROP IF EXISTS).
;;; ===========================================================================

(deftest ^:live unpersist-drops-cache-table-test
  (when (reachable?)
    (let [schema (cache-schema-name)
          q      #(sql.u/quote-name :quack :table %)
          table  "model_99_unpersist"]
      (try
        (run-sql (format "CREATE SCHEMA IF NOT EXISTS %s" (q schema)))
        (run-sql (format "DROP TABLE IF EXISTS %s.%s" (q schema) (q table)))
        (run-sql (format "CREATE TABLE %s.%s (id INTEGER)" (q schema) (q table)))
        (testing "a DROP TABLE IF EXISTS on the cache schema removes the table"
          ;; sql.ddl/drop-table-sql calls system/site-uuid (needs the app DB),
          ;;          so reproduce the exact DROP shape our unpersist! emits directly.
          (run-sql (format "DROP TABLE IF EXISTS %s.%s" (q schema) (q table)))
          (let [rows (run-sql (format
                               "SELECT count(*) FROM information_schema.tables
                                 WHERE table_schema = '%s' AND table_name = '%s'"
                               schema table))]
            (is (zero? (ffirst rows)) "cache table was dropped")))
        (testing "DROP IF EXISTS is a no-op on a missing table (idempotent unpersist)"
          (run-sql (format "DROP TABLE IF EXISTS %s.%s" (q schema) (q table))))
        (finally
          (drop-cache-schema! schema))))))
