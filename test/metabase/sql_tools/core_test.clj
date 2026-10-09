(ns ^:mb/driver-tests metabase.sql-tools.core-test
  "Tests for sql-tools that run against both :macaw and :sqlglot backends.

   These tests verify that both parser implementations produce compatible results
   for common operations, ensuring we can switch backends without breaking the app."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing are]]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.settings :as sql-tools.settings]
   [metabase.sql-tools.test-util :as sql-tools.tu]
   [metabase.test :as mt]))

;;; ------------------------------------------------ validate-query ------------------------------------------------

(deftest ^:parallel validate-query-syntax-error-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "complete nonsense query")]
       (testing "Gibberish SQL returns syntax error"
         (is (= #{(lib/syntax-error)}
                (sql-tools/validate-query driver/*driver* query))))))))

(deftest ^:parallel validate-query-missing-column-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "select nonexistent from orders")]
       (testing "Reference to non-existent column returns missing-column error"
         (is (= #{(lib/missing-column-error "NONEXISTENT")}
                (sql-tools/validate-query driver/*driver* query))))))))

(deftest ^:parallel validate-query-valid-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "select id, total from orders")]
       (testing "Valid query returns empty error set"
         (is (= #{}
                (sql-tools/validate-query driver/*driver* query))))))))

;;; ---------------------------------------------- referenced-tables -----------------------------------------------

(deftest ^:parallel referenced-tables-basic-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "select id from orders")]
       (testing "Single table reference"
         (is (= #{{:table (mt/id :orders)}}
                (sql-tools/referenced-tables driver/*driver* query))))))))

(deftest ^:parallel referenced-tables-join-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider)
                                   "select o.id from orders o join products p on o.product_id = p.id")]
       (testing "Join references both tables"
         (is (= #{{:table (mt/id :orders)}
                  {:table (mt/id :products)}}
                (sql-tools/referenced-tables driver/*driver* query))))))))

(deftest referenced-tables-fetches-only-named-tables-test
  (testing "GHY-4251: referenced-tables looks up only the Tables the SQL names, never the Database's whole catalog.
           Fetching the catalog per entity made dependency analysis scale with warehouse size instead of query size,
           OOM-killing instances with ~20k synced tables."
    (sql-tools.tu/test-parser-backends
     (mt/test-driver :h2
       (let [catalog-fetches (atom 0)
             ;; capture via `original-fn`: once the var is proxied, a bare symbol ref resolves to the
             ;; proxy and delegating to it would recurse forever.
             all-tables      (mt/original-fn #'lib.metadata/tables)]
         (mt/with-dynamic-fn-redefs [lib.metadata/tables (fn [mp] (swap! catalog-fetches inc) (all-tables mp))]
           (testing "the referenced table still resolves"
             ;; H2 stores table names upper-cased while the query spells them lower-case, so this also covers the
             ;; case-folding that makes an exact name match unusable (the same mismatch Snowflake has).
             (is (= #{{:table (mt/id :orders)}}
                    (sql-tools/referenced-tables driver/*driver*
                                                 (lib/native-query (mt/metadata-provider)
                                                                   "select id from orders")))))
           (testing "and it did so without fetching the catalog"
             (is (zero? @catalog-fetches)))))))))

;;; ------------------------------------------------ replace-names -------------------------------------------------

(deftest ^:parallel replace-names-table-test
  (sql-tools.tu/test-parser-backends
   (testing "Basic table replacement"
     (is (= "SELECT * FROM new_orders"
            (sql-tools/replace-names :h2
                                     "SELECT * FROM orders"
                                     {:tables {{:table "orders"} "new_orders"}}))))))

(deftest ^:parallel replace-names-schema-test
  (sql-tools.tu/test-parser-backends
   (testing "Schema replacement"
     (is (= "SELECT * FROM new_schema.orders"
            (sql-tools/replace-names :h2
                                     "SELECT * FROM old_schema.orders"
                                     {:schemas {"old_schema" "new_schema"}}))))))

;;; -------------------------------------------- referenced-tables-raw ---------------------------------------------

(deftest ^:parallel referenced-tables-raw-test
  (sql-tools.tu/test-parser-backends
   (testing "Returns table names without resolving to IDs"
     ;; SQLGlot includes {:schema nil} while Macaw omits it - use =? for partial match
     (is (=? [{:table "orders"}]
             (sql-tools/referenced-tables-raw :h2 "SELECT * FROM orders"))))))

(deftest ^:parallel referenced-tables-raw-with-schema-test
  (sql-tools.tu/test-parser-backends
   (testing "Includes schema when present"
     (is (= [{:schema "public" :table "orders"}]
            (sql-tools/referenced-tables-raw :postgres "SELECT * FROM public.orders"))))))

(deftest ^:parallel referenced-tables-raw-strict-parse-error-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "ordinary callers retain the fail-soft behavior"
      (is (= [] (sql-tools/referenced-tables-raw :postgres "SELECT !!!"))))
    (testing "Guard A can distinguish a parse failure from a query with no table reads"
      (let [e (try
                (sql-tools/referenced-tables-raw :postgres "SELECT !!!" {:fail-on-parse-error? true})
                (catch Exception e e))]
        (is (sql-parsing/parse-error? e))))))

;;; -------------------------------------------- transpile-sql ---------------------------------------------
;; transpile-sql is only implemented for the :sqlglot backend, so these tests bind it directly
;; rather than using test-parser-backends.

(deftest ^:parallel transpile-sql-no-added-quoting-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "unquoted identifiers stay unquoted, so folding dialects resolve them as written"
      (doseq [dialect ["snowflake" "postgres" "mysql"]]
        (testing dialect
          (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT id FROM public.users"
                                                                         dialect dialect)]
            (is (= :success status))
            (is (some? transpiled-sql))
            (is (not (re-find #"[\"`]" transpiled-sql)))))))))

(deftest ^:parallel transpile-sql-multi-statement-rejected-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Multiple SQL statements should be rejected"
      (let [{:keys [status error-message]} (sql-tools/transpile-sql "SELECT 1; SELECT 2"
                                                                    "postgres" "postgres")]
        (is (= :error status))
        (is (str/includes? error-message "Multiple SQL statements"))))))

(deftest ^:parallel transpile-sql-preserves-query-structure-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Transpilation preserves query structure"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql
                                             "SELECT a, b FROM t WHERE x > 1 ORDER BY a"
                                             "snowflake" "snowflake")]
        (is (= :success status))
        (is (str/includes? transpiled-sql "SELECT"))
        (is (str/includes? transpiled-sql "FROM"))
        (is (str/includes? transpiled-sql "WHERE"))
        (is (str/includes? transpiled-sql "ORDER BY"))))))

(deftest ^:parallel transpile-sql-pretty-formatting-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Transpilation applies pretty formatting (newlines)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT a,b,c FROM users WHERE id=1"
                                                                     "postgres" "postgres")]
        (is (= :success status))
        (is (str/includes? transpiled-sql "\n"))))))

(deftest ^:parallel transpile-sql-template-tags-skipped-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "SQL with Metabase template tags is skipped"
      (let [{:keys [status reason]} (sql-tools/transpile-sql "SELECT * FROM {{#42}} WHERE id = {{user_id}}"
                                                             "postgres" "postgres")]
        (is (= :skipped status))
        (is (= :contains-templates reason))))
    (testing "SQL with optional clause brackets is skipped"
      (let [{:keys [status reason]} (sql-tools/transpile-sql "SELECT * FROM users [[WHERE active = true]]"
                                                             "mysql" "mysql")]
        (is (= :skipped status))
        (is (= :contains-templates reason))))))

(deftest ^:parallel transpile-sql-missing-dialect-skipped-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Nil dialects are skipped"
      (let [{:keys [status reason]} (sql-tools/transpile-sql "SELECT 1" nil nil)]
        (is (= :skipped status))
        (is (= :missing-dialect reason))))))

(deftest ^:parallel is-single-stmt-of-type?-test
  (mt/test-drivers (mt/normal-drivers-with-feature :connection-impersonation)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          product-category (lib.metadata/field mp (mt/id :products :category))
          query (-> (lib/query mp products)
                    (lib/filter (lib/= product-category "Widget")))
          native-query (:query (qp.compile/compile-with-inline-parameters query))]
      (testing "A single SELECT statement returns true and the reconstructed SQL"
        (are [sql] (=? {:is-single-stmt? true :allowed-stmt-type? true :sql string?}
                       (sql-tools/is-single-stmt-of-type? driver/*driver* sql "read"))
          native-query
          "SELECT 1"
          "SELECT * FROM table"
          "WITH x AS (SELECT * FROM foo) SELECT * from x"
          "WITH x AS (SELECT a FROM foo), y AS (SELECT b FROM bar), z AS (SELECT c FROM baz) SELECT x.a, y.b, z.c FROM x, y, z")))
    (testing "All other read queries are rejected"
      (are [sql is-single-stmt?] (=? {:is-single-stmt? is-single-stmt? :allowed-stmt-type? false}
                                     (sql-tools/is-single-stmt-of-type? driver/*driver* sql "read"))
        "SELECT (" false
        "SELECT 1; SELECT 2" false
        "SET ROLE NONE" true
        "DROP TABLE table" true
        "SET ROLE NONE; DROP TABLE table" false
        "SELECT set_config('role', 'none', false); DROP TABLE table" false
        "DO $$ BEGIN EXECUTE 'SET ROLE NONE; DROP TABLE table'; END $$;" (isa? driver/hierarchy driver/*driver* :postgres)))
    (testing "A single insert, update or delete statement returns true and the reconstructed SQL"
      (are [sql] (=? {:is-single-stmt? true :allowed-stmt-type? true :sql string?}
                     (sql-tools/is-single-stmt-of-type? driver/*driver* sql "write"))
        "INSERT INTO table VALUES (1)"
        "UPDATE table SET column = 1"
        "DELETE FROM table WHERE id = 1"))
    (testing "All other write queries are rejected"
      (are [sql is-single-stmt?] (=? {:is-single-stmt? is-single-stmt? :allowed-stmt-type? false}
                                     (sql-tools/is-single-stmt-of-type? driver/*driver* sql "write"))
        "SELECT 1" true
        "INSERT INTO table VALUES (1); SELECT 1" false
        "UPDATE table SET column = 1; SELECT 1" false
        "DELETE FROM table WHERE id = 1; SELECT 1" false
        "SET ROLE NONE; INSERT INTO table VALUES (1)" false
        "SELECT set_config('role', 'none', false); DELETE FROM table WHERE id = 1" false))
    (testing "A single set operation statement returns true and the reconstructed SQL"
      (doseq [op ["UNION ALL" "INTERSECT ALL" "EXCEPT ALL"]
              ts [["foo" "bar"] ["foo" "bar" "baz"]]
              :let [sql (str/join (str " " op " ") (map #(str "SELECT * FROM " %) ts))]]
        (is (=? {:is-single-stmt? true, :sql string?}
                (sql-tools/is-single-stmt-of-type? driver/*driver* sql "read"))))
      (are [sql] (=? {:is-single-stmt? true, :allowed-stmt-type? true :sql string?}
                     (sql-tools/is-single-stmt-of-type? driver/*driver* sql "read"))
        "SELECT * FROM foo UNION ALL SELECT * FROM bar INTERSECT ALL SELECT * FROM baz"
        "SELECT * FROM foo UNION ALL SELECT * FROM bar EXCEPT ALL SELECT * FROM baz"
        "SELECT * FROM foo INTERSECT ALL SELECT * FROM bar UNION ALL SELECT * FROM baz"
        "SELECT * FROM foo INTERSECT ALL SELECT * FROM bar EXCEPT ALL SELECT * FROM baz"
        "SELECT * FROM foo EXCEPT ALL SELECT * FROM bar UNION ALL SELECT * FROM baz"
        "SELECT * FROM foo EXCEPT ALL SELECT * FROM bar INTERSECT ALL SELECT * FROM baz"))))

(defn- placeholder-count
  [sql]
  (count (re-seq #"\?" sql)))

(deftest ^:parallel is-single-stmt-of-type-placeholder-cast-test
  (testing "queries with `?::` are parsed correctly"
    (doseq [sql ["SELECT ?::date"
                 "SELECT (?::date - x::date)"
                 "SELECT ?::text, ?::integer, ?::boolean FROM t WHERE x = ?"
                 "SELECT (?::date - CURRENT_DATE) AS diff"]]
      (let [{out-sql :sql :as result} (sql-tools/is-single-stmt-of-type? :postgres sql "read")]
        (is (=? {:is-single-stmt? true :allowed-stmt-type? true :sql string?} result))
        (is (= (placeholder-count sql) (placeholder-count out-sql))))))
  (testing "a query with `?::` inside string literals are left untouched"
    (is (= {:is-single-stmt? true :allowed-stmt-type? true :sql "SELECT '?::date'"}
           (sql-tools/is-single-stmt-of-type? :postgres "select '?::date'" "read"))))
  (testing "multi-statement queries with placeholder casts are still rejected"
    (are [sql] (=? {:is-single-stmt? false :allowed-stmt-type? false}
                   (sql-tools/is-single-stmt-of-type? :postgres sql "read"))
      "SELECT ?::date; DROP TABLE t"
      "SET ROLE NONE; SELECT ?::date")))

(deftest ^:parallel is-single-stmt-of-type-qdcolon-dialects-test
  (testing "databricks' native `expr?::type` try-cast operator is not split apart"
    (is (=? {:is-single-stmt? true :allowed-stmt-type? true :sql #"(?i).*TRY_CAST\(x AS DATE\).*"}
            (sql-tools/is-single-stmt-of-type? :databricks "SELECT x?::date FROM t" "read")))))

(deftest ^:parallel is-single-stmt-of-type-not-stripped-test
  (testing "we don't remove value clauses when validating impersonated queries (#74284)"
    (let [values-query (str "SELECT x FROM (VALUES " (str/join ", " (repeat 105 "(1)")) ") AS t(x)")]
      (are [sql is-single-stmt? allowed-stmt-type?]
           (= {:is-single-stmt? is-single-stmt? :allowed-stmt-type? allowed-stmt-type? :sql sql}
              (sql-tools/is-single-stmt-of-type? :postgres sql "read"))
        values-query true true
        (str "SELECT 1; " values-query) false false
        (str "SET ROLE none; " values-query) false false
        (str values-query "; SELECT 1") false false
        (str values-query "; SET ROLE none") false false)))
  (testing "we don't remove large IN lists, tuple lists, or arrays when validating impersonated queries"
    (doseq [query [(str "SELECT x FROM t WHERE x IN (" (str/join ", " (range 105)) ")")
                   (str "SELECT x FROM t WHERE (x, y) IN (" (str/join ", " (map #(format "(%d, %d)" % %) (range 105))) ")")
                   (str "SELECT x FROM t WHERE x = ANY(ARRAY[" (str/join ", " (range 105)) "])")]]
      (are [sql is-single-stmt? allowed-stmt-type?]
           (= {:is-single-stmt? is-single-stmt? :allowed-stmt-type? allowed-stmt-type? :sql sql}
              (sql-tools/is-single-stmt-of-type? :postgres sql "read"))
        query true true
        (str "SELECT 1; " query) false false
        (str query "; SELECT 1") false false))))

(deftest ^:parallel read-only-select?-test
  (doseq [driver [:postgres :mysql :h2]]
    (testing driver
      (testing "a single plain query is read-only"
        (are [sql] (true? (sql-tools/read-only-select? driver sql))
          "SELECT * FROM t"
          "WITH x AS (SELECT a FROM t) SELECT a, ROW_NUMBER() OVER (ORDER BY a) FROM x"
          "SELECT a FROM t UNION SELECT a FROM u INTERSECT SELECT a FROM v EXCEPT SELECT a FROM w"
          "SELECT * FROM (SELECT 1) s WHERE a IN (SELECT b FROM u)"
          "SELECT 1;"
          "-- leading\nSELECT 1 -- trailing"
          "/* leading */ SELECT 1; -- trailing"))
      (testing "anything else is not"
        (are [sql] (false? (sql-tools/read-only-select? driver sql))
          "SELECT 1; DROP TABLE t"
          "SELECT 1; SELECT 2"
          "INSERT INTO t VALUES (1)"
          "UPDATE t SET a = 1"
          "DELETE FROM t"
          "MERGE INTO t USING u ON t.id = u.id WHEN MATCHED THEN UPDATE SET a = u.a"
          "TRUNCATE TABLE t"
          "CREATE TABLE t (a INT)"
          "DROP TABLE t"
          "ALTER TABLE t ADD COLUMN b INT"
          "GRANT SELECT ON t TO u"
          "CALL p()"
          "EXEC p"
          "EXECUTE p"
          "SET search_path TO x"
          "COPY t TO '/tmp/t'"
          "SELECT * INTO t2 FROM t"
          "WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d"
          "SELECT * FROM t FOR UPDATE"
          "SELECT * FROM t FOR SHARE"
          "SELECT ("
          ""
          ";")))))

(deftest ^:parallel read-only-select?-side-effects-test
  (testing "a SELECT that advances a sequence or takes locks through a table hint is not read-only"
    (are [driver sql] (false? (sql-tools/read-only-select? driver sql))
      :sqlserver "SELECT NEXT VALUE FOR dbo.seq"
      :sqlserver "SELECT * FROM t WITH (UPDLOCK)"
      :sqlserver "SELECT * FROM t WITH (ROWLOCK, XLOCK)"
      :postgres  "SELECT nextval('seq')"
      :postgres  "SELECT SETVAL('seq', 1)"
      :sqlserver "SELECT * FROM t (TABLOCKX)"
      :oracle    "SELECT seq.NEXTVAL FROM dual"
      :snowflake "SELECT seq.nextval"
      :snowflake "SELECT 1 FROM TABLE(GETNEXTVAL(seq))"))
  (testing "reading a sequence or hinting a plain read is read-only"
    (are [driver sql] (true? (sql-tools/read-only-select? driver sql))
      :sqlserver "SELECT * FROM t WITH (NOLOCK)"
      :sqlserver "SELECT * FROM dbo.fn(1)"
      :postgres  "SELECT currval('seq')")))

(deftest ^:parallel read-only-select?-hidden-sql-test
  (testing "SQL the database would run and the parser reads as something else is not read-only"
    (are [driver sql] (false? (sql-tools/read-only-select? driver sql))
      ;; SQL Server ends the SELECT at a statement word, with no semicolon
      :sqlserver "SELECT 1 FROM t EXEC('DROP TABLE x')"
      :sqlserver "SELECT * FROM t SHUTDOWN"
      :sqlserver "SELECT * FROM t WAITFOR DELAY '00:00:10'"
      :sqlserver "SELECT * FROM t REVERT"
      ;; MySQL runs the body of an executable comment, and reads -- as a comment only before whitespace
      :mysql     "SELECT * FROM t /*! FOR UPDATE */"
      :mysql     "SELECT 1 /*!50000 INTO OUTFILE '/tmp/x' */"
      :mysql     "SELECT id --1 FROM t FOR UPDATE"
      ;; both marks are refused inside a string literal too: MySQL can end a literal where the parser does not
      :mysql     "SELECT '--draft' FROM t"
      :mysql     "SELECT 'x\\' FROM t FOR UPDATE # '"
      :mysql     "SELECT 'it\\'s' FROM t"
      :mysql     "SELECT 'x\\' /*!50000 INTO OUTFILE \"/tmp/x\" */ -- '"))
  (testing "the same words and marks are allowed where the database reads them as the parser does"
    (are [driver sql] (true? (sql-tools/read-only-select? driver sql))
      :sqlserver "SELECT [update], 'drop it' FROM t ORDER BY 1 OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY"
      :sqlserver "SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t"
      :mysql     "SELECT a - -1 FROM t"
      :mysql     "SELECT 'it''s', 'a\\\\b' FROM t"
      :postgres  "SELECT E'it\\'s'"
      :mysql     "SELECT a /* plain */ FROM t -- trailing"
      :postgres  "SELECT a --no space\n FROM t"
      :postgres  "SELECT 1 AS exec")))

(deftest ^:parallel read-only-select-problem-test
  (testing "SQL that is a read-only select has no problem"
    (is (nil? (sql-tools/read-only-select-problem :postgres "SELECT 1"))))
  (testing "SQL that is not one names the reason"
    (are [driver reason detail sql] (= {:reason reason, :detail detail}
                                       (sql-tools/read-only-select-problem driver sql))
      :postgres  :multiple-statements nil    "SELECT 1; SELECT 2"
      :postgres  :not-a-select        nil    "DELETE FROM t"
      :postgres  :writes-or-locks     nil    "SELECT * FROM t FOR UPDATE"
      :postgres  :unparseable         nil    "SELECT ("
      :sqlserver :statement-word      "EXEC" "SELECT 1 FROM t exec('DROP TABLE x')"
      :mysql     :executable-comment  nil    "SELECT * FROM t /*! FOR UPDATE */"
      :mysql     :bare-dash-comment   nil    "SELECT id --1 FROM t"
      :mysql     :backslash-quote     nil    "SELECT 'it\\'s' FROM t"
      :postgres  :not-a-select        nil    "-- nothing here"
      :postgres  :large-literal-list  nil    (str "SELECT * FROM t WHERE id IN ("
                                                  (str/join "," (range 200)) ")"))))

(deftest ^:parallel read-only-select?-large-literal-list-test
  (let [tuples (str/join ", " (repeat 105 "(1)"))]
    (testing "a second statement that literal-list stripping would fold into a comment is not missed"
      (is (false? (sql-tools/read-only-select?
                   :postgres
                   (str "SELECT 1 /* VALUES ( */; DROP TABLE t; /* ), " tuples " */")))))
    (testing "a literal list too large to parse whole is refused rather than parsed stripped"
      (is (false? (sql-tools/read-only-select? :postgres (str "SELECT x FROM (VALUES " tuples ") AS v(x)")))))))

(deftest ^:parallel read-only-select?-druid-test
  (testing "a Druid SELECT is read in the dialect sqlglot registers for Druid"
    (is (true? (sql-tools/read-only-select? :druid-jdbc "SELECT __time, COUNT(*) FROM wikipedia GROUP BY 1")))))
