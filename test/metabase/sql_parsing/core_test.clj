(ns metabase.sql-parsing.core-test
  "Every function `metabase.sql-parsing.core` publishes, one test each, over the cases in `test_cases/`.

  A case file is `{:cases [...]}` and each case carries its `:sql`, the `:dialect` to read it with, and what the
  function is expected to answer."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- cases
  "The cases in `test_cases/<file-name>.edn`, the file holding the cases for one function under test."
  [file-name]
  (let [path (str "metabase/sql_parsing/test_cases/" file-name ".edn")
        edn  (edn/read-string (slurp (or (io/resource path)
                                         (throw (ex-info (str "No case file at " path) {:path path})))))]
    (:cases edn)))

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
    (sql-parsing/referenced-tables dialect sql)
    (is false (str "expected " (pr-str sql) " not to parse"))
    (catch Exception e e)))

(deftest ^:parallel parse-error-message-test
  (testing "what a parse failure tells whoever wrote the SQL, once the parser's own workings are out of it"
    (doseq [{:keys [name sql dialect internals diagnostic]} (cases "parse_error_message")]
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
    (doseq [{:keys [name sql dialect tables]} (cases "referenced_tables")]
      (testing name
        (is (= (normalize-tables tables)
               (normalize-tables (sql-parsing/referenced-tables dialect sql)))
            (pr-str sql))))))

;;; ------------------------------------------------- replace-names ------------------------------------------------

(deftest ^:parallel replace-names-test
  (testing "the query rewritten to read other tables, which is how a transform test reads its fixtures"
    (doseq [{:keys [name sql dialect replacements expected]} (cases "replace_names")]
      (testing name
        (is (= expected (sql-parsing/replace-names dialect sql replacements))
            (pr-str sql))))))

;;; ------------------------------------------------ field-references ----------------------------------------------

(deftest ^:parallel field-references-test
  (testing "the fields a query reads and returns, and the qualifiers that resolve to nothing"
    (doseq [{:keys [name sql dialect errors returned]} (cases "field_references")]
      (testing name
        (let [result (sql-parsing/field-references dialect sql)]
          (is (= (set errors) (set (:errors result))) (pr-str sql))
          (is (= (sort returned)
                 (sort (keep :column (:returned-fields result))))
              (pr-str sql)))))))

;;; --------------------------------------------- is-single-stmt-of-type? ------------------------------------------

(deftest ^:parallel is-single-stmt-of-type?-test
  (testing "whether a query is one statement of the kind asked for, which is what tells a caller the rest is unread"
    (doseq [{:keys [name sql dialect stmt-type expected]} (cases "single_stmt")]
      (testing name
        (is (=? expected (sql-parsing/is-single-stmt-of-type? dialect sql stmt-type))
            (pr-str sql))))))

;;; ------------------------------------------- returned-columns-lineage -------------------------------------------

(deftest ^:parallel returned-columns-lineage-test
  (testing "the columns a query returns, which is what an expectation compares against"
    (doseq [{:keys [name sql dialect default-schema columns]} (cases "returned_columns")]
      (testing name
        (is (= columns
               (sort (map (comp u/lower-case-en first)
                          (sql-parsing/returned-columns-lineage dialect sql default-schema {}))))
            (pr-str sql))))))

;;; ------------------------------------------------- validate-query -----------------------------------------------

(deftest ^:parallel validate-query-test
  (testing "a query checked against a schema, column by column"
    (let [schemas (:schemas (edn/read-string (slurp (io/resource "metabase/sql_parsing/test_cases/validate_query.edn"))))]
      (doseq [{:keys [name sql dialect default-schema schema expected]} (cases "validate_query")]
        (testing name
          (is (=? expected (sql-parsing/validate-query dialect sql default-schema (get schemas schema)))
              (pr-str sql)))))))

;;; ------------------------------------------------ referenced-fields ---------------------------------------------

(deftest ^:parallel referenced-fields-test
  (testing "the fields a query reads, as the catalog/schema/table/field tuples a caller matches against metadata"
    (doseq [{:keys [name sql dialect expected]} (cases "referenced_fields")]
      (testing name
        (let [arity (count (first expected))]
          (is (= (normalize-fields arity expected)
                 (normalize-fields (or arity 4) (sql-parsing/referenced-fields dialect sql)))
              (pr-str sql)))))))

;;; ------------------------------------------- strip-large-literal-lists ------------------------------------------

(defn- built
  "The case's SQL: written out, or built from `:build` when the point of the case is a list too long to write."
  [{:keys [sql build]}]
  (or sql
      (let [{:keys [prefix item count extra separator suffix]} build
            items (cond-> (mapv #(format item % % %) (range count))
                    extra (conj extra))]
        (str prefix (str/join (or separator ", ") items) suffix))))

(deftest ^:parallel strip-large-literal-lists-test
  (testing "the literal lists too big for the parser to hold, replaced by a single NULL before it sees them"
    (doseq [{:keys [name expected] :as case} (cases "literal_stripping")]
      (testing name
        (let [sql    (built case)
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
      (is (= [[nil nil "accounts"]] (sql-parsing/referenced-tables "postgres" sql)))
      (is (= [[nil nil "accounts" "id"] [nil nil "accounts" "name"]]
             (sort (sql-parsing/referenced-fields "postgres" sql))))))
  (testing "and is one statement still"
    (let [sql (str "SELECT * FROM t WHERE id IN (" (str/join ", " (range 20000)) ")")]
      (is (=? {:is-single-stmt? true} (sql-parsing/is-single-stmt-of-type? "postgres" sql "read"))))))
