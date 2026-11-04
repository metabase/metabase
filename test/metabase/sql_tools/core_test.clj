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
             all-tables      lib.metadata/tables]
         (with-redefs [lib.metadata/tables (fn [mp] (swap! catalog-fetches inc) (all-tables mp))]
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

;;; -------------------------------------------- transpile-sql ---------------------------------------------
;; transpile-sql is only implemented for the :sqlglot backend, so these tests bind it directly
;; rather than using test-parser-backends.

(deftest ^:parallel transpile-sql-snowflake-quotes-identifiers-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Snowflake should quote identifiers (case-sensitive dialect)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT id FROM PUBLIC.users"
                                                                     "snowflake" "snowflake")]
        (is (= :success status))
        (is (some? transpiled-sql))
        (is (str/includes? transpiled-sql "\"PUBLIC\""))
        (is (str/includes? transpiled-sql "\"users\""))))))

(deftest ^:parallel transpile-sql-postgres-quotes-identifiers-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "PostgreSQL should quote identifiers (case-sensitive dialect)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT id FROM public.users"
                                                                     "postgres" "postgres")]
        (is (= :success status))
        (is (some? transpiled-sql))
        (is (str/includes? transpiled-sql "\"public\""))
        (is (str/includes? transpiled-sql "\"users\""))))))

(deftest ^:parallel transpile-sql-mysql-no-quoting-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "MySQL should not add double-quote identifier quoting (not case-sensitive)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT id FROM users"
                                                                     "mysql" "mysql")]
        (is (= :success status))
        (is (some? transpiled-sql))
        (is (not (str/includes? transpiled-sql "\"")))))))

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

(deftest ^:parallel validate-executable-stmt-test
  (mt/test-drivers (mt/normal-drivers-with-feature :connection-impersonation)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          product-category (lib.metadata/field mp (mt/id :products :category))
          query (-> (lib/query mp products)
                    (lib/filter (lib/= product-category "Widget")))
          native-query (:query (qp.compile/compile-with-inline-parameters query))]
      (testing "A single SELECT statement returns true and the reconstructed SQL"
        (are [sql] (=? {:verdict :allowed :single-stmt? true :sql string?}
                       (sql-tools/validate-executable-stmt driver/*driver* sql "read"))
          native-query
          "SELECT 1"
          "SELECT * FROM table"
          "WITH x AS (SELECT * FROM foo) SELECT * from x"
          "WITH x AS (SELECT a FROM foo), y AS (SELECT b FROM bar), z AS (SELECT c FROM baz) SELECT x.a, y.b, z.c FROM x, y, z")))
    (testing "All other read queries are rejected"
      (are [sql single-stmt?] (=? {:verdict :disallowed :single-stmt? single-stmt?}
                                  (sql-tools/validate-executable-stmt driver/*driver* sql "read"))
        "SELECT 1; SELECT 2" false
        "SET ROLE NONE" true
        "DROP TABLE table" true
        "SET ROLE NONE; DROP TABLE table" false
        "SELECT set_config('role', 'none', false); DROP TABLE table" false))
    (testing "SQL the dialect cannot parse is :unknown, not :disallowed — nothing was read, so nothing is claimed"
      (is (=? {:verdict :unknown :reason "unparseable"}
              (sql-tools/validate-executable-stmt driver/*driver* "SELECT (" "read"))))
    (testing "a DO block smuggling SET ROLE is refused: one disallowed statement to a dialect that reads PL/pgSQL, unparseable to the rest"
      (is (=? (if (isa? driver/hierarchy driver/*driver* :postgres)
                {:verdict :disallowed :single-stmt? true}
                {:verdict :unknown :reason "unparseable"})
              (sql-tools/validate-executable-stmt
               driver/*driver* "DO $$ BEGIN EXECUTE 'SET ROLE NONE; DROP TABLE table'; END $$;" "read"))))
    (testing "A single insert, update or delete statement returns true and the reconstructed SQL"
      (are [sql] (=? {:verdict :allowed :single-stmt? true :sql string?}
                     (sql-tools/validate-executable-stmt driver/*driver* sql "write"))
        "INSERT INTO table VALUES (1)"
        "UPDATE table SET column = 1"
        "DELETE FROM table WHERE id = 1"))
    (testing "All other write queries are rejected"
      (are [sql single-stmt?] (=? {:verdict :disallowed :single-stmt? single-stmt?}
                                  (sql-tools/validate-executable-stmt driver/*driver* sql "write"))
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
        (is (=? {:verdict :allowed, :sql string?}
                (sql-tools/validate-executable-stmt driver/*driver* sql "read"))))
      (are [sql] (=? {:verdict :allowed, :single-stmt? true :sql string?}
                     (sql-tools/validate-executable-stmt driver/*driver* sql "read"))
        "SELECT * FROM foo UNION ALL SELECT * FROM bar INTERSECT ALL SELECT * FROM baz"
        "SELECT * FROM foo UNION ALL SELECT * FROM bar EXCEPT ALL SELECT * FROM baz"
        "SELECT * FROM foo INTERSECT ALL SELECT * FROM bar UNION ALL SELECT * FROM baz"
        "SELECT * FROM foo INTERSECT ALL SELECT * FROM bar EXCEPT ALL SELECT * FROM baz"
        "SELECT * FROM foo EXCEPT ALL SELECT * FROM bar UNION ALL SELECT * FROM baz"
        "SELECT * FROM foo EXCEPT ALL SELECT * FROM bar INTERSECT ALL SELECT * FROM baz"))))

(defn- placeholder-count
  [sql]
  (count (re-seq #"\?" sql)))

(deftest ^:parallel validate-executable-stmt-placeholder-cast-test
  (testing "queries with `?::` are parsed correctly"
    (doseq [sql ["SELECT ?::date"
                 "SELECT (?::date - x::date)"
                 "SELECT ?::text, ?::integer, ?::boolean FROM t WHERE x = ?"
                 "SELECT (?::date - CURRENT_DATE) AS diff"]]
      (let [{out-sql :sql :as result} (sql-tools/validate-executable-stmt :postgres sql "read")]
        (is (=? {:verdict :allowed :single-stmt? true :sql string?} result))
        (is (= (placeholder-count sql) (placeholder-count out-sql))))))
  (testing "a query with `?::` inside string literals are left untouched"
    (is (= {:verdict :allowed :single-stmt? true :sql "SELECT '?::date'"}
           (sql-tools/validate-executable-stmt :postgres "select '?::date'" "read"))))
  (testing "multi-statement queries with placeholder casts are still rejected"
    (are [sql] (=? {:verdict :disallowed :single-stmt? false}
                   (sql-tools/validate-executable-stmt :postgres sql "read"))
      "SELECT ?::date; DROP TABLE t"
      "SET ROLE NONE; SELECT ?::date")))

(deftest ^:parallel validate-executable-stmt-qdcolon-dialects-test
  (testing "databricks' native `expr?::type` try-cast operator is not split apart"
    (is (=? {:verdict :allowed :single-stmt? true :sql #"(?i).*TRY_CAST\(x AS DATE\).*"}
            (sql-tools/validate-executable-stmt :databricks "SELECT x?::date FROM t" "read")))))

(deftest ^:parallel validate-executable-stmt-large-literal-lists-test
  ;; A classification reads the ORIGINAL SQL, never a collapsed rewrite of it. A large but
  ;; ordinary literal list — the values a Number variable inlines for `IN ({{ids}})` — validates normally,
  ;; and a second statement nested in such a list is counted as a second statement however it is written,
  ;; because the parser sees the real input. Collapsing only guards, at a much higher threshold, against a
  ;; list so huge it would OOM GraalPy — those are refused outright rather than substituted.
  (testing "a large-but-under-ceiling literal list validates normally (the IN ({{ids}}) idiom)"
    (are [sql] (=? {:verdict :allowed :single-stmt? true :sql string?}
                   (sql-tools/validate-executable-stmt :postgres sql "read"))
      (str "SELECT x FROM (VALUES " (str/join ", " (repeat 105 "(1)")) ") AS t(x)")
      (str "SELECT x FROM t WHERE x IN (" (str/join ", " (range 105)) ")")
      (str "SELECT x FROM t WHERE (x, y) IN (" (str/join ", " (map #(format "(%d, %d)" % %) (range 105))) ")")
      (str "SELECT x FROM t WHERE x = ANY(ARRAY[" (str/join ", " (range 105)) "])")))
  (testing "a second statement alongside such a list is counted as a second statement"
    (let [base (str "SELECT x FROM t WHERE x IN (" (str/join ", " (range 105)) ")")]
      (are [sql] (=? {:verdict :disallowed}
                     (sql-tools/validate-executable-stmt :postgres sql "read"))
        (str "SELECT 1; " base)
        (str "SET ROLE none; " base)
        (str base "; SELECT 1")
        (str base "; SET ROLE none"))))
  (testing "a statement separator nested in a comment inside an oversized VALUES list is still counted"
    ;; a `--` comment can unbalance the JVM-side paren scan that decides whether to collapse a list; parsing
    ;; the original rather than the collapsed form, sqlglot counts two statements either way
    (let [sql (str "SELECT * FROM (VALUES " (str/join "," (repeat 101 "(1)"))
                   ",( -- ((\n 1 )) t ; SELECT 2 --)) t")]
      (is (=? {:verdict :disallowed}
              (sql-tools/validate-executable-stmt :postgres sql "read")))))
  (testing "a literal list beyond the ceiling comes back unchecked (memory guard), not parsed"
    (let [huge (str "SELECT x FROM t WHERE x IN (" (str/join "," (range 2500)) ")")]
      (is (= {:verdict :unknown, :reason "large-literal-list", :sql huge}
             (sql-tools/validate-executable-stmt :postgres huge "read")))))
  (testing "a driver with no SQLGlot dialect cannot be validated for execution"
    ;; sqlglot would otherwise parse in its generic dialect and hand back a confident verdict plus a
    ;; generically-regenerated `:sql` string, which a caller that executes the `:sql` would go on to run.
    (is (= {:verdict :unknown, :reason "unknown-dialect", :sql "SELECT 1"}
           (sql-tools/validate-executable-stmt :h2 "SELECT 1" "read")))))

(deftest ^:parallel validate-executable-stmt-no-length-cap-test
  (testing "a caller that will execute the SQL has no length cap: long native queries are legitimate"
    (let [long-sql (str "SELECT 1 FROM t WHERE x = '" (str/join (repeat (* 32 1024) "a")) "'")]
      (is (=? {:verdict :allowed} (sql-tools/validate-executable-stmt :postgres long-sql "read"))))))
