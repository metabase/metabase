(ns metabase.sql-parsing.sqlglot-java.transpile
  "`transpile_sql`: a query rewritten from one dialect into another."
  (:require
   [clojure.string :as str]
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.ast Expr Expressions$Identifier)
   (com.metabase.sqlglot.reference NormalizeIdentifiers)
   (com.metabase.sqlglot.reference.dialects Dialect)
   (com.metabase.sqlglot.reference.settings SourceSettings)))

(set! *warn-on-reflection* true)

(defn- metabase-templates?
  "Whether `sql` holds Metabase template syntax: `{{variable}}`, `{{#model}}`, `{{snippet: name}}` or
  `[[optional clause]]`. Templated queries are passed through, since normalizing every template kind for parsing is
  brittle."
  [sql]
  (boolean (re-find #"\{\{|\[\[" sql)))

;; Reserved words that cannot appear as bare identifiers, for the dialects whose sqlglot generator ships an empty
;; RESERVED_KEYWORDS set. Sourced from the vendors' reserved-word documentation. Dialects absent here fall back to
;; sqlglot's own per-dialect set; where that is empty too (e.g. SQLite, whose double-quote quirk turns an unresolved
;; quoted identifier into a string literal), identifiers pass through untouched and the warehouse reports its own
;; error.
(def ^:private dialect-reserved
  {"postgres"  (set (str/split "all analyse analyze and any array as asc asymmetric authorization binary both case
        cast check collate collation column concurrently constraint create cross current_catalog current_date
        current_role current_schema current_time current_timestamp current_user default deferrable desc distinct do
        else end except false fetch for foreign freeze from full grant group having ilike in initially inner intersect
        into is isnull join lateral leading left like limit localtime localtimestamp natural not notnull null offset on
        only or order outer overlaps placing primary references returning right select session_user similar some
        symmetric system_user table tablesample then to trailing true union unique user using variadic verbose when
        where window with" #"\s+"))
   "snowflake" (set (str/split "account all alter and any as between by case cast check column connect connection
        constraint create cross current current_date current_time current_timestamp current_user database delete
        distinct drop else exists false following for from full grant group gscluster having ilike in increment inner
        insert intersect into is issue join lateral left like localtime localtimestamp minus natural not null of on or
        order organization qualify regexp revoke right rlike row rows sample schema select set some start table
        tablesample then to trigger true try_cast union unique update using values view when whenever where with"
                               #"\s+"))
   "oracle"    (set (str/split "access add all alter and any as asc audit between by char check cluster column
        column_value comment compress connect create current date decimal default delete desc distinct drop else
        exclusive exists file float for from grant group having identified immediate in increment index initial insert
        integer intersect into is level like lock long maxextents minus mlslabel mode modify nested_table_id noaudit
        nocompress not nowait null number of offline on online option or order pctfree prior public raw rename
        resource revoke row rowid rownum rows select session set share size smallint start successful synonym sysdate
        table then to trigger uid union unique update user validate values varchar varchar2 view whenever where with"
                               #"\s+"))})

(defn- dialect-name
  "The name of the dialect `dialect` selects, which may carry options (`postgres, normalization_strategy=lowercase`)."
  [dialect]
  (u/lower-case-en (str/trim (first (str/split dialect #",")))))

(defn- quote-reserved-identifiers!
  "Quote the identifiers in `expr` that collide with `dialect`'s reserved words. Each is folded first, the way the
  server would have folded the bare name, so quoting never changes what it resolves to. Only words reserved in that
  dialect are touched: a generic list would misfire, e.g. quoting `user` on SQLite, where a quoted nonexistent column
  silently becomes a string literal."
  [expr dialect]
  (let [dialect-name (dialect-name dialect)
        reserved     (into (set (.RESERVED_KEYWORDS (SourceSettings/generator dialect-name)))
                           (get dialect-reserved dialect-name))]
    (when (seq reserved)
      (doseq [ident (ast/find-all expr Expressions$Identifier)
              :when (and (not (ast/quoted? ident))
                         (contains? reserved (u/lower-case-en (ast/node-name ident))))]
        (NormalizeIdentifiers/normalizeIdentifiers ^Expr ident ^String dialect false)
        (ast/set-arg! ident "quoted" true)))
    expr))

(defn transpile-sql
  "`sql` rewritten from `from-dialect` into `to-dialect` and pretty-printed, as `{:transpiled_sql :status}`, or
  `{:status \"error\" :error_message}`. Templated SQL, or a missing dialect, is passed through as skipped.

  Identifiers keep the quoting they were written with, so the database folds an unquoted one exactly as it would
  have folded the input; quoting everything would freeze the written casing, which breaks on dialects that fold
  (Snowflake uppercases, Postgres lowercases). The exception is an identifier that collides with the target
  dialect's reserved words, which is quoted."
  [sql from-dialect to-dialect]
  (cond
    (metabase-templates? sql)
    {:transpiled_sql sql :status "skipped" :reason "contains_templates"}

    (or (str/blank? from-dialect) (str/blank? to-dialect))
    {:transpiled_sql sql :status "skipped" :reason "missing_dialect"}

    :else
    (try
      (Dialect/getOrRaise ^String to-dialect)
      (let [stmts (ast/parse sql from-dialect)]
        (if (> (count stmts) 1)
          {:status "error" :error_message "Multiple SQL statements are not supported. Please provide a single query."}
          (let [stmt (or (first stmts)
                         (throw (ex-info "'NoneType' object has no attribute 'find_all'" {})))]
            {:transpiled_sql (ast/pretty-sql (quote-reserved-identifiers! stmt to-dialect) to-dialect)
             :status         "success"})))
      (catch Exception e
        {:status "error" :error_message (ex-message e)}))))
