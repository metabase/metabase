(ns metabase.sql-parsing.sqlglot-java.statements
  "What kind of statement a query is: `is_single_stmt_of_type`, with the read-only checks behind `read-only-select?`
  and the confined-write checks behind data-test writes, and `simple_query`."
  (:require
   [clojure.string :as str]
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expressions$Anonymous Expressions$Column Expressions$Delete Expressions$Dot
                             Expressions$DynamicIdentifier Expressions$Func
                             Expressions$Insert Expressions$NextValueFor Expressions$Parameter Expressions$PropertyEQ
                             Expressions$Query Expressions$Select Expressions$SetOperation Expressions$Subquery
                             Expressions$Table Expressions$TableAlias Expressions$Update
                             Expressions$WithTableHint)
   (com.metabase.sqlglot.reference ParseError)))

(set! *warn-on-reflection* true)

(defn placeholder-cast-offsets
  "The offsets in `sql`, ascending, at which [[split-placeholder-casts]] puts a space: after the `?` of each `?::`
  token. Empty for Databricks, which reads `?::` itself, and for `sql` that does not tokenize.
  Port of `_placeholder_cast_offsets`."
  [^String sql dialect]
  (if (or (= dialect "databricks") (not (str/includes? sql "?::")))
    []
    (try
      (into []
            (keep (fn [[token-type _text start]]
                    (when (= token-type "QDCOLON")
                      (inc (long start)))))
            (ast/tokenize sql dialect))
      (catch Exception _
        []))))

(defn split-placeholder-casts
  "`sql` with `?::` written `? ::` outside Databricks. sqlglot's tokenizer reads `?::` as one token that only the
  Databricks parser consumes, so `select ?::text` fails to parse anywhere else (#81373).
  Port of `_split_placeholder_casts`."
  [^String sql dialect]
  ;; Insert right to left so the earlier offsets stay valid.
  (reduce (fn [^String sql at]
            (str (subs sql 0 at) " " (subs sql at)))
          sql
          (rseq (placeholder-cast-offsets sql dialect))))

;; Nodes that write, lock, or run something other than a query. A SELECT can hold some of these: `SELECT ... INTO`
;; creates a table, `FOR UPDATE`/`FOR SHARE` take row locks, and Postgres lets a CTE body be a DELETE ... RETURNING.
;; Spark and Hive's `SELECT TRANSFORM (...) USING '<command>'` pipes rows through a program on the cluster.
(def ^:private not-read-only-classes
  (mapv ast/ast-class
        ["DML" "DDL" "Into" "Lock" "Command" "Set" "Grant" "Revoke" "Drop" "Alter" "TruncateTable" "Transaction"
         "Commit" "Rollback" "Use" "Execute" "LoadData" "Kill" "Pragma" "Cache" "Uncache" "Refresh" "Analyze"
         "NextValueFor" "QueryTransform"]))

;; Writes a SELECT can make through a built-in function. Advancing a sequence is one: sqlglot parses only the
;; SQL-standard `NEXT VALUE FOR` as its own node; Postgres and Redshift spell it as a function, Oracle and Snowflake as
;; a `.NEXTVAL` pseudo-column, and Snowflake also as the table function `TABLE(GETNEXTVAL(seq))`. Postgres large
;; objects are another, and any role can create one by default. So is asking Postgres for the current transaction's
;; id, which assigns one, and writing a message into the write-ahead log.
(def ^:private write-functions
  #{;; sequences
    "nextval" "setval" "getnextval"
    ;; Postgres large objects
    "lo_creat" "lo_create" "lo_from_bytea" "lo_put" "lowrite" "lo_truncate" "lo_truncate64" "lo_unlink"
    "lo_import" "lo_export"
    ;; Postgres transaction ids and the write-ahead log
    "txid_current" "pg_current_xact_id" "pg_logical_emit_message"})

;; Built-in functions that reach past the query that calls them: they take a lock that can outlive it, change the
;; session's settings, signal or stop another session, hold the connection waiting, or act outside the database.
(def ^:private session-effect-functions
  #{;; Postgres advisory locks
    "pg_advisory_lock" "pg_advisory_lock_shared" "pg_try_advisory_lock" "pg_try_advisory_lock_shared"
    "pg_advisory_xact_lock" "pg_advisory_xact_lock_shared" "pg_try_advisory_xact_lock"
    "pg_try_advisory_xact_lock_shared" "pg_advisory_unlock" "pg_advisory_unlock_shared" "pg_advisory_unlock_all"
    ;; MySQL named locks
    "get_lock" "release_lock" "release_all_locks"
    ;; session settings and signals
    "set_config" "pg_notify" "pg_terminate_backend" "pg_cancel_backend" "pg_reload_conf"
    ;; Postgres dblink: a named connection stays open on the session
    "dblink_connect" "dblink_connect_u"
    ;; Snowflake: stop another session's work
    "system$cancel_query" "system$cancel_all_queries" "system$abort_session" "system$abort_transaction"
    ;; waiting
    "pg_sleep" "pg_sleep_for" "pg_sleep_until" "sleep" "benchmark" "sleepeachrow" "system$wait"
    "master_pos_wait" "source_pos_wait" "wait_for_executed_gtid_set" "wait_until_sql_thread_after_gtids"
    ;; running a program, Java code or a request outside the database
    "executable" "reflect" "java_method" "http_request" "system$send_email" "sys_exec" "sys_eval"
    ;; reading a file on the database server
    "load_file"
    ;; Postgres server administration: the write-ahead log, backups, replication slots, recovery, the log file
    "pg_switch_wal" "pg_switch_xlog" "pg_create_restore_point" "pg_backup_start" "pg_backup_stop" "pg_start_backup"
    "pg_stop_backup" "pg_promote" "pg_rotate_logfile" "pg_create_physical_replication_slot"
    "pg_create_logical_replication_slot" "pg_drop_replication_slot" "pg_wal_replay_pause" "pg_wal_replay_resume"
    "pg_export_snapshot"})

;; Table functions that read from another server, a URL, object storage or the server's files. Their names are common
;; words elsewhere (`url`, `file`, `mysql`), so each set applies only in its own dialect.
(def ^:private dialect-session-effect-functions
  {"clickhouse" #{"url" "urlcluster" "s3" "s3cluster" "gcs" "remote" "remotesecure" "mysql" "postgresql" "mongodb"
                  "redis" "sqlite" "file" "filecluster" "hdfs" "hdfscluster" "azureblobstorage"
                  "azureblobstoragecluster" "jdbc" "odbc" "deltalake" "iceberg" "hudi" "cosn" "oss" "hive" "cluster"
                  "clusterallreplicas"}
   "duckdb"     #{"read_csv" "read_csv_auto" "read_parquet" "parquet_scan" "read_json" "read_json_auto"
                  "read_json_objects" "read_ndjson" "read_ndjson_auto" "read_ndjson_objects" "read_text" "read_blob"
                  "read_xlsx" "sniff_csv" "glob" "iceberg_scan" "delta_scan"}})

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

;; SQL Server table hints that take update or exclusive locks, hold shared ones to the end of the transaction, or set
;; the granularity of the locks taken (`ROWLOCK`, `PAGLOCK`). `NOLOCK`, `INDEX(...)` and the rest only steer how a
;; plain read runs.
(def ^:private locking-table-hints
  #{"UPDLOCK" "XLOCK" "TABLOCK" "TABLOCKX" "HOLDLOCK" "SERIALIZABLE" "REPEATABLEREAD" "ROWLOCK" "PAGLOCK"})

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
  "The lower-case name of the function `node` calls, or nil when it is not a function call. Port of `_function_name`."
  [node]
  (cond
    (instance? Expressions$Anonymous node) (ast/lower (ast/node-name node))
    (instance? Expressions$Func node)      (ast/lower (ast/sql-name node))))

(defn- first-function-in
  "The name of the first function in `stmt` that is in `names`, or nil. Port of `_first_function_in`."
  [names stmt]
  (some #(names (function-name %)) (ast/walk stmt)))

(defn- session-effect-function
  "The name of the first function in `stmt` that is one of [[session-effect-functions]], or of the
  [[dialect-session-effect-functions]] for `dialect`, or nil. Port of `_session_effect_function`."
  [stmt dialect]
  (first-function-in (into session-effect-functions (dialect-session-effect-functions dialect)) stmt))

(defn- sql-executing-function
  "The name of the first function in `stmt` that runs SQL passed to it as text, or nil.
  Port of `_sql_executing_function`."
  [stmt]
  (some (fn [node]
          (or (sql-executing-functions (function-name node))
              ;; Trino passes a query through to a connector's database with
              ;; `TABLE(catalog.system.query(query => '...'))`. The name `query` alone is too common to refuse, so it
              ;; counts only under a `system` schema.
              (when (and (instance? Expressions$Dot node)
                         (ast/ast-node? (ast/this node))
                         (= "system" (ast/lower (ast/node-name (ast/this node))))
                         (= "query" (function-name (ast/arg node "expression"))))
                "system.query")))
        (ast/walk stmt)))

(defn- dynamic-function-call?
  "Whether `stmt` calls a function named by Snowflake's `IDENTIFIER(...)`, as in `IDENTIFIER('f')(1)`. Name checks
  never see that name, a string or a variable, so the call is refused whatever it names. Only the call form has an
  `expressions` arg, holding the call's arguments, possibly none; a table or column name such as `IDENTIFIER('t')`
  has no such arg. Port of `_dynamic_function_call`."
  [stmt]
  (boolean (some #(and (instance? Expressions$DynamicIdentifier %)
                       (.containsKey (ast/args %) "expressions"))
                 (ast/walk stmt))))

(defn- external-table?
  "Whether `stmt` names a file or a URL as a table. DuckDB reads `FROM 'data.csv'` and `FROM \"s3://b/x.parquet\"` as
  the file at that path, and a name holding `.`, `/`, `\\` or `:` cannot be a plain table there unless quoted.
  Port of `_external_table`."
  [stmt dialect]
  (and (= dialect "duckdb")
       (boolean (some #(and (instance? Expressions$Table %)
                            (re-find #"[./\\:]" (or (ast/node-name %) "")))
                      (ast/walk stmt)))))

(defn- locking-hint?
  "Whether `node` names one of the [[locking-table-hints]]."
  [node]
  (contains? locking-table-hints (u/upper-case-en (ast/node-name node))))

(defn- write-function-name
  "The name of the function `node` calls when it is one of [[write-functions]], or advances a sequence in another
  spelling (`NEXT VALUE FOR s`, `s.nextval`), else nil. Port of `_write_function_name`."
  [node]
  (cond
    (instance? Expressions$NextValueFor node)
    "next value for"

    (and (instance? Expressions$Column node)
         (seq (ast/text node "table"))
         (= "nextval" (ast/lower (ast/node-name node))))
    "nextval"

    :else
    (write-functions (function-name node))))

(defn- user-variable-assignment?
  "Whether `node` assigns a MySQL user variable, `@x := ...`, whose value outlives the query on its connection.
  Port of `_user_variable_assignment`."
  [node]
  ;; A bare name on the left is a named argument instead, as in DuckDB and Postgres, and changes nothing. The variable
  ;; is searched for, not just checked for on top: a dotted name, `@x.y`, parses as a `Dot` around it.
  (and (instance? Expressions$PropertyEQ node)
       (let [target (ast/this node)]
         (and (ast/ast-node? target)
              (boolean (some #(instance? Expressions$Parameter %) (ast/walk target)))))))

(defn- writes-or-locks?
  "Whether the node `node` writes data, changes the session, or locks a table. Port of `_writes_or_locks`."
  [node]
  (cond
    (or (ast/instance-of-any? not-read-only-classes node)
        (some? (write-function-name node))
        (user-variable-assignment? node))
    true

    (instance? Expressions$WithTableHint node)
    (boolean (some locking-hint? (ast/expressions node)))

    ;; SQL Server still honours a hint written without WITH, `FROM t (TABLOCKX)`, which parses as a call to a
    ;; table-valued function named `t`.
    (and (instance? Expressions$Table node) (instance? Expressions$Anonymous (ast/this node)))
    (boolean (some #(and (instance? Expressions$Column %)
                         (empty? (ast/text % "table"))
                         (locking-hint? %))
                   (ast/expressions (ast/this node))))

    ;; After an alias, `FROM t a (XLOCK)` parses as a column list on the alias, and SQL Server reads it as a hint.
    ;; Only a plain table's alias counts: a derived table's column list, `(SELECT ...) d(a)`, names real columns.
    (and (instance? Expressions$Table node) (instance? Expressions$TableAlias (ast/arg node "alias")))
    (boolean (some locking-hint? (ast/arg (ast/arg node "alias") "columns")))

    :else
    false))

;; Any other function with side effects, a user-defined one included, passes this check: no list of names can be
;; complete. Grants on the database credential are what keep such a function from writing.
(defn- read-only?
  "Whether no node in the statement `stmt` writes, changes the session, or locks a table. Port of `_read_only`."
  [stmt]
  (not-any? writes-or-locks? (ast/walk stmt)))

;; Built-in functions a data-test write must not call, though the other modes admit them: each reads a table named in
;; a string, which the table check never sees, reads or writes the database server's files, reads or changes
;; replication slots and origins, or changes state that the run's rollback leaves changed (the random seed, the
;; statistics).
(def ^:private unconfined-functions
  #{;; Postgres: a table, a schema or the database as XML, read by the name passed in
    "table_to_xml" "table_to_xmlschema" "table_to_xml_and_xmlschema" "schema_to_xml" "schema_to_xmlschema"
    "schema_to_xml_and_xmlschema" "database_to_xml" "database_to_xmlschema" "database_to_xml_and_xmlschema"
    ;; Postgres: the server's files and directories, and the adminpack extension's file functions
    "pg_read_file" "pg_read_binary_file" "pg_stat_file" "pg_ls_dir" "pg_ls_logdir" "pg_ls_waldir"
    "pg_ls_logicalmapdir" "pg_ls_logicalsnapdir" "pg_ls_replslotdir" "pg_ls_archive_statusdir" "pg_ls_tmpdir"
    "pg_ls_summariesdir" "pg_current_logfile" "pg_file_write" "pg_file_rename" "pg_file_unlink"
    "pg_file_sync" "pg_logdir_ls"
    ;; Postgres: the session's random seed
    "setseed"
    ;; Postgres: statistics resets, and the planner statistics a function can set or clear
    "pg_stat_reset" "pg_stat_reset_shared" "pg_stat_reset_single_table_counters"
    "pg_stat_reset_single_function_counters" "pg_stat_reset_slru" "pg_stat_reset_replication_slot"
    "pg_stat_reset_subscription_stats" "pg_stat_reset_backend_stats" "pg_stat_statements_reset"
    "pg_restore_relation_stats" "pg_restore_attribute_stats" "pg_clear_relation_stats"
    "pg_clear_attribute_stats"
    ;; Postgres: replication slots and origins
    "pg_copy_physical_replication_slot" "pg_copy_logical_replication_slot" "pg_replication_slot_advance"
    "pg_logical_slot_get_changes" "pg_logical_slot_peek_changes" "pg_logical_slot_get_binary_changes"
    "pg_logical_slot_peek_binary_changes" "pg_sync_replication_slots" "pg_log_standby_snapshot"
    "pg_replication_origin_create" "pg_replication_origin_drop" "pg_replication_origin_oid"
    "pg_replication_origin_session_setup" "pg_replication_origin_session_reset"
    "pg_replication_origin_session_is_setup" "pg_replication_origin_session_progress"
    "pg_replication_origin_xact_setup" "pg_replication_origin_xact_reset" "pg_replication_origin_advance"
    "pg_replication_origin_progress"})

(defn- write-function
  "The [[write-function-name]] of the first node in `stmt` that has one, or nil. Port of `_write_function`."
  [stmt]
  (some write-function-name (ast/walk stmt)))

(defn- hidden-sql
  "`[reason detail]` when `sql` holds text its database would run and sqlglot would not parse as a statement of its
  own, else nil.

  The MySQL marks are looked for in the raw text, string literals included: MySQL's `NO_BACKSLASH_ESCAPES` mode ends
  a literal where sqlglot does not, so a backslash before a quote is refused. A `U&\"...\"` identifier is refused in
  every dialect, since Postgres reads its escapes and the function checks above never see the name.

  A carriage return with no newline after it is refused in every dialect. sqlglot ends a `--` or `#` comment at one,
  and MySQL does not, so the text after it would be a comment to one and SQL to the other.

  The T-SQL statement words are looked for only when `select?` says the statement is a SELECT, since a write statement
  starts with one. Port of `_hidden_sql`."
  [sql dialect select?]
  (or (when (re-find #"\r(?!\n)" sql)
        ["lone-carriage-return" nil])
      (when (re-find #"(?<![\w\$])[uU]&\"" sql)
        ["unicode-identifier" nil])
      (when (and (= dialect "tsql") select?)
        (some (fn [[token-type text]]
                (when-not (#{"STRING" "NATIONAL_STRING" "IDENTIFIER"} token-type)
                  ;; sqlglot keeps a character such as U+200B inside a word, `t<U+200B>EXEC`, where SQL Server may end
                  ;; the word. Each piece between characters that cannot be part of a name is checked on its own.
                  ;; `(?U)` makes `\w` match letters in any script, as Python's does; Java's also matches the join
                  ;; controls U+200C and U+200D, which Python's does not, so they are split on too.
                  (some #(when (contains? tsql-statement-words (u/upper-case-en %))
                           ["statement-word" (u/upper-case-en %)])
                        (str/split text #"(?U)(?:[^\w@#$]|[\x{200C}\x{200D}])+"))))
              (ast/tokenize sql dialect)))
      (when (contains? mysql-family-dialects dialect)
        (cond
          (or (str/includes? sql "/*!") (str/includes? sql "/*M!")) ["executable-comment" nil]
          ;; MySQL reads `--` as a comment only before ASCII whitespace or a control character, so the characters are
          ;; spelled out rather than left to `\s`.
          (re-find #"--(?![ \t\n\r\f\x0B]|\z)" sql)                   ["bare-dash-comment" nil]
          (re-find #"\\['\"`]" sql)                                  ["backslash-quote" nil]))))

;; A Postgres name: it may hold `$` and digits after its first character, so `a$q$` is one name, not a dollar quote.
(def ^:private pg-word #"[A-Za-z_\x{80}-\x{10FFFF}][A-Za-z_0-9$\x{80}-\x{10FFFF}]*")
(def ^:private pg-dollar-quote #"\$(?:[A-Za-z_\x{80}-\x{10FFFF}][A-Za-z_0-9\x{80}-\x{10FFFF}]*)?\$")

(defn- looking-at
  "The text `pattern` matches starting at index `i` of `sql`, as `[text end]`, or nil."
  [pattern ^String sql i]
  (let [m (doto (re-matcher pattern sql) (.region (int i) (count sql)))]
    (when (.lookingAt m)
      [(.group m) (.end m)])))

;; The characters Postgres reads as whitespace, and `\v`, which it refuses outside a literal or a comment. It reads any
;; other character from U+0080 up as part of a name.
(def ^:private pg-space #{\space \tab \newline \return \formfeed (char 11)})

(defn- index-after
  "The index after the first `s` in `sql` at or after `from`, or nil."
  [^String sql ^String s from]
  (let [i (.indexOf sql s (int from))]
    (when-not (neg? i)
      (+ i (count s)))))

(defn- pg-quoted-end
  "The index after the `quote` that ends the literal or quoted name whose text starts at `i`, a doubled `quote`
  standing for one, or nil when it does not end. Port of `_pg_quoted_end`."
  [^String sql i quote backslash-escapes?]
  (let [n       (count sql)
        doubled (str quote quote)]
    (loop [i i]
      (when (< i n)
        (let [c (.charAt sql i)]
          (cond
            (and (= c \\) backslash-escapes?) (recur (+ i 2))
            (= c quote)                       (if (.startsWith sql doubled i) (recur (+ i 2)) (inc i))
            :else                             (recur (inc i))))))))

(defn- pg-token-end
  "The index at which to resume scanning after index `i` of `sql`: the end of the word, literal, quoted name or dollar
  quote that starts at `i`, else `i + 1`. The character at `i` is not whitespace, `;` or the start of a comment. Nil
  when a literal, quoted name or dollar quote starting at `i` does not end."
  [^String sql i standard-conforming-strings?]
  (let [c (.charAt sql i)]
    (if-let [[word word-end] (looking-at pg-word sql i)]
      (let [prefix (u/lower-case-en word)]
        (cond
          (not (or (.startsWith sql "'" (int word-end))
                   (and (= prefix "u") (.startsWith sql "&'" (int word-end)))))
          word-end
          ;; E'' reads backslash escapes whatever the setting; B'', X'' and U&'' read none. N'' is an ordinary
          ;; literal after its prefix.
          (= prefix "e")         (pg-quoted-end sql (inc word-end) \' true)
          (#{"b" "x"} prefix)    (pg-quoted-end sql (inc word-end) \' false)
          (= prefix "u")         (pg-quoted-end sql (+ word-end 2) \' false)
          :else                  (pg-quoted-end sql (inc word-end) \' (not standard-conforming-strings?))))
      (cond
        (= c \')
        (pg-quoted-end sql (inc i) \' (not standard-conforming-strings?))

        (= c \")
        (pg-quoted-end sql (inc i) \" false)

        :else
        (if-let [[dollar dollar-end] (looking-at pg-dollar-quote sql i)]
          (index-after sql dollar dollar-end)
          ;; A number runs into a following letter: `1e'...'` is a number and then an E'' literal.
          (inc i))))))

(defn- line-comment-end
  "The index after the line end that ends the `--` comment at `i` of `sql`, or the length of `sql`."
  ^long [^String sql i]
  (let [m (re-matcher #"[\n\r]" sql)]
    (if (.find m (int i)) (.end m) (count sql))))

(defn- block-comment-end
  "The index after the `*/` that ends the `/*` comment at `i` of `sql`, comments nesting as Postgres nests them, or the
  length of `sql`."
  ^long [^String sql i]
  (let [n (count sql)]
    (loop [depth 1, i (+ i 2)]
      (cond
        (or (>= i n) (zero? depth)) i
        (.startsWith sql "/*" i)    (recur (inc depth) (+ i 2))
        (.startsWith sql "*/" i)    (recur (dec depth) (+ i 2))
        :else                       (recur depth (inc i))))))

(defn- postgres-statement-count
  "The number of statements Postgres reads in `sql` with `standard_conforming_strings` set as given, counting a piece
  between semicolons only when it holds more than whitespace and comments. A literal, quoted name or comment that does
  not end ends the count, with the piece it started counted. Port of `_postgres_statement_count`."
  [^String sql standard-conforming-strings?]
  (let [n (count sql)]
    (loop [i 0, stmt-count 0, content? false]
      (if (>= i n)
        (cond-> stmt-count content? inc)
        (let [c (.charAt sql i)]
          (cond
            (= c \;)                 (recur (inc i) (cond-> stmt-count content? inc) false)
            (pg-space c)             (recur (inc i) stmt-count content?)
            (.startsWith sql "--" i) (recur (line-comment-end sql i) stmt-count content?)
            (.startsWith sql "/*" i) (recur (block-comment-end sql i) stmt-count content?)
            :else                    (if-let [end (pg-token-end sql i standard-conforming-strings?)]
                                       (recur (long end) stmt-count true)
                                       (inc stmt-count))))))))

(defn- unbracketed
  "`stmt` without the brackets around the whole query: `(SELECT 1)` parses as a subquery with no alias.
  Port of `_unbracketed`."
  [stmt]
  (if (and (instance? Expressions$Subquery stmt) (empty? (ast/node-alias stmt)))
    (recur (ast/this stmt))
    stmt))

(def ^:private read-classes [Expressions$Select Expressions$SetOperation])
(def ^:private write-classes [Expressions$Update Expressions$Insert Expressions$Delete])

(defn- statement-reason
  "`[reason detail]` for why `stmt`, parsed from `sql`, fails the checks every statement type shares, else nil.
  Port of `_statement_reason`."
  [stmt sql dialect]
  (or (when-let [function (session-effect-function stmt dialect)]
        ["session-function" function])
      (when (external-table? stmt dialect)
        ["external-table" nil])
      (when-let [executor (sql-executing-function stmt)]
        ["sql-executing-function" executor])
      (when (dynamic-function-call? stmt)
        ["dynamic-function-call" nil])
      (hidden-sql sql dialect (ast/instance-of-any? read-classes (unbracketed stmt)))))

(defn- not-read-only-reason
  "`[reason detail]` for why `stmts`, parsed from `sql`, are not one read-only SELECT, else nil.
  Port of `_not_read_only_reason`."
  [stmts sql dialect]
  (cond
    (empty? stmts)                                                     ["not-a-select" nil]
    (not= 1 (count stmts))                                             ["multiple-statements" nil]
    (not (ast/instance-of-any? read-classes (unbracketed (first stmts)))) ["not-a-select" nil]
    (not (read-only? (first stmts)))                                   ["writes-or-locks" nil]
    :else                                                              (statement-reason (first stmts) sql dialect)))

(declare single-stmt-of-type)

(defn- rebuild-problem
  "`[reason detail]` for why `rebuilt`, sqlglot's regenerated SQL of the statement `sql` of `stmt-type`, fails the
  checks of a rebuild, else nil. Port of `_rebuild_problem`."
  [dialect ^String sql ^String rebuilt stmt-type]
  ;; The checks of `sql` read `sql`, and the caller runs `rebuilt`. sqlglot's generator does not always produce text
  ;; that reads back as the tree it wrote: an E'' string holding `\\` comes back with one backslash, so its quote
  ;; moves, and a dollar-quoted alias comes back bare.
  (or ;; A rebuild equal to `sql` reads as `sql` did, so it is not parsed again.
   (when (not= rebuilt sql)
     (let [again (single-stmt-of-type dialect rebuilt stmt-type nil)]
       (when-not (:allowed_stmt_type? again)
         ["rebuild-differs" (:reason again)])))
   (when (and (= dialect "postgres") (> (postgres-statement-count rebuilt true) 1))
     ["rebuild-differs" "multiple-statements"])
   (when (and (= dialect "postgres") (> (postgres-statement-count rebuilt false) 1))
     ["backslash-quote" nil])))

(defn single-stmt-of-type
  "Whether `sql` is a single read statement (`\"read\"`, a SELECT), a single read-only SELECT (`\"read-only\"`), or a
  single write statement (anything else: INSERT, UPDATE, DELETE), with the statement as regenerated SQL.

  `\"read-only\"` also refuses a SELECT holding anything that writes or locks anywhere in its tree, and does not count
  a statement holding only a comment after the last semicolon. Every mode applies the checks the statement types
  share. `:reason` (and `:reason_detail`) say why a query is refused for what it holds.

  `\"confined-write\"` is stricter than `\"write\"`: the statement must also call none of [[write-functions]] nor of
  [[unconfined-functions]], assign no MySQL user variable, and return no rows.

  `check-rebuild` is nil or `\"rebuild\"`. With `\"rebuild\"`, the regenerated SQL of a statement of the allowed
  type must also pass the same checks (`:reason` `\"rebuild-differs\"`, with the regenerated SQL's own reason as
  `:reason_detail`), and for `\"postgres\"`, Postgres must read it as one statement with
  `standard_conforming_strings` on (`:reason` `\"rebuild-differs\"`, `:reason_detail` `\"multiple-statements\"`)
  and with it off (`:reason` `\"backslash-quote\"`). Port of `is_single_stmt_of_type`."
  [dialect sql stmt-type check-rebuild]
  (let [read-only-type? (= stmt-type "read-only")
        ;; Filled in as it goes, so a failure part way keeps what was found before it.
        result          (volatile! {:is_single_stmt? false, :allowed_stmt_type? false})]
    (try
      (let [stmts   (cond->> (vec (ast/parse (split-placeholder-casts sql dialect) dialect))
                      read-only-type? ast/nonempty-statements)
            allowed (if (#{"read" "read-only"} stmt-type) read-classes write-classes)
            [stmt]  stmts
            problem (cond
                      read-only-type?
                      (not-read-only-reason stmts sql dialect)

                      (= 1 (count stmts))
                      (or (statement-reason stmt sql dialect)
                          (when (= stmt-type "confined-write")
                            (let [function   (write-function stmt)
                                  unconfined (first-function-in unconfined-functions stmt)]
                              (cond
                                function                                         ["write-function" function]
                                unconfined                                       ["unconfined-function" unconfined]
                                (some user-variable-assignment? (ast/walk stmt)) ["user-variable" nil]
                                (some? (ast/arg stmt "returning"))               ["returning" nil])))))
            rebuilt  (when (= 1 (count stmts))
                       (when-not stmt
                         (throw (ex-info "'NoneType' object has no attribute 'sql'" {})))
                       (ast/sql stmt dialect))
            allowed? (and rebuilt (ast/instance-of-any? allowed (unbracketed stmt)))
            problem  (if (and (nil? problem) check-rebuild allowed?)
                       (rebuild-problem dialect sql rebuilt stmt-type)
                       problem)]
        (when problem
          (vswap! result assoc :reason (first problem) :reason_detail (second problem)))
        (when rebuilt
          (vswap! result assoc :is_single_stmt? true)
          (when (and allowed? (nil? problem))
            (vswap! result assoc :allowed_stmt_type? true))
          (vswap! result assoc :sql rebuilt)))
      ;; Python's `except Exception` also catches the RecursionError of SQL nested too deeply.
      (catch StackOverflowError _
        (vswap! result assoc :error "maximum recursion depth exceeded"))
      ;; An exception without a message (a port NullPointerException) is still an error, so it still gets a reason.
      (catch Exception e
        (vswap! result assoc :error (or (ex-message e) (.getName (class e))))))
    (cond-> @result
      (and read-only-type? (:error @result)) (assoc :reason "unparseable"))))

(defn simple-query
  "Whether `sql` is a simple SELECT, with no LIMIT, OFFSET or CTE, and the `:reason` when it is not.
  Port of `simple_query`."
  [dialect sql]
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
