(ns metabase.sql-parsing.core-test
  "Every function `metabase.sql-parsing.core` publishes, one test each, over the cases in `test_cases/`.

  [[metabase.sql-parsing.case-files]] reads the cases."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sql-parsing.case-files :as case-files]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- normalize-fields
  "Field references as `[table field]` or `[catalog schema table field]`, lower-cased and sorted, so one expectation
  covers the dialects that fold identifiers. Compared at whatever arity the case was written in."
  [arity fields]
  (->> fields
       (map (fn [f]
              (let [f (mapv #(some-> % u/lower-case-en) f)]
                (if (= 2 arity) [(nth f (- (count f) 2)) (last f)] f))))
       sort
       vec))

;;; --------------------------------------------- parse-error-message ----------------------------------------------

(defn- parse-failure
  "The exception `sql` fails to parse with."
  [dialect sql]
  (try
    (sql-parsing/referenced-tables (sql-tools/sqlglot-parser) dialect sql)
    (is false (str "expected " (pr-str sql) " not to parse"))
    (catch Exception e e)))

(deftest ^:parallel parse-error-message-test
  (testing "what a parse failure tells whoever wrote the SQL, once the parser's own workings are out of it"
    (doseq [{:keys [name sql dialect internals diagnostic]} (case-files/cases "parse_error_message")]
      (testing name
        (let [e (parse-failure dialect sql)]
          (is (sql-parsing/parse-error? e))
          (testing "the parser still reports the internals the diagnostic is cleaned of"
            (is (str/includes? (or (some-> (ex-cause e) ex-message) (ex-message e)) internals)))
          (testing "and the caller reads the error, its place, and a caret under the token"
            (is (= diagnostic (sql-parsing/parse-error-message e)))))))))

(deftest ^:parallel parse-error-message-without-a-message-test
  (testing "an exception carrying no message of its own has no diagnostic to give"
    (is (nil? (sql-parsing/parse-error-message (ex-info nil {}))))))

;;; ------------------------------------------------ referenced-tables ---------------------------------------------

(defn- normalize-tables
  "Table references lower-cased and sorted, so one expectation covers a dialect that folds identifiers up (Snowflake)
  and one that folds them down (Postgres)."
  [tables]
  (sort (mapv (fn [[catalog schema table]]
                [(some-> catalog u/lower-case-en) (some-> schema u/lower-case-en) (u/lower-case-en table)])
              tables)))

(deftest ^:parallel referenced-tables-test
  (testing "the tables a query reads, which is what Guard A of a transform test asks for"
    (doseq [{:keys [name sql dialect tables error]} (case-files/expanded-cases "referenced_tables")]
      (testing (str name ", dialect " (pr-str dialect))
        (if error
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                (re-pattern (str "^sqlglot call failed: " (java.util.regex.Pattern/quote error) "$"))
                                (sql-parsing/referenced-tables (sql-tools/sqlglot-parser) dialect sql)))
          (is (= (normalize-tables tables)
                 (normalize-tables (sql-parsing/referenced-tables (sql-tools/sqlglot-parser) dialect sql)))
              (pr-str sql)))))))

(deftest ^:parallel referenced-tables-upstream-test
  (testing "the tables in each statement of sqlglot's own identity tests, read with no dialect, exactly as sqlglot finds them"
    (doseq [{:keys [sql tables]} (case-files/cases "referenced_tables_upstream")]
      (is (= (sort tables)
             (sort (sql-parsing/referenced-tables (sql-tools/sqlglot-parser) nil sql)))
          (pr-str sql)))))

;;; ------------------------------------------------- replace-names ------------------------------------------------

(deftest ^:parallel replace-names-test
  (testing "the query rewritten to read other tables, which is how a transform test reads its fixtures"
    (doseq [{:keys [name sql dialect replacements expected]} (case-files/cases "replace_names")]
      (testing name
        (is (= expected (sql-parsing/replace-names (sql-tools/sqlglot-parser) dialect sql replacements))
            (pr-str sql))))))

;;; ------------------------------------------------ add-into-clause -----------------------------------------------

(deftest ^:parallel add-into-clause-test
  (testing "a SELECT rewritten as a SQL Server SELECT INTO, or the error when it is not a SELECT"
    (doseq [{:keys [name sql dialect table-name expected error]} (case-files/cases "add_into_clause")]
      (testing name
        (if error
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                (re-pattern (str "^sqlglot call failed: " (java.util.regex.Pattern/quote error) "$"))
                                (sql-parsing/add-into-clause (sql-tools/sqlglot-parser) dialect sql table-name)))
          (is (= expected (sql-parsing/add-into-clause (sql-tools/sqlglot-parser) dialect sql table-name))
              (pr-str sql)))))))

;;; ------------------------------------------------ simple-query --------------------------------------------------

(deftest ^:parallel simple-query-test
  (testing "whether the query is a plain SELECT, and the reason when it is not"
    (doseq [{:keys [name sql dialect expected]} (case-files/cases "simple_query")]
      (testing name
        (is (= expected (sql-parsing/simple-query? (sql-tools/sqlglot-parser) dialect sql))
            (pr-str sql))))))

;;; ------------------------------------------------ transpile-sql -------------------------------------------------

(deftest ^:parallel transpile-sql-test
  (testing "a query rewritten from one dialect to another, or skipped when it holds a template tag"
    (doseq [{:keys [name sql from to expected]} (case-files/cases "transpile_sql")]
      (testing name
        (is (= expected (sql-parsing/transpile-sql (sql-tools/sqlglot-parser) sql from to))
            (pr-str sql))))))

;;; ------------------------------------------------ field-references ----------------------------------------------

(deftest ^:parallel field-references-test
  (testing "the fields a query reads and returns, and the qualifiers that resolve to nothing"
    (doseq [{:keys [name sql dialect expected]} (case-files/cases "field_references")]
      (testing name
        (is (= expected (sql-parsing/field-references (sql-tools/sqlglot-parser) dialect sql))
            (pr-str sql))))))

(deftest ^:parallel field-references-alias-per-select-item-test
  (testing "a column selected with and without an alias keeps the alias of each select item"
    (is (= ["b" "a"]
           (mapv :alias (:returned-fields (sql-parsing/field-references
                                           (sql-tools/sqlglot-parser)
                                           "postgres"
                                           "SELECT u.a AS b, u.a FROM (SELECT a FROM x UNION SELECT a FROM y) u")))))))

;;; ------------------------------------------ single-stmt classification ------------------------------------------

(deftest ^:parallel single-stmt-classification-test
  (testing "whether a query is one statement of the kind asked for, which is what tells a caller the rest is unread"
    (doseq [{:keys [name sql dialect stmt-type expected validate-expected]} (case-files/expanded-cases "single_stmt")]
      (testing (str name ", dialect " (pr-str dialect))
        (let [classified (sql-parsing/classify-stmt (sql-tools/sqlglot-parser) dialect sql stmt-type)
              validated  (sql-parsing/validate-executable-stmt (sql-tools/sqlglot-parser) dialect sql stmt-type)]
          (is (=? expected classified) (pr-str sql))
          (if validate-expected
            (is (=? validate-expected validated) (pr-str sql))
            (is (= classified validated) (pr-str sql))))))))

;;; ------------------------------------------- returned-columns-lineage -------------------------------------------

(defn- unordered-dependencies
  "Lineage with each column's dependencies as a set: their order is not stable from one run to the next."
  [lineage]
  (mapv (fn [[column pure? dependencies]] [column pure? (set dependencies)]) lineage))

(deftest ^:parallel returned-columns-lineage-test
  (testing "the columns a query returns, whether each is a table column passed through, and the columns it reads"
    (doseq [{:keys [name sql dialect default-schema schema expected]} (case-files/cases "returned_columns")]
      (testing name
        (is (= (unordered-dependencies expected)
               (unordered-dependencies
                (sql-parsing/returned-columns-lineage (sql-tools/sqlglot-parser) dialect sql default-schema (or schema {}))))
            (pr-str sql))))))

;;; ------------------------------------------------- validate-query -----------------------------------------------

(deftest ^:parallel validate-query-test
  (testing "a query checked against a schema, column by column"
    (let [schemas (:schemas (edn/read-string (slurp (io/resource "metabase/sql_parsing/test_cases/validate_query.edn"))))]
      (doseq [{:keys [name sql dialect default-schema schema expected]} (case-files/cases "validate_query")]
        (testing name
          (is (=? expected (sql-parsing/validate-query (sql-tools/sqlglot-parser) dialect sql default-schema (get schemas schema)))
              (pr-str sql)))))))

;;; ------------------------------------------------ referenced-fields ---------------------------------------------

(deftest ^:parallel referenced-fields-test
  (testing "the fields a query reads, as the catalog/schema/table/field tuples a caller matches against metadata"
    (doseq [{:keys [name sql dialect expected]} (case-files/cases "referenced_fields")]
      (testing name
        (let [arity (count (first expected))]
          (is (= (normalize-fields arity expected)
                 (normalize-fields (or arity 4) (sql-parsing/referenced-fields (sql-tools/sqlglot-parser) dialect sql)))
              (pr-str sql)))))))

;;; ------------------------------------------- strip-large-literal-lists ------------------------------------------

(deftest ^:parallel strip-large-literal-lists-test
  (testing "the literal lists too big for the parser to hold, replaced by a single NULL before it sees them"
    (doseq [{:keys [name expected] :as case} (case-files/cases "literal_stripping")]
      (testing name
        (let [sql    (case-files/built case)
              result (sql-parsing/strip-large-literal-lists sql)]
          (cond
            (= :unchanged expected)
            (is (identical? sql result) (pr-str (subs sql 0 (min 60 (clojure.core/count sql)))))

            (string? expected)
            (is (= expected result) (pr-str (subs sql 0 (min 60 (clojure.core/count sql)))))

            :else
            (do (doseq [text (:includes expected)]
                  (is (str/includes? result text) (pr-str result)))
                (doseq [text (:excludes expected)]
                  (is (not (str/includes? result text)) (pr-str result)))))
          (testing "stripping what was stripped changes nothing more"
            (is (= result (sql-parsing/strip-large-literal-lists result)))))))))

(deftest ^:parallel stripping-is-invisible-to-the-caller-test
  (testing "a query whose lists were stripped still reports the tables and fields it reads"
    (let [sql (str "SELECT a.name FROM accounts a WHERE a.id IN (" (str/join ", " (range 20000)) ")")]
      (is (= [[nil nil "accounts"]] (sql-parsing/referenced-tables (sql-tools/sqlglot-parser) "postgres" sql)))
      (is (= [[nil nil "accounts" "id"] [nil nil "accounts" "name"]]
             (sort (sql-parsing/referenced-fields (sql-tools/sqlglot-parser) "postgres" sql))))))
  (testing "but a classification never answers about a stripped rewrite"
    ;; Analysis can read a stripped query because it only needs the shape. A classification's answer has to
    ;; hold for the string the caller holds, so it parses the original and reports SQL over its ceiling as
    ;; unchecked rather than answering about a rewrite.
    (let [under (str "SELECT * FROM t WHERE id IN (" (str/join ", " (range 150)) ")")
          over  (str "SELECT * FROM t WHERE id IN (" (str/join ", " (range 20000)) ")")]
      (testing "a list the analysis threshold would strip still validates as one statement"
        (is (=? {:verdict :allowed} (sql-parsing/validate-executable-stmt (sql-tools/sqlglot-parser) "postgres" under "read"))))
      (testing "a list past the ceiling comes back unchecked, not stripped and vouched for"
        (is (= {:verdict :unknown, :reason "large-literal-list", :sql over}
               (sql-parsing/validate-executable-stmt (sql-tools/sqlglot-parser) "postgres" over "read")))))))
