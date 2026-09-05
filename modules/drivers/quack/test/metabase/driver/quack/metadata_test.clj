(ns ^:synchronous metabase.driver.quack.metadata-test
  "Tier B — sync-metadata tests. Validates the driver's metadata queries
  (the SQL describe-database* / describe-fields / describe-fks /
  syncable-schemas / table-exists? emit) directly against a live Quack server,
  WITHOUT needing the Metabase classpath.

  This matters because the metadata queries switched from `information_schema`
  (with hardcoded system-schema name blocklists) to the `duckdb_*` table
  functions + their `internal`/`readonly` flags. These tests lock in:

  * system schemas never leak into describe-* / syncable-schemas (the `internal`
    flag works, not a name blocklist);
  * read-only attached sources are auto-excluded from syncable-schemas (the
    `readonly` flag works, not a hardcoded 'mongosrc' name);
  * views are discovered as VIEW (duckdb_views, not just information_schema);
  * nullability comes back as a real boolean (duckdb_columns.is_nullable is
    BOOLEAN, not the 'YES'/'NO' string information_schema returns).

  Live-server gated; skips gracefully (no failure) if no Quack is reachable.

  Run via the in-tree test runner (see modules/drivers/quack/README.md)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver.quack.client :as client]
   [metabase.util.log :as log])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)

(def host (or (System/getenv "QUACK_HOST") "127.0.0.1"))
(def port (Integer/parseInt (or (System/getenv "QUACK_PORT") "9494")))
(def token (or (System/getenv "QUACK_TOKEN") "devtoken"))
(def details {:host host :port port :ssl false :token token :timeout-seconds 60})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String host ^int port)] true)
       (catch Exception _ false)))

(def ^:private live? (atom nil))

(use-fixtures :once
  (fn [t]
    (if (reachable?)
      (do (reset! live? true) (client/reset-pool!) (t))
      (do (reset! live? false)
          (log/infof "[metadata-test] SKIP: no Quack server at %s:%s" host port)))))

(defn- when-live [& body] (when @live? (dorun body)))

(defn- q
  "Run SQL via the Quack client and realize all rows. Metadata queries are small."
  [sql]
  (-> (client/execute-query details sql) :rows (->> (into []))))

;; Same catalog-folding CASE the driver uses (kept in sync by hand; the source
;; of truth is metabase.driver.quack/schema-sql, but we don't want this test to
;; require the Metabase classpath just to format a SQL string).
(def ^:private fold
  "CASE WHEN database_name = current_database()
        THEN schema_name
        ELSE database_name || '.' || schema_name
   END")

;;; ===========================================================================
;;; M1. describe-database* shape — duckdb_tables + duckdb_views, NOT internal
;;; ===========================================================================

(defn- describe-database-rows []
  (q (format "SELECT %s AS schema, table_name AS name, 'BASE TABLE' AS table_type
              FROM duckdb_tables()
              WHERE NOT internal
              UNION ALL
              SELECT %s AS schema, view_name AS name, 'VIEW' AS table_type
              FROM duckdb_views()
              WHERE NOT internal
              ORDER BY 1, 2" fold fold)))

(deftest m1-describe-database-no-system-schemas-test
  (when-live
   (testing "describe-database* excludes every internal/system schema WITHOUT a
             hardcoded name blocklist — the duckdb_*.internal flag does it. The
             seed DB has samples.* (user) + many internal schemas (pg_catalog,
             information_schema, system, plus whatever extensions register); only
             the user schema should appear."
     (let [rows (describe-database-rows)
           schemas (into #{} (map first) rows)]
       (is (contains? schemas "samples") "the user samples schema is present")
       (is (not (contains? schemas "information_schema"))
           "information_schema is filtered via `internal`, not a name blocklist")
       (is (not (contains? schemas "pg_catalog"))
           "pg_catalog is filtered via `internal`")
       (is (not (some #(re-find #"(?i)^(system|temp|pg_)" (str %)) schemas))
           "no system/temp/pg_ schemas leak through")))))

(deftest m1b-describe-database-surface-views-test
  (when-live
   (testing "duckdb_views is in the UNION — the seed fk_view and range_v come
             back tagged as VIEW, not as BASE TABLE (the bug if information_schema
             or duckdb_views were dropped from the query)."
     (let [rows   (describe-database-rows)
           by-name (into {} (map (fn [r] [[(first r) (second r)] (nth r 2)]) rows))]
       (is (= "VIEW" (get by-name ["samples" "fk_view"])))
       (is (= "VIEW" (get by-name ["samples" "range_v"])))
       (is (= "BASE TABLE" (get by-name ["samples" "ints"])))))))

;;; ===========================================================================
;;; M2. describe-fields shape — duckdb_columns, NOT internal, BOOLEAN nullability
;;; ===========================================================================

(defn- describe-field-rows []
  (q (format "SELECT %s AS schema, table_name AS name, column_name, data_type,
                     column_index AS ordinal_position,
                     NOT is_nullable AS is_not_nullable, column_default
              FROM duckdb_columns()
              WHERE NOT internal
              ORDER BY 1, 2, 5" fold)))

(deftest m2-describe-fields-no-system-columns-test
  (when-live
   (testing "describe-fields excludes internal/system columns via `internal`"
     (let [rows (describe-field-rows)
           schemas (into #{} (map first) rows)]
       (is (every? #(= "samples" %) schemas)
           "only the samples schema's columns are surfaced; no system columns")))))

(deftest m2b-describe-fields-nullable-is-boolean-test
  (when-live
   (testing "duckdb_columns.is_nullable is a BOOLEAN, NOT the 'YES'/'NO' string
             information_schema returns. The driver now reads `NOT is_nullable`
             as a real bool; this test guards against a silent regression to
             string comparison."
     ;; fk_child.id is PRIMARY KEY (NOT NULL → is_not_nullable=true);
     ;; fk_child.parent_id is nullable (is_not_nullable=false).
     (let [rows (describe-field-rows)
           by-tc (into {} (for [r rows] [[(second r) (nth r 2)] r]))
           id-row        (get by-tc ["fk_child" "id"])
           parentid-row  (get by-tc ["fk_child" "parent_id"])]
       (is (some? id-row) "the fk_child.id column was found")
       (is (true? (nth id-row 5))        "PK column is_not_nullable=true")
       (is (false? (nth parentid-row 5)) "non-PK column is_not_nullable=false")
       (is (boolean? (nth id-row 5))
           "is_not_nullable is a real boolean (not a 'YES'/'NO' string)")))))

;;; ===========================================================================
;;; M2c. describe-fields honors :table-names / :schema-names filters
;;; ===========================================================================
;; THE TRANSFORM BUG: Metabase sync calls describe-fields with
;;   :table-names ["<table>"] :schema-names ["<schema>"]
;; to fetch ONE table's fields (metabase.sync.fetch-metadata/table-fields-metadata).
;; If the driver ignores those filters and returns every field of every table,
;; Metabase attributes them ALL to the single table being synced and the
;; METABASE_FIELD unique index on (name, table_id) blows up. This test drives
;; the SAME filtered SQL the driver now emits, against two tables that share a
;; column name, and asserts only the requested table's columns come back.

(defn- filtered-field-rows [schema-filter table-filter]
  ;; Mirrors the SQL the driver's describe-fields now builds when Metabase
  ;; passes :schema-names / :table-names. schema-filter / table-filter are
  ;; either nil (no filter) or SQL string-literal lists like "'main'".
  (q (format "SELECT * FROM (
                SELECT %s AS schema, table_name AS name, column_name, data_type
                FROM duckdb_columns() WHERE NOT internal
              ) c
              WHERE %s%sTRUE
              ORDER BY 1, 2"
             fold
             (if schema-filter (str "schema IN (" schema-filter ") AND ") "")
             (if table-filter  (str "name IN (" table-filter ") AND ")   ""))))

(deftest ^:live m2c-describe-fields-table-filter-isolates-one-table-test
  (when-live
   (testing
    "describe-fields filtered by :table-names returns ONLY that table's
      fields, not fields from other tables that share column names."
     (q ["DROP TABLE IF EXISTS m2c_a"
         "DROP TABLE IF EXISTS m2c_b"
         ;; Two tables sharing a column name 'shared' — mirrors how a JOIN
         ;; of mongo+mysql worldcup tables both expose 'tournament_id'.
         "CREATE TABLE m2c_a (shared VARCHAR, a_only INTEGER)"
         "CREATE TABLE m2c_b (shared VARCHAR, b_only INTEGER)"])
     (let [native-schema (ffirst (q ["SELECT current_schema()"]))
           rows-a (filtered-field-rows (str "'" native-schema "'") "'m2c_a'")
           names-a (set (map #(nth % 2) rows-a))]
       (is (= #{"shared" "a_only"} names-a)
           (str "filtered describe-fields for m2c_a must return only m2c_a's columns; "
                "got: " (sort names-a)))
       (is (not (contains? names-a "b_only"))
           "fields from m2c_b must NOT leak through the table-names filter"))
     (q ["DROP TABLE IF EXISTS m2c_a"
         "DROP TABLE IF EXISTS m2c_b"]))))

(deftest ^:live m2c2-describe-fields-schema-only-filter-test
  (when-live
   (testing
    "describe-fields with :schema-names but NO :table-names must not
      produce malformed SQL. This is the database-wide sync path: Metabase
      passes :schema-names only, and the driver previously emitted
      '... AND nullTRUE' because Clojure's `format` turns a nil predicate
      into the literal string \"null\". Regression guard."
     (q ["DROP TABLE IF EXISTS m2c2_x"
         "DROP TABLE IF EXISTS m2c2_y"
         "CREATE TABLE m2c2_x (x_col VARCHAR)"
         "CREATE TABLE m2c2_y (y_col VARCHAR)"])
     (let [native-schema (ffirst (q ["SELECT current_schema()"]))
           ;; schema-only: table-filter is nil — must not blow up.
           rows (filtered-field-rows (str "'" native-schema "'") nil)
           tables (set (map second rows))]
       (is (contains? tables "m2c2_x")
           "schema-only filter should return both tables' fields")
       (is (contains? tables "m2c2_y")
           "schema-only filter should return both tables' fields"))
     (q ["DROP TABLE IF EXISTS m2c2_x"
         "DROP TABLE IF EXISTS m2c2_y"]))))

;;; ===========================================================================
;;; M3. syncable-schemas — readonly + internal (no hardcoded 'mongosrc')
;;; ===========================================================================

(defn- syncable-schema-rows []
  (q "WITH writable_dbs AS (
        SELECT database_name FROM duckdb_databases() WHERE NOT internal AND NOT readonly
      )
      SELECT CASE WHEN s.database_name = current_database()
                  THEN s.schema_name
                  ELSE s.database_name || '.' || s.schema_name
             END AS schema
      FROM writable_dbs d
      JOIN duckdb_schemas() s ON s.database_name = d.database_name
      WHERE (NOT s.internal OR s.schema_name = 'main')
      ORDER BY 1"))

(deftest m3-syncable-schemas-excludes-readonly-and-internal-test
  (when-live
   (testing "syncable-schemas is driven by duckdb_databases.readonly/internal,
             not a hardcoded name blocklist. The seed DB has:
             quack (duckdb, writable) + system + temp (both internal=true) — only
             the native catalog's user schemas should appear."
     (let [rows (syncable-schema-rows)
           schemas (into #{} (map first) rows)]
       (is (contains? schemas "samples")
           "the native writable catalog's user schema appears PLAIN (no catalog prefix — matches describe-database* so the dropdown label agrees with the data browser)")
       (is (contains? schemas "main")
           "`main` is included even though duckdb_schemas() marks it internal=true — it is the default USER schema and must be selectable for uploads/transforms")
       (is (not-any? #(re-find #"(?i)^(system|temp)(\.|$)" (str %)) schemas)
           "system/temp (internal=true in duckdb_databases) are excluded at the catalog level")
       (is (not-any? #(re-find #"(?i)pg_catalog|information_schema" (str %)) schemas)
           "genuinely-internal schemas (pg_catalog, information_schema) are excluded")))))

;;; ===========================================================================
;;; M4. table-exists? — checks duckdb_tables AND duckdb_views
;;; ===========================================================================

(deftest m4-table-exists-checks-base-and-view-test
  (when-live
   (testing "table-exists? finds both base tables and views (the query SUMs
             duckdb_tables + duckdb_views so a VIEW — count 0 from tables, 1 from
             views — is detected). Guards against the (ffirst rows) bug where a
             UNION returns [0] then [1] and only the first row is read."
     (let [exists? (fn [name schema]
                     (let [rows (q (format "SELECT sum(n) AS total FROM (
                                              SELECT count(*) AS n FROM duckdb_tables()
                                              WHERE table_name = '%s' AND %s = '%s'
                                              UNION ALL
                                              SELECT count(*) AS n FROM duckdb_views()
                                              WHERE view_name = '%s' AND %s = '%s'
                                            ) x"
                                           name fold schema name fold schema))]
                       (pos? (ffirst rows))))]
       (is (true?  (exists? "ints"     "samples")) "base table found")
       (is (true?  (exists? "fk_view"  "samples")) "view found")
       (is (false? (exists? "nope_xyz" "samples")) "nonexistent table not found")))))

;;; ===========================================================================
;;; M5. describe-fks — still works against duckdb_constraints
;;; ===========================================================================

(deftest m5-describe-fks-still-resolves-test
  (when-live
   (testing "the catalog-folding CASE in describe-fks still resolves the seed
             fk_child → fk_parent relationship correctly after the rewrite."
     (let [rows (q (format "SELECT %s AS fk_schema, c.table_name AS fk_table,
                                   UNNEST(c.constraint_column_names) AS fk_col,
                                   %s AS pk_schema, c.referenced_table AS pk_table,
                                   UNNEST(c.referenced_column_names) AS pk_col
                            FROM duckdb_constraints() c
                            WHERE c.constraint_type = 'FOREIGN KEY'" fold fold))]
       (is (= [["samples" "fk_child" "parent_id" "samples" "fk_parent" "id"]]
              (mapv vec rows)))))))

(when-not @live?
  (deftest m0-skip-notice-test
    (testing "no live Quack server reachable — see server/docker-compose.yml"
      (is true))))
