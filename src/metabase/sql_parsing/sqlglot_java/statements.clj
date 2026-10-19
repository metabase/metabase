(ns metabase.sql-parsing.sqlglot-java.statements
  "What kind of statement a query is: `is_single_stmt_of_type`, with the read-only checks behind `read-only-select?`,
  and `simple_query`."
  (:require
   [clojure.string :as str]
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expressions$Anonymous Expressions$Column Expressions$Delete Expressions$Func
                             Expressions$Insert Expressions$Parameter Expressions$PropertyEQ Expressions$Query
                             Expressions$Select Expressions$Semicolon Expressions$SetOperation Expressions$Subquery
                             Expressions$Table Expressions$Update Expressions$WithTableHint)
   (com.metabase.sqlglot.reference ParseError)))

(set! *warn-on-reflection* true)

(defn- split-placeholder-casts
  "`sql` with `?::` written `? ::` outside Databricks. sqlglot's tokenizer reads `?::` as one token that only the
  Databricks parser consumes, so `select ?::text` fails to parse anywhere else (#81373)."
  [^String sql dialect]
  (if (or (= dialect "databricks") (not (str/includes? sql "?::")))
    sql
    (try
      ;; Insert right to left so the earlier offsets stay valid.
      (reduce (fn [^String sql [token-type _text start]]
                (if (= token-type "QDCOLON")
                  (str (subs sql 0 (inc start)) " " (subs sql (inc start)))
                  sql))
              sql
              (rseq (ast/tokenize sql dialect)))
      (catch Exception _
        sql))))

;; Nodes that write, lock, or run something other than a query. A SELECT can hold some of these: `SELECT ... INTO`
;; creates a table, `FOR UPDATE`/`FOR SHARE` take row locks, and Postgres lets a CTE body be a DELETE ... RETURNING.
;; Spark and Hive's `SELECT TRANSFORM (...) USING '<command>'` pipes rows through a program on the cluster.
(def ^:private not-read-only-classes
  (mapv ast/ast-class
        ["DML" "DDL" "Into" "Lock" "Command" "Set" "Grant" "Revoke" "Drop" "Alter" "TruncateTable" "Transaction"
         "Commit" "Rollback" "Use" "Execute" "LoadData" "Kill" "Pragma" "Cache" "Uncache" "Refresh" "Analyze"
         "NextValueFor" "QueryTransform"]))

;; Advancing a sequence is a write a SELECT can make. sqlglot parses only the SQL-standard `NEXT VALUE FOR` as its
;; own node; Postgres and Redshift spell it as a function, Oracle and Snowflake as a `.NEXTVAL` pseudo-column, and
;; Snowflake also as the table function `TABLE(GETNEXTVAL(seq))`.
(def ^:private sequence-write-functions #{"nextval" "setval" "getnextval"})

;; Built-in functions that reach past the query that calls them: they take a lock that can outlive it, change the
;; session's settings, signal or stop another session, or hold the connection waiting.
(def ^:private session-effect-functions
  #{;; Postgres advisory locks
    "pg_advisory_lock" "pg_advisory_lock_shared" "pg_try_advisory_lock" "pg_try_advisory_lock_shared"
    "pg_advisory_xact_lock" "pg_advisory_xact_lock_shared" "pg_try_advisory_xact_lock"
    "pg_try_advisory_xact_lock_shared" "pg_advisory_unlock" "pg_advisory_unlock_shared" "pg_advisory_unlock_all"
    ;; MySQL named locks
    "get_lock" "release_lock" "release_all_locks"
    ;; session settings and signals
    "set_config" "pg_notify" "pg_terminate_backend" "pg_cancel_backend" "pg_reload_conf"
    ;; waiting
    "pg_sleep" "pg_sleep_for" "pg_sleep_until" "sleep" "benchmark"})

;; Functions that take a SQL string and run it. The parser reads that string as an opaque literal, so a write, a
;; lock, or a session change hidden inside it escapes the checks above. The wrapper is refused whatever the string
;; holds. Oracle's package functions (`dbms_xmlgen.getxml`, `utl_http.request`) collapse to a bare name that could
;; collide with an innocent column function, so they are left to the connection-level work instead.
(def ^:private sql-executing-functions
  #{;; Postgres query-to-xml family
    "query_to_xml" "query_to_xmlschema" "query_to_xml_and_xmlschema" "cursor_to_xml" "cursor_to_xmlschema"
    ;; Postgres full-text and tablefunc helpers that run a passed query
    "ts_stat" "ts_rewrite" "crosstab" "crosstab2" "crosstab3" "crosstab4" "connectby"
    ;; Postgres dblink
    "dblink" "dblink_exec" "dblink_send_query" "dblink_fetch" "dblink_open"
    ;; SQL Server linked-server and ad hoc access
    "openquery" "openrowset" "opendatasource"
    ;; BigQuery federated query
    "external_query"
    ;; Snowflake: run a SQL string as a table function
    "to_query"})

;; SQL Server table hints that take update or exclusive locks, or hold shared ones to the end of the transaction.
;; `NOLOCK`, `INDEX(...)` and the rest only steer how a plain read runs.
(def ^:private locking-table-hints
  #{"UPDLOCK" "XLOCK" "TABLOCK" "TABLOCKX" "HOLDLOCK" "SERIALIZABLE" "REPEATABLEREAD"})

;; Words that start a T-SQL statement. SQL Server ends a SELECT at one of them without a semicolon, while sqlglot
;; reads a bare one as a table alias: `SELECT 1 FROM t EXEC('...')` parses as one SELECT and runs as two statements.
;; `MERGE`, `FETCH` and `USE` are left out: they also appear in join hints, `OFFSET ... FETCH` and `USE HINT`.
(def ^:private tsql-statement-words
  #{"ALTER" "BACKUP" "BEGIN" "BULK" "CHECKPOINT" "CLOSE" "COMMIT" "CREATE" "DBCC" "DEALLOCATE" "DECLARE" "DELETE"
    "DENY" "DROP" "EXEC" "EXECUTE" "GOTO" "GRANT" "INSERT" "KILL" "OPEN" "PRINT" "RAISERROR" "READTEXT"
    "RECONFIGURE" "RESTORE" "REVERT" "REVOKE" "ROLLBACK" "SAVE" "SET" "SHUTDOWN" "THROW" "TRUNCATE" "UPDATE"
    "UPDATETEXT" "WAITFOR" "WRITETEXT"})

;; Dialects whose server runs the body of a `/*! ... */` comment as SQL, and reads `--` as a comment only when
;; whitespace follows it.
(def ^:private mysql-family-dialects #{"mysql" "mariadb" "singlestore" "starrocks" "doris" "tidb"})

(defn- function-name
  "The lower-case name of the function `node` calls, or nil when it is not a function call."
  [node]
  (cond
    (instance? Expressions$Anonymous node) (u/lower-case-en (ast/node-name node))
    (instance? Expressions$Func node)      (u/lower-case-en (ast/sql-name node))))

(defn- first-function-in
  "The name of the first function in `stmt` that is in `names`, or nil."
  [names stmt]
  (some #(names (function-name %)) (ast/walk stmt)))

(defn- writes-or-locks? [node]
  (cond
    (ast/instance-of-any? not-read-only-classes node)
    true

    (instance? Expressions$Anonymous node)
    (contains? sequence-write-functions (u/lower-case-en (ast/node-name node)))

    ;; MySQL assigns a user variable inside a SELECT with `@x := ...`, and the value outlives the query on a pooled
    ;; connection. A bare name on the left is a named argument instead, as in DuckDB and Postgres.
    (instance? Expressions$PropertyEQ node)
    (instance? Expressions$Parameter (ast/this node))

    (instance? Expressions$Column node)
    (and (seq (ast/text node "table"))
         (= "nextval" (u/lower-case-en (ast/node-name node))))

    (instance? Expressions$WithTableHint node)
    (boolean (some #(contains? locking-table-hints (u/upper-case-en (ast/node-name %)))
                   (ast/expressions node)))

    ;; SQL Server still honours a hint written without WITH, `FROM t (TABLOCKX)`, which parses as a call to a
    ;; table-valued function named `t`.
    (and (instance? Expressions$Table node) (instance? Expressions$Anonymous (ast/this node)))
    (boolean (some #(and (instance? Expressions$Column %)
                         (empty? (ast/text % "table"))
                         (contains? locking-table-hints (u/upper-case-en (ast/node-name %))))
                   (ast/expressions (ast/this node))))

    :else
    false))

;; Any other function with side effects, a user-defined one included, passes this check: no list of names can be
;; complete. Grants on the database credential are what keep such a function from writing.
(defn- read-only? [stmt]
  (not-any? writes-or-locks? (ast/walk stmt)))

(defn- hidden-sql
  "`[reason detail]` when `sql` holds text its database would run and sqlglot would not parse as a statement of its
  own, else nil.

  The MySQL marks are looked for in the raw text, string literals included: MySQL's `NO_BACKSLASH_ESCAPES` mode ends
  a literal where sqlglot does not, so a backslash before a quote is refused. A `U&\"...\"` identifier is refused in
  every dialect, since Postgres reads its escapes and the function checks above never see the name."
  [sql dialect]
  (or (when (re-find #"(?<![\w\$])[uU]&\"" sql)
        ["unicode-identifier" nil])
      (when (= dialect "tsql")
        (some (fn [[token-type text]]
                (when (and (not (#{"STRING" "NATIONAL_STRING" "IDENTIFIER"} token-type))
                           (contains? tsql-statement-words (u/upper-case-en text)))
                  ["statement-word" (u/upper-case-en text)]))
              (ast/tokenize sql dialect)))
      (when (contains? mysql-family-dialects dialect)
        (cond
          (or (str/includes? sql "/*!") (str/includes? sql "/*M!")) ["executable-comment" nil]
          (re-find #"--(?=\S)" sql)                                  ["bare-dash-comment" nil]
          (re-find #"\\['\"`]" sql)                                  ["backslash-quote" nil]))))

(defn- unbracketed
  "`stmt` without the brackets around the whole query: `(SELECT 1)` parses as a subquery with no alias."
  [stmt]
  (if (and (instance? Expressions$Subquery stmt) (empty? (ast/node-alias stmt)))
    (recur (ast/this stmt))
    stmt))

(def ^:private read-classes [Expressions$Select Expressions$SetOperation])
(def ^:private write-classes [Expressions$Update Expressions$Insert Expressions$Delete])

(defn- not-read-only-reason
  "`[reason detail]` for why `stmts`, parsed from `sql`, are not one read-only SELECT, else nil."
  [stmts sql dialect]
  (cond
    (empty? stmts)                                                     ["not-a-select" nil]
    (not= 1 (count stmts))                                             ["multiple-statements" nil]
    (not (ast/instance-of-any? read-classes (unbracketed (first stmts)))) ["not-a-select" nil]
    (not (read-only? (first stmts)))                                   ["writes-or-locks" nil]
    :else
    (if-let [function (first-function-in session-effect-functions (first stmts))]
      ["session-function" function]
      (if-let [executor (first-function-in sql-executing-functions (first stmts))]
        ["sql-executing-function" executor]
        (hidden-sql sql dialect)))))

(defn single-stmt-of-type
  "Whether `sql` is a single read statement (`\"read\"`, a SELECT), a single read-only SELECT (`\"read-only\"`), or a
  single write statement (anything else: INSERT, UPDATE, DELETE), with the statement as regenerated SQL.

  `\"read-only\"` also refuses a SELECT holding anything that writes or locks anywhere in its tree, and does not count
  a statement holding only a comment after the last semicolon. `:reason` (and `:reason_detail`) say why a query is
  not a read-only SELECT."
  [sql stmt-type dialect]
  (let [read-only-type? (= stmt-type "read-only")
        ;; Filled in as it goes, so a failure part way keeps what was found before it.
        result          (volatile! {:is_single_stmt? false, :allowed_stmt_type? false})]
    (try
      (let [stmts   (cond->> (vec (ast/parse (split-placeholder-casts sql dialect) dialect))
                      read-only-type? (into [] (remove #(or (nil? %) (instance? Expressions$Semicolon %)))))
            allowed (if (#{"read" "read-only"} stmt-type) read-classes write-classes)
            problem (when read-only-type? (not-read-only-reason stmts sql dialect))
            [stmt]  stmts]
        (when problem
          (vswap! result assoc :reason (first problem) :reason_detail (second problem)))
        (when (= 1 (count stmts))
          (vswap! result assoc :is_single_stmt? true)
          (when (and (ast/instance-of-any? allowed (unbracketed stmt)) (nil? problem))
            (vswap! result assoc :allowed_stmt_type? true))
          (when-not stmt
            (throw (ex-info "'NoneType' object has no attribute 'sql'" {})))
          (vswap! result assoc :sql (ast/sql stmt dialect))))
      ;; Python's `except Exception` also catches the RecursionError of SQL nested too deeply.
      (catch StackOverflowError _
        (vswap! result assoc :error "maximum recursion depth exceeded"))
      (catch Exception e
        (vswap! result assoc :error (ex-message e))))
    (cond-> @result
      (and read-only-type? (:error @result)) (assoc :reason "unparseable"))))

(defn simple-query
  "Whether `sql` is a simple SELECT, with no LIMIT, OFFSET or CTE, and the `:reason` when it is not."
  [sql dialect]
  (try
    (let [stmt (ast/parse-one sql dialect)]
      (cond
        (not (instance? Expressions$Query stmt))  {:is_simple false :reason "Not a simple SELECT"}
        (ast/arg stmt "with_")                    {:is_simple false :reason "Contains a CTE"}
        (not (instance? Expressions$Select stmt)) {:is_simple false :reason "Not a simple SELECT"}
        (ast/arg stmt "limit")                    {:is_simple false :reason "Contains a LIMIT"}
        (ast/arg stmt "offset")                   {:is_simple false :reason "Contains an OFFSET"}
        :else                                     {:is_simple true}))
    (catch ParseError e
      {:is_simple false :reason (ex-message e)})
    (catch Exception e
      {:is_simple false :reason (str "Unexpected error: " (ex-message e))})))
