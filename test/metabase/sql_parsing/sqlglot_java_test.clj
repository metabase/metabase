(ns metabase.sql-parsing.sqlglot-java-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-parsing.case-files :as case-files]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-parsing.graal :as graal]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.shadow :as shadow]
   [metabase.sql-parsing.sqlglot-java :as sqlglot-java]
   [metabase.sql-parsing.sqlglot-java.ast :as sqlglot-java.ast]
   [metabase.sql-parsing.sqlglot-java.field-references :as sqlglot-java.field-references]
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
   (java.util.concurrent TimeoutException)
   (org.graalvm.polyglot Context)))

(set! *warn-on-reflection* true)

(deftest java-protocol-contract-test
  (let [java-parser (sqlglot-java/parser)]
    (testing "all nine SqlParser operations run on the Java parser"
      (is (= [[nil nil "orders"]] (protocol/referenced-tables java-parser "postgres" "SELECT id FROM orders")))
      (is (= [[nil nil "orders" "id"]] (protocol/referenced-fields java-parser "postgres" "SELECT id FROM orders")))
      (is (= {:is_simple true} (protocol/simple-query java-parser "postgres" "SELECT id FROM orders")))
      (is (string? (protocol/add-into-clause java-parser "tsql" "SELECT id FROM orders" "result_table")))
      (let [fields (protocol/field-references java-parser "postgres" "SELECT total * 1.08 AS gross FROM orders")]
        (is (= "custom_field" (get-in fields [:returned_fields 0 :type])))
        (is (= "gross" (get-in fields [:returned_fields 0 :alias])))
        (is (= ["total"] (map :column (:used_fields fields)))))
      (is (= "SELECT id FROM archived_orders"
             (protocol/replace-names java-parser "postgres" "SELECT id FROM orders"
                                     {:tables [[{:table "orders"} "archived_orders"]]})))
      (is (true? (:allowed_stmt_type? (protocol/single-stmt-of-type java-parser "postgres" "SELECT id FROM orders" "read" nil))))
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
          (is (= (protocol/single-stmt-of-type graal "postgres" sql "read-only" nil)
                 (protocol/single-stmt-of-type java "postgres" sql "read-only" nil)))))
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
          (let [result (protocol/single-stmt-of-type java dialect sql stmt-type nil)]
            (is (= allowed? (:allowed_stmt_type? result)))
            (is (= (protocol/single-stmt-of-type graal dialect sql stmt-type nil)
                   result))))))))

(deftest rebuild-checks-match-graalpy-test
  (testing "with check-rebuild, both parsers refuse the same rebuilds for the same reasons"
    (let [graal (sql-parsing/parser :sqlglot)
          java  (sql-parsing/parser :sqlglot-java)]
      (doseq [[dialect stmt-type check-rebuild sql reason]
              [;; With standard_conforming_strings on, a quote after a backslash ends the literal; with it off, the
               ;; backslash escapes the quote.
               ["postgres" "read-only" "rebuild-strict" "SELECT replace(path, '\\', '/') AS p, ';' AS sep FROM files"          "backslash-quote"]
               ["postgres" "read-only" "rebuild-strict" "SELECT 'a\\''; DELETE FROM orders; --' AS note"                       "backslash-quote"]
               ["postgres" "read-only" "rebuild-strict" "SELECT $q$a\\$q$ || $q$; DELETE FROM orders; --$q$ AS note"           "backslash-quote"]
               ["postgres" "read"      "rebuild-strict" "SELECT 'a\\''; DELETE FROM orders; --' AS note"                       "backslash-quote"]
               ;; The rebuild reads as more than one statement whatever the setting.
               ["postgres" "read-only" "rebuild-strict" "SELECT E'a\\\\' || $q$; RESET ROLE; DELETE FROM orders; --$q$ AS note" "rebuild-differs"]
               ["postgres" "read-only" "rebuild-strict" "SELECT 1 AS $q$a;SELECT 2$q$"                                          "rebuild-differs"]
               ;; A rebuilt `E'\\'` ends one quote later, so the rebuild fails the checks or does not rebuild to itself.
               ["postgres" "read-only" "rebuild-strict" "SELECT E'\\\\' || $q$' || (SELECT setval($z$s$z$, 4242))::text --$q$ AS id" "rebuild-differs"]
               ["postgres" "read-only" "rebuild-strict" "SELECT E'\\\\' || $q$' || set_config($z$role$z$, $z$postgres$z$, false) --$q$ AS id" "rebuild-differs"]
               ["postgres" "read-only" "rebuild-strict" "SELECT E'a\\\\' AS id"                                                "rebuild-differs"]
               ["postgres" "write"     "rebuild-strict" "UPDATE t SET a = E'a\\\\'"                                            "rebuild-differs"]
               ;; One statement under either setting.
               ["postgres" "read-only" "rebuild-strict" "SELECT 'it''s' AS note"                                               nil]
               ["postgres" "read-only" "rebuild-strict" "SELECT $q$it's; DELETE FROM orders$q$ AS note"                        nil]
               ["postgres" "read-only" "rebuild-strict" "SELECT 'C:\\temp' AS note"                                            nil]
               ["postgres" "read-only" "rebuild-strict" "SELECT E'it\\'s' AS id"                                               nil]
               ["postgres" "read-only" "rebuild-strict" "SELECT 'x' AS \"a\\'\" /* b\\' /* c' */ ; */"                         nil]
               ["postgres" "read-only" "rebuild-strict" "SELECT X'1F' AS x, B'1' AS y, N'z\\' AS z -- ;\n"                     nil]
               ["postgres" "read-only" "rebuild-strict" "SELECT 1 AS a$q$ FROM t WHERE b = 'c'"                                nil]
               ["redshift" "read-only" "rebuild-strict" "SELECT 'it\\'s' AS note"                                              nil]
               ;; A statement of another type than the one checked for is refused for its type, not its rebuild.
               ["postgres" "read"      "rebuild-strict" "DELETE FROM orders"                                                    nil]
               ;; A Postgres number whose rebuild has another value (VER-183).
               ["postgres" "read-only" "rebuild-strict" "SELECT 0x1F AS a, 1 AS b"                                       "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT 0b101 AS a"                                              "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT 0o17"                                                    "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT 1_000_000"                                               "number-literal"]
               ;; Upper-case prefixes, a signed number, and a character outside the Basic Multilingual Plane before the
               ;; number, after which each parser cuts the detail from the text at its own offsets.
               ["postgres" "read-only" "rebuild-strict" "SELECT 0X1F AS a"                                               "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT 0B101 AS a"                                              "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT -0x10 AS a"                                              "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT '\uD83D\uDE00' AS e, 0x1F AS a"                        "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT '\uD83D\uDE00' AS e, 1_000"                            "number-literal"]
               ;; Followed by an alias, these do not parse; the number is still the reason.
               ["postgres" "read-only" "rebuild-strict" "SELECT 0o17 AS n"                                               "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT 1_000_000 AS n"                                          "number-literal"]
               ["postgres" "read-only" "rebuild-strict" "SELECT X'1F' AS a, '0x1F' AS b /* 1_000 */"                     nil]
               ["postgres" "read"      "rebuild"        "SELECT 0x1F AS a"                                               nil]
               ;; The MySQL DIV operator, whose rebuild rounds (VER-184).
               ["mysql"    "read-only" "rebuild-strict" "SELECT a DIV 3 AS q FROM t"                                     "div-operator"]
               ["mysql"    "read-only" "rebuild-strict" "SELECT 'DIV' AS a /* a DIV 3 */"                                nil]
               ;; "rebuild" counts the statements with the setting on only.
               ["postgres" "read"      "rebuild"               "SELECT 'a\\''; DELETE FROM orders; --' AS note"                       nil]
               ["postgres" "read"      "rebuild"               "SELECT 1 AS $q$a;SELECT 2$q$"                                          "rebuild-differs"]
               ["postgres" "write"     "rebuild"               "INSERT INTO t SELECT 1 AS $q$a;SELECT 2$q$"                            "rebuild-differs"]
               ["postgres" "write"     "rebuild"               "UPDATE t SET a = E'a\\\\'"                                            "rebuild-differs"]
               ["postgres" "read"      "rebuild"        "SELECT E'\\\\' || $q$' || set_config($z$role$z$, $z$none$z$, false) --$q$ AS a" "rebuild-differs"]
               ;; Only "rebuild-strict" requires the rebuild to rebuild to itself: a `--` comment opening a CTE's body
               ;; comes back as `/* */`, which a second parse drops.
               ["postgres" "read"      "rebuild"        "WITH c AS (\n  -- note\n  SELECT id FROM t) SELECT * FROM c"        nil]
               ["postgres" "read-only" "rebuild-strict" "WITH c AS (\n  -- note\n  SELECT id FROM t) SELECT * FROM c"        "rebuild-differs"]]]
        (testing (pr-str dialect stmt-type check-rebuild sql)
          (let [result (protocol/single-stmt-of-type java dialect sql stmt-type check-rebuild)]
            (is (= reason (:reason result)))
            (is (= (protocol/single-stmt-of-type graal dialect sql stmt-type check-rebuild)
                   result))))))))

(deftest name-placeholders-match-graalpy-test
  (testing "both parsers name the same placeholders the same way"
    (let [graal (sql-parsing/parser :sqlglot)
          java  (sql-parsing/parser :sqlglot-java)]
      (doseq [[dialect sql] [["postgres"   "SELECT strpos(?, ?) AS id FROM t OFFSET ? LIMIT ?"]
                             ["postgres"   "SELECT ?::date AS d, '?' AS q, \"?\" AS n -- ?\n FROM t"]
                             ["postgres"   "SELECT '\uD83D\uDE00' AS e, ? AS id"]
                             ["postgres"   "SELECT $q$?$q$ AS a, ? AS b"]
                             ["mysql"      "SELECT INSTR(?, ?) AS id FROM t # ?\n LIMIT ?, ?"]
                             ["redshift"   "SELECT ? AS a /* ? */"]
                             ["clickhouse" "SELECT position(?, ?) AS id FROM t LIMIT ?"]
                             ["tsql"       "SELECT [?] AS a, ? AS b FROM t ORDER BY a OFFSET ? ROWS"]
                             ;; A nested comment, which Postgres, ClickHouse and T-SQL read as one comment and MySQL
                             ;; as two; an escaped quote before `?` in a string; and `??`.
                             ["postgres"   "SELECT /* /* */ ? */ ? AS a"]
                             ["clickhouse" "SELECT /* /* */ ? */ ? AS a"]
                             ["tsql"       "SELECT /* /* */ ? */ ? AS a"]
                             ["mysql"      "SELECT /* /* */ ? */ ? AS a"]
                             ["postgres"   "SELECT E'\\'?' AS a, ? AS b"]
                             ["mysql"      "SELECT 'a\\'?' AS a, ? AS b"]
                             ["clickhouse" "SELECT 'a\\'?' AS a, ? AS b"]
                             ["postgres"   "SELECT meta ?? ? FROM t"]]]
        (testing (pr-str dialect sql)
          ;; Compared as the shadow parser compares them: Python writes `?::` as `p_0 ::`, Java as `p_0::`.
          (is (= (shadow/logical-value :name-placeholders (protocol/name-placeholders graal dialect sql "p_"))
                 (shadow/logical-value :name-placeholders (protocol/name-placeholders java dialect sql "p_")))))))))

(deftest add-into-clause-matches-graalpy-test
  (testing "both parsers rewrite each add_into_clause case to the same SELECT INTO"
    (let [graal (sql-parsing/parser :sqlglot)
          java  (sql-parsing/parser :sqlglot-java)]
      (doseq [{:keys [name sql dialect table-name expected error]} (case-files/cases "add_into_clause")
              :when (not error)]
        (testing name
          (is (= expected (protocol/add-into-clause graal dialect sql table-name)) "GraalPy")
          (is (= expected (protocol/add-into-clause java dialect sql table-name)) "Java"))))))

(defn- python-statement-count
  "`_postgres_statement_count` of `sql` with `standard_conforming_strings` as given, run by the GraalPy parser."
  [sql standard-conforming-strings?]
  (#'graal/do-with-python-context
   (fn [^Context context]
     (.asInt (.execute (.eval context "python" "sql_tools._postgres_statement_count")
                       (object-array [sql standard-conforming-strings?]))))))

(deftest postgres-statement-count-test
  (testing "both parsers count the statements Postgres reads, with standard_conforming_strings on and off"
    (doseq [[rule sql on off]
            [["`$` continues a name, so `a$q$` opens no dollar quote"
              "SELECT a$q$; SELECT $q$"                                   2 2]
             ["only ASCII whitespace separates: a no-break space starts a name, so `$$` after it opens no dollar quote"
              "SELECT 1 AS \u00a0$$; SELECT 2 AS \u00a0$$"               2 2]
             ["X'' reads no backslash escapes"
              "SELECT X'1\\'; SELECT 2"                                  2 2]
             ["B'' reads no backslash escapes"
              "SELECT B'1\\'; SELECT 2"                                  2 2]
             ["U&'' reads no backslash escapes"
              "SELECT U&'1\\'; SELECT 2"                                 2 2]
             ["E'' reads backslash escapes whatever the setting"
              "SELECT E'1\\'; SELECT 2'"                                 1 1]
             ["N'' reads backslash escapes only with the setting off"
              "SELECT N'1\\'; SELECT 2"                                  2 1]
             ["a quoted name reads no backslash escapes"
              "SELECT 1 AS \"a\\\"; SELECT 2"                            2 2]]]
      (testing rule
        (is (= [on off]
               [(#'sqlglot-java.statements/postgres-statement-count sql true)
                (#'sqlglot-java.statements/postgres-statement-count sql false)])
            (str "Java: " (pr-str sql)))
        (is (= [on off]
               [(python-statement-count sql true)
                (python-statement-count sql false)])
            (str "Python: " (pr-str sql)))))))

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
  "A SELECT of `n` CASE columns. Reading the fields of 40000 of them takes about a second."
  [n]
  (str "SELECT "
       (str/join ", " (for [i (range n)] (str "CASE WHEN a > " i " THEN 'x' END AS col" i)))
       " FROM t"))

(defn- interrupted-error?
  "Whether `e`, or an exception in its cause chain, is the port's interrupt."
  [e]
  (boolean (some #(instance? SqlglotInterruptedException %) (take-while some? (iterate ex-cause e)))))

(deftest interrupt-stops-a-slow-port-call-test
  (testing "an interrupt stops a slow call promptly, with the port's interrupt, and the thread keeps its flag"
    (let [sql      (wide-select 40000)
          started  (promise)
          finished (promise)
          worker   (Thread. ^Runnable
                    (fn []
                      (deliver started true)
                      (try
                        (sqlglot-java.references/referenced-fields "postgres" sql)
                        (deliver finished {:at (System/nanoTime)})
                        (catch Throwable e
                          (deliver finished {:at           (System/nanoTime)
                                             :error        e
                                             :interrupted? (.isInterrupted (Thread/currentThread))})))))]
      (.start worker)
      (is (true? (deref started 10000 false)))
      (Thread/sleep 300)
      (is (not (realized? finished)) "the call finished before the interrupt")
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
            slow-sql    (wide-select 40000)]
        (doseq [result (mapv deref (doall (repeatedly 3 #(future
                                                           (try
                                                             (protocol/referenced-fields java-parser "postgres" slow-sql)
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
               "simple-query"             #(sqlglot-java.statements/simple-query "postgres" sql)
               "single-stmt-of-type"      #(sqlglot-java.statements/single-stmt-of-type "postgres" sql "read" nil)
               "field-references"         #(sqlglot-java.field-references/field-references "postgres" sql)
               "add-into-clause"          #(sqlglot-java.rewrite/add-into-clause "postgres" sql "u")
               "replace-names"            #(sqlglot-java.rewrite/replace-names
                                            "postgres" sql {"tables" [[{"table" "t"} {"db" nil "schema" nil "table" "u"}]]})
               "transpile-sql"            #(sqlglot-java.transpile/transpile-sql sql "postgres" "mysql")}]
        (testing op-name
          ;; Assert only after the flag is cleared: reporting an assertion can clear it (for example a JUnit
          ;; reporter that writes to a file).
          (let [expected    (f)
                _           (.interrupt (Thread/currentThread))
                interrupted (try (f) (catch Throwable _ ::thrown))
                flag-kept?  (Thread/interrupted)]
            (is (not= expected interrupted))
            (is (true? flag-kept?) "the interrupt flag is still set")
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
    (testing "keyword keys and values in replacements are read as strings, as sql_tools.py reads its JSON"
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
                      (protocol/simple-query java-parser "postgres" sql)
                      (protocol/field-references java-parser "postgres" sql)
                      (protocol/single-stmt-of-type java-parser "postgres" sql "read-only" nil)
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
            (protocol/single-stmt-of-type (sqlglot-java/parser) "postgres" too-deep-sql "read-only" nil)))))

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
        (protocol/single-stmt-of-type (sqlglot-java/parser) "postgres" "CREATE FROBNICATE marker_7731" "read-only" nil)
        (is (= [] @records))
        (testing "after a Log4j reconfiguration, which resets java.util.logging levels"
          (mt/with-log-level [metabase.sql-parsing :debug]
            (protocol/single-stmt-of-type (sqlglot-java/parser) "postgres" "CREATE FROBNICATE marker_7732" "read-only" nil))
          (is (= [] @records)))
        (finally
          (.removeHandler logger handler))))))
