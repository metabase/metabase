(ns metabase.sql-parsing.sqlglot-java-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.sqlglot-java :as sqlglot-java]
   [metabase.sql-parsing.sqlglot-java.ast :as sqlglot-java.ast]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.interface]
   [metabase.sql-tools.settings :as settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest java-protocol-contract-test
  (let [java-parser (sqlglot-java/parser)]
    (testing "all ten SqlParser operations run on the Java parser"
      (is (= [[nil nil "orders"]] (protocol/referenced-tables java-parser "postgres" "SELECT id FROM orders")))
      (is (= [[nil nil "orders" "id"]] (protocol/referenced-fields java-parser "postgres" "SELECT id FROM orders")))
      (is (= [["id" true [[nil "public" "orders" "id"]]]]
             (protocol/returned-columns-lineage java-parser "postgres" "SELECT id FROM orders" "public" {})))
      (is (= {:status "ok"} (protocol/validate-query java-parser "postgres" "SELECT id FROM orders" nil {})))
      (is (= {:is_simple true} (protocol/simple-query java-parser "postgres" "SELECT id FROM orders")))
      (is (string? (protocol/add-into-clause java-parser "tsql" "SELECT id FROM orders" "result_table")))
      (let [fields (protocol/field-references java-parser "postgres" "SELECT total * 1.08 AS gross FROM orders")]
        (is (= "custom_field" (get-in fields [:returned_fields 0 :type])))
        (is (= "gross" (get-in fields [:returned_fields 0 :alias])))
        (is (= "total" (get-in fields [:returned_fields 0 :used_fields 0 :column]))))
      (is (= "SELECT id FROM archived_orders"
             (protocol/replace-names java-parser "postgres" "SELECT id FROM orders"
                                     {:tables [[{:table "orders"} "archived_orders"]]})))
      (is (true? (:allowed_stmt_type? (protocol/single-stmt-of-type java-parser "postgres" "SELECT id FROM orders" "read"))))
      (is (= "success" (:status (protocol/transpile-sql java-parser "SELECT id FROM orders" "postgres" "mysql")))))
    (testing "a parse error is the same call-failed-ex the GraalPy parser throws"
      (let [error (try (protocol/referenced-tables java-parser "postgres" "SELECT * FROM WHERE (")
                       (catch Exception e e))]
        (is (true? (:sql-parsing/error (ex-data error))))
        (is (= "ParseError" (:sql-parsing/python-error-type (ex-data error))))))))

(defn- interface-multimethods
  "Every multimethod in [[metabase.sql-tools.interface]], so a new one is checked without editing this test."
  []
  (for [[sym v] (ns-publics 'metabase.sql-tools.interface)
        :when (instance? clojure.lang.MultiFn @v)]
    [sym @v]))

(deftest backend-dispatch-test
  (testing "every sql-tools multimethod runs its :sqlglot method for :sqlglot-java, through the backend hierarchy"
    (is (= 10 (count (interface-multimethods))))
    (doseq [[sym ^clojure.lang.MultiFn multimethod] (interface-multimethods)]
      (testing sym
        (is (some? (get-method multimethod :sqlglot)))
        (is (identical? (get-method multimethod :sqlglot) (get-method multimethod :sqlglot-java))))))
  (testing "the shared :sqlglot methods ask for the parser the dispatch value names"
    (doseq [backend [:sqlglot :sqlglot-java]]
      (testing backend
        (let [seen (atom [])]
          (binding [settings/*parser-backend-override* backend]
            (mt/with-dynamic-fn-redefs [sql-parsing/parser (fn [b] (swap! seen conj b) (sqlglot-java/parser))]
              (sql-tools/simple-query? "SELECT 1")
              (sql-tools/transpile-sql "SELECT 1" "postgres" "mysql")))
          (is (= [backend backend] @seen)))))))

(deftest java-map-inputs-and-persistent-results-test
  (let [java-parser (sqlglot-java/parser)]
    (testing "keyword keys and values in schema maps and replacements are read as strings, as sql_tools.py reads its JSON"
      (is (= {:status "ok"}
             (protocol/validate-query java-parser "postgres" "SELECT id FROM orders" nil
                                      {:orders {:id "INT"}})))
      (is (= {:status "ok"}
             (protocol/validate-query java-parser "postgres" "SELECT id FROM \"ns/orders\"" nil
                                      {:ns/orders {:id :INT}})))
      (is (= [["id" true [[nil "public" "orders" "id"]]]]
             (protocol/returned-columns-lineage java-parser "postgres" "SELECT * FROM orders"
                                                "public" {:public {:orders {:id "INT"}}})))
      (is (= "SELECT id FROM archived_orders"
             (protocol/replace-names java-parser "postgres" "SELECT id FROM orders"
                                     {:tables [[{:table :orders} :archived_orders]]}))))
    (testing "results are persistent Clojure values, with null tuple positions retained"
      (let [tables (protocol/referenced-tables java-parser "postgres" "SELECT * FROM orders")
            fields (protocol/field-references java-parser "postgres" "SELECT id AS key FROM orders")]
        (is (vector? tables))
        (is (vector? (first tables)))
        (is (= [nil nil "orders"] (first tables)))
        (is (map? fields))
        (is (vector? (:returned_fields fields)))
        (is (map? (first (:returned_fields fields))))))))

(deftest port-stays-inside-the-shim-test
  (testing "only the namespaces under sql_parsing/sqlglot_java import the sqlglot port"
    (is (= []
           (for [dir   ["src" "enterprise/backend/src"]
                 ^java.io.File file (file-seq (io/file dir))
                 :let  [path (.getPath file)]
                 :when (and (.isFile file)
                            (re-find #"\.clj[cs]?$" path)
                            (not (str/includes? path "sql_parsing/sqlglot_java"))
                            (str/includes? (slurp file) "com.metabase.sqlglot"))]
             path)))))

(deftest results-hold-no-ast-test
  (testing "every operation returns plain data: no node of the port's AST escapes"
    (let [java-parser (sqlglot-java/parser)
          sql         "WITH c AS (SELECT id, total FROM orders) SELECT c.id, total * 2 AS t FROM c JOIN people p ON p.id = c.id"]
      (doseq [result [(protocol/referenced-tables java-parser "postgres" sql)
                      (protocol/referenced-fields java-parser "postgres" sql)
                      (protocol/returned-columns-lineage java-parser "postgres" sql "public" nil)
                      (protocol/validate-query java-parser "postgres" sql "public" nil)
                      (protocol/simple-query java-parser "postgres" sql)
                      (protocol/field-references java-parser "postgres" sql)
                      (protocol/single-stmt-of-type java-parser "postgres" sql "read-only")
                      (protocol/transpile-sql java-parser sql "postgres" "snowflake")]]
        (is (not-any? sqlglot-java.ast/ast-node? (tree-seq coll? seq result))
            (pr-str result))))))

(deftest whitespace-names-test
  (testing "a name made only of whitespace is a name, as in sql_tools.py, which only treats an empty one as missing"
    (let [java-parser (sqlglot-java/parser)]
      (is (= [[nil nil " "]] (protocol/referenced-tables java-parser "postgres" "select * from \" \"")))
      (is (= [[" " " " "t"]] (protocol/referenced-tables java-parser "postgres" "select * from \" \".\" \".t")))
      (is (= [[nil " " "t" "a"]] (protocol/referenced-fields java-parser "postgres" "select a from \" \".t")))
      (testing "an ORDER BY of a whitespace alias resolves to the alias"
        (let [{:keys [used_fields errors]} (protocol/field-references java-parser "postgres"
                                                                      "SELECT a AS \" \" FROM t ORDER BY \" \"")]
          (is (= [] errors))
          (is (= #{"a"} (set (map :column used_fields))))
          (is (every? #(= " " (:alias %)) used_fields))))
      (is (= "success" (:status (protocol/transpile-sql java-parser "SELECT 1" "  " "postgres")))))))

(deftest replace-names-quotes-names-that-are-not-one-identifier-test
  (testing "a replacement name that does not read back as one identifier is quoted whole, never written as SQL"
    (let [java-parser (sqlglot-java/parser)
          rename      (fn [sql replacements] (protocol/replace-names java-parser "postgres" sql replacements))]
      (doseq [[new-name expected] [["x;y"                   "SELECT id FROM \"x;y\""]
                                   ["x,y"                   "SELECT id FROM \"x,y\""]
                                   ["x/*c*/"                "SELECT id FROM \"x/*c*/\""]
                                   ["x;delete/**/from/**/t" "SELECT id FROM \"x;delete/**/from/**/t\""]
                                   ["select"                "SELECT id FROM \"select\""]]]
        (testing new-name
          (is (= expected (rename "SELECT id FROM t" {:tables [[{:table "t"} new-name]]})))))
      (testing "as a schema"
        (is (= "SELECT id FROM \"a;b\".t" (rename "SELECT id FROM public.t" {:schemas {"public" "a;b"}}))))
      (testing "as a column"
        (is (= "SELECT \"x;y\" FROM t" (rename "SELECT id FROM t" {:columns [[{:column "id"} "x;y"]]}))))
      (testing "an ordinary name stays unquoted, and a quoted one keeps its quotes"
        (is (= "SELECT id FROM archived_orders" (rename "SELECT id FROM t" {:tables [[{:table "t"} "archived_orders"]]})))
        (is (= "SELECT id FROM \"Archived\"" (rename "SELECT id FROM t" {:tables [[{:table "t"} "\"Archived\""]]})))))))

(defn- error-type-of
  "The `:sql-parsing/python-error-type` that `thunk` fails with."
  [thunk]
  (try (thunk)
       nil
       (catch Exception e
         (:sql-parsing/python-error-type (ex-data e)))))

(deftest python-error-names-test
  (let [java-parser (sqlglot-java/parser)]
    (testing "a replacement key without its table or column is a KeyError, as in sql_tools.py"
      (is (= "KeyError" (error-type-of #(protocol/replace-names java-parser "postgres" "SELECT id FROM t"
                                                                {:tables [[{} "u"]]}))))
      (is (= "KeyError" (error-type-of #(protocol/replace-names java-parser "postgres" "SELECT id FROM t"
                                                                {:columns [[{:table "t"} "u"]]})))))
    (testing "nil SQL is a TypeError"
      (is (= "TypeError" (error-type-of #(protocol/referenced-tables java-parser "postgres" nil)))))
    (testing "SQL nested past the stack is a RecursionError with GraalPy's message and a cause"
      (let [sql   (str "SELECT " (apply str (repeat 5000 "(")) "1" (apply str (repeat 5000 ")")))
            error (try (protocol/referenced-tables java-parser "postgres" sql) nil (catch Exception e e))]
        (is (= "RecursionError" (:sql-parsing/python-error-type (ex-data error))))
        (is (= "RecursionError: maximum recursion depth exceeded" (ex-message (ex-cause error))))))))
