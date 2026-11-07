(ns metabase.sql-parsing.sqlglot-java-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.sqlglot-java :as sqlglot-java]
   [metabase.sql-parsing.sqlglot-java.ast :as sqlglot-java.ast]
   [metabase.sql-parsing.sqlglot-java.field-references :as sqlglot-java.field-references]
   [metabase.sql-parsing.sqlglot-java.qualify :as sqlglot-java.qualify]
   [metabase.sql-parsing.sqlglot-java.references :as sqlglot-java.references]
   [metabase.sql-parsing.sqlglot-java.rewrite :as sqlglot-java.rewrite]
   [metabase.sql-parsing.sqlglot-java.statements :as sqlglot-java.statements]
   [metabase.sql-parsing.sqlglot-java.transpile :as sqlglot-java.transpile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.interface :as interface]
   [metabase.sql-tools.settings :as settings]
   [metabase.test :as mt])
  (:import
   (com.metabase.sqlglot SqlglotInterruptedException)
   (java.util.concurrent TimeoutException)))

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

(deftest empty-statements-match-graalpy-test
  (testing "a stray semicolon, or a comment after one, is not a statement; the two parsers agree on what is left"
    (let [graal (sql-parsing/parser :sqlglot)
          java  (sql-parsing/parser :sqlglot-java)]
      (doseq [sql ["SELECT 1" "SELECT 1;" "SELECT 1; -- done" "SELECT 1;;" "SELECT 1; SELECT 2" "" ";"]]
        (testing (pr-str sql)
          (is (= (protocol/transpile-sql graal sql "postgres" "mysql")
                 (protocol/transpile-sql java sql "postgres" "mysql")))
          (is (= (protocol/single-stmt-of-type graal "postgres" sql "read-only")
                 (protocol/single-stmt-of-type java "postgres" sql "read-only")))))
      (is (= "multiple_statements" (:reason (protocol/transpile-sql java "SELECT 1; SELECT 2" "postgres" "mysql")))))))

(deftest statement-checks-match-graalpy-test
  (testing "read and write statements get the same checks on both parsers"
    (let [graal (sql-parsing/parser :sqlglot)
          java  (sql-parsing/parser :sqlglot-java)]
      (doseq [[dialect stmt-type sql allowed?]
              [["postgres" "read"  "SELECT set_config('role', 'none', false)"                         false]
               ["postgres" "read"  "SELECT query_to_xml('SELECT 1', true, false, '')"                 false]
               ["postgres" "read"  "SELECT * FROM U&\"t\""                                            false]
               ["postgres" "write" "UPDATE t SET a = pg_sleep(1)"                                     false]
               ["postgres" "write" "INSERT INTO t SELECT query_to_xml('SELECT 1', true, false, '')"   false]
               ["mysql"    "read"  "SELECT 1 /*! , 2 */"                                              false]
               ["mysql"    "read"  "SELECT load_file('/etc/passwd')"                                  false]
               ["clickhouse" "read" "SELECT * FROM url('http://h/x', CSV, 'a String')"                false]
               ["clickhouse" "read" "SELECT * FROM clusterAllReplicas('c', db.t)"                     false]
               ["duckdb"   "read"  "SELECT * FROM 'x.csv'"                                            false]
               ["tsql"     "read"  "SELECT 1 EXEC sp_who"                                             false]
               ["tsql"     "write" "UPDATE t SET a = 1"                                               true]
               ["tsql"     "write" "DELETE FROM t WHERE a = 1"                                        true]
               ["postgres" "read"  "SELECT id FROM orders"                                            true]]]
        (testing (pr-str dialect stmt-type sql)
          (let [result (protocol/single-stmt-of-type java dialect sql stmt-type)]
            (is (= allowed? (:allowed_stmt_type? result)))
            (is (= (protocol/single-stmt-of-type graal dialect sql stmt-type)
                   result))))))))

(deftest slow-call-times-out-test
  (testing "a call that takes longer than the deadline throws a TimeoutException and interrupts the port's thread"
    (let [interrupted (promise)]
      (mt/with-temp-env-var-value! [mb-sql-parsing-timeout-ms 50]
        (is (thrown-with-msg? TimeoutException #"after 50ms"
                              (#'sqlglot-java/call (fn []
                                                     (try
                                                       (Thread/sleep 10000)
                                                       (catch InterruptedException _
                                                         (deliver interrupted true))))))))
      (is (true? (deref interrupted 5000 false)))))
  (testing "at most three calls run at the same time; the others wait"
    (let [running (atom 0)
          peak    (atom 0)
          f       (fn []
                    (swap! peak max (swap! running inc))
                    (Thread/sleep 50)
                    (swap! running dec))]
      (run! deref (doall (repeatedly 8 #(future (#'sqlglot-java/call f)))))
      (is (= 3 @peak))))
  (testing "a port error inside the deadline is reported as before"
    (is (thrown-with-msg? Exception #"ParseError"
                          (protocol/referenced-tables (sqlglot-java/parser) "postgres" "SELECT FROM WHERE (")))))

(defn- wide-select
  "A SELECT of `n` CASE columns. Its lineage takes seconds, because the port copies the projection list once for
  each column."
  [n]
  (str "SELECT "
       (str/join ", " (for [i (range n)] (str "CASE WHEN a > " i " THEN 'x' END AS col" i)))
       " FROM t"))

(def ^:private wide-select-schema
  {"t" {"a" "INT"}})

(defn- interrupted-error?
  "Whether `e`, or an exception in its cause chain, is the port's interrupt."
  [e]
  (boolean (some #(instance? SqlglotInterruptedException %) (take-while some? (iterate ex-cause e)))))

(deftest interrupt-stops-a-slow-port-call-test
  (testing "an interrupt stops a slow lineage promptly, with the port's interrupt, and the thread keeps its flag"
    (let [sql      (wide-select 2000)
          started  (promise)
          finished (promise)
          worker   (Thread. ^Runnable
                    (fn []
                      (deliver started true)
                      (try
                        (sqlglot-java.qualify/returned-columns-lineage "postgres" sql nil wide-select-schema)
                        (deliver finished {:at (System/nanoTime)})
                        (catch Throwable e
                          (deliver finished {:at           (System/nanoTime)
                                             :error        e
                                             :interrupted? (.isInterrupted (Thread/currentThread))})))))]
      (.start worker)
      (is (true? (deref started 10000 false)))
      (Thread/sleep 300)
      (is (not (realized? finished)) "the lineage finished before the interrupt")
      (let [interrupted-at (System/nanoTime)
            _              (.interrupt worker)
            {:keys [at error interrupted?]} (deref finished 30000 nil)]
        (is (interrupted-error? error) (pr-str error))
        (is (true? interrupted?))
        (is (<= (quot (- at interrupted-at) 1000000) 500))))))

(deftest timed-out-calls-free-their-threads-test
  (testing "slow calls that time out stop their threads, so all three threads are free for the next calls"
    (mt/with-temp-env-var-value! [mb-sql-parsing-timeout-ms 100]
      (let [java-parser (sqlglot-java/parser)
            slow-sql    (wide-select 2000)]
        (doseq [result (mapv deref (doall (repeatedly 3 #(future
                                                            (try
                                                              (protocol/returned-columns-lineage
                                                               java-parser "postgres" slow-sql nil wide-select-schema)
                                                              (catch Throwable e e))))))]
          (is (instance? TimeoutException result) (pr-str result)))
        (let [start   (System/nanoTime)
              results (mapv deref (doall (repeatedly 3 #(future
                                                          (protocol/referenced-tables
                                                           java-parser "postgres" "SELECT a FROM t")))))]
          (is (= (repeat 3 [[nil nil "t"]]) results))
          (is (<= (quot (- (System/nanoTime) start) 1000000) 1000)))))))

(deftest interrupted-calls-keep-the-flag-test
  (testing (str "on an interrupted thread every operation ends without its normal result and keeps the flag set, "
                "and runs normally once the flag is cleared")
    (let [sql "SELECT a FROM t"]
      (doseq [[op-name f]
              {"referenced-tables"        #(sqlglot-java.references/referenced-tables "postgres" sql)
               "referenced-fields"        #(sqlglot-java.references/referenced-fields "postgres" sql)
               "returned-columns-lineage" #(sqlglot-java.qualify/returned-columns-lineage
                                            "postgres" sql nil wide-select-schema)
               "validate-query"           #(sqlglot-java.qualify/validate-query "postgres" sql nil wide-select-schema)
               "simple-query"             #(sqlglot-java.statements/simple-query "postgres" sql)
               "single-stmt-of-type"      #(sqlglot-java.statements/single-stmt-of-type "postgres" sql "read")
               "field-references"         #(sqlglot-java.field-references/field-references "postgres" sql)
               "add-into-clause"          #(sqlglot-java.rewrite/add-into-clause "postgres" sql "u")
               "replace-names"            #(sqlglot-java.rewrite/replace-names
                                            "postgres" sql {"tables" [[{"table" "t"} {"db" nil "schema" nil "table" "u"}]]})
               "transpile-sql"            #(sqlglot-java.transpile/transpile-sql sql "postgres" "mysql")}]
        (testing op-name
          (let [expected (f)]
            (try
              (.interrupt (Thread/currentThread))
              (is (not= expected (try (f) (catch Throwable _ ::thrown))))
              (is (Thread/interrupted) "the interrupt flag is still set")
              (finally
                (Thread/interrupted)))
            (is (= expected (f)))))))))

(deftest rename-keeps-comments-test
  (testing "a renamed column keeps its comment, as on GraalPy"
    (let [replacements {:columns [[{:table "t" :column "a"} "b"]] :tables [[{:table "t"} "u"]]}]
      (doseq [[sql expected] [["SELECT a /* c1 */ FROM t" "SELECT b /* c1 */ FROM u"]
                              ["SELECT a -- c2\nFROM t" "SELECT b /* c2 */ FROM u"]
                              ["SELECT t.a /* c3 */, x FROM t /* c4 */" "SELECT u.b /* c3 */, x FROM u /* c4 */"]
                              ["SELECT * FROM t WHERE a /* c5 */ = 1" "SELECT * FROM u WHERE b /* c5 */ = 1"]]
              backend [:sqlglot :sqlglot-java]]
        (is (= expected (sql-parsing/replace-names (sql-parsing/parser backend) "postgres" sql replacements))
            [backend sql])))))

(deftest session-variable-read-only-matches-graalpy-test
  (testing "@@session variables get the same read-only verdict and SQL on both backends (QUE-997)"
    (doseq [dialect ["postgres" "redshift" "mysql"]
            sql     ["select @@session.x := 1" "select @@session.x"]
            :let    [verdict #(sql-parsing/validate-executable-stmt (sql-parsing/parser %) dialect sql "read-only")]]
      (is (= (verdict :sqlglot) (verdict :sqlglot-java)) [dialect sql]))))

(deftest aliased-and-plain-select-of-one-column-test
  (testing "a column selected with and without an alias keeps each its own alias (QUE-992)"
    (doseq [backend [:sqlglot :sqlglot-java]]
      (is (= ["b" "a"]
             (mapv :alias (:returned-fields (sql-parsing/field-references
                                             (sql-parsing/parser backend) "postgres"
                                             "SELECT u.a AS b, u.a FROM (SELECT a FROM x UNION SELECT a FROM y) u"))))
          backend))))

(deftest group-by-and-order-by-all-name-no-column-test
  (testing "GROUP BY ALL and ORDER BY ALL use every selected column and no column named ALL, as on GraalPy (QUE-1050)"
    (doseq [[sql dialects] [["SELECT a, SUM(b) FROM t GROUP BY ALL" ["duckdb" "databricks" "snowflake"]]
                            ["SELECT a, b FROM t ORDER BY ALL"      ["duckdb" "databricks"]]]
            dialect        dialects
            :let           [references #(sql-parsing/field-references (sql-parsing/parser %) dialect sql)]]
      (is (= (references :sqlglot) (references :sqlglot-java)) [dialect sql])
      (is (= #{"a" "b"} (into #{} (map :column) (:used-fields (references :sqlglot-java)))) [dialect sql]))))

(deftest backend-dispatch-test
  (testing "every sql-tools multimethod has a :sqlglot method, and every sql-parsing backend dispatches to it"
    (is (= 11 (count (interface-multimethods))))
    (doseq [[sym ^clojure.lang.MultiFn multimethod] (interface-multimethods)]
      (testing sym
        (is (some? (get-method multimethod :sqlglot)))))
    (doseq [backend sql-parsing/backends]
      (is (= :sqlglot (interface/parser-driver-dispatch backend nil)) backend))
    (is (= :macaw (interface/parser-driver-dispatch :macaw nil))))
  (testing "the shared :sqlglot methods ask for the parser the backend names"
    (doseq [backend sql-parsing/backends]
      (testing backend
        (let [seen (atom [])]
          (binding [settings/*parser-backend-override* backend]
            (mt/with-dynamic-fn-redefs [sql-parsing/parser (fn [b] (swap! seen conj b) (sqlglot-java/parser))]
              (sql-tools/simple-query? "SELECT 1")
              (sql-tools/transpile-sql "SELECT 1" "postgres" "mysql")))
          (is (= [backend backend] @seen)))))))

(deftest shadow-backends-test
  (testing "a shadow backend answers with its primary parser and compares the other one in the background"
    (mt/with-prometheus-system! [_ system]
      (doseq [backend [:sqlglot-shadow :sqlglot-java-shadow]]
        (testing backend
          (binding [settings/*parser-backend-override* backend]
            (is (= [{:schema nil :table "b"} {:schema "s" :table "a"}]
                   (sql-tools/referenced-tables-raw :postgres "SELECT * FROM s.a JOIN b ON a.id = b.id")))
            (is (= :allowed (:verdict (sql-tools/validate-executable-stmt :postgres "SELECT 1" "read-only")))))))
      (let [matches  #(mt/metric-value system :metabase-sql-parsing/shadow-comparisons
                                       {:method % :dialect "postgres" :outcome "match"})
            deadline (+ (System/currentTimeMillis) 30000)]
        (while (and (not= [2.0 2.0] [(matches "referenced-tables") (matches "single-stmt-of-type")])
                    (< (System/currentTimeMillis) deadline))
          (Thread/sleep 50))
        (is (= 2.0 (matches "referenced-tables")))
        (is (= 2.0 (matches "single-stmt-of-type")))))))

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

(def ^:private too-deep-sql
  "SQL nested past the stack."
  (str "SELECT " (apply str (repeat 5000 "(")) "1" (apply str (repeat 5000 ")"))))

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
      (let [error (try (protocol/referenced-tables java-parser "postgres" too-deep-sql) nil (catch Exception e e))]
        (is (= "RecursionError" (:sql-parsing/python-error-type (ex-data error))))
        (is (= "RecursionError: maximum recursion depth exceeded" (ex-message (ex-cause error))))))))

(deftest read-only-check-of-too-deep-sql-test
  (testing "SQL nested past the stack is unparseable to the read-only check, as on GraalPy, not an exception"
    (is (=? {:is_single_stmt?    false
             :allowed_stmt_type? false
             :reason             "unparseable"
             :error              "maximum recursion depth exceeded"}
            (protocol/single-stmt-of-type (sqlglot-java/parser) "postgres" too-deep-sql "read-only")))))

(deftest port-logs-no-sql-test
  (testing "the port's warning that quotes SQL it falls back on does not reach the log, as sql_tools.py ensures"
    (let [records (atom [])
          logger  (java.util.logging.Logger/getLogger "com.metabase.sqlglot.reference.Parser")
          handler (proxy [java.util.logging.Handler] []
                    (publish [^java.util.logging.LogRecord record] (swap! records conj (.getMessage record)))
                    (flush [])
                    (close []))]
      (.addHandler logger handler)
      (try
        (protocol/single-stmt-of-type (sqlglot-java/parser) "postgres" "CREATE FROBNICATE marker_7731" "read-only")
        (is (= [] @records))
        (testing "after a Log4j reconfiguration, which resets java.util.logging levels"
          (mt/with-log-level [metabase.sql-parsing :debug]
            (protocol/single-stmt-of-type (sqlglot-java/parser) "postgres" "CREATE FROBNICATE marker_7732" "read-only"))
          (is (= [] @records)))
        (finally
          (.removeHandler logger handler))))))
