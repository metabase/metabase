(ns metabase.sql-parsing.sqlglot-java
  "The `:sqlglot-java` [[metabase.sql-parsing.protocol/SqlParser]]: `sql_tools.py` ported to Clojure over the Java port
  of sqlglot, with the same contract as the GraalPy parser.

  Only the `metabase.sql-parsing.sqlglot-java.*` namespaces touch the port, and every method returns strings, vectors
  and maps, never a node: code that read the port's AST elsewhere would tie Metabase to its shape.
  `metabase.sql-parsing.sqlglot-java-test` checks both.

  Every failure is a [[metabase.sql-parsing.common/call-failed-ex]]. Port errors keep their sqlglot name (`ParseError`,
  `OptimizeError`, ...), the errors `sql_tools.py` raises itself carry the Python name (`ValueError`, `KeyError`,
  `AssertionError`, `AttributeError`, `RecursionError`, `TypeError` for nil SQL), and any other JVM exception carries
  its Java class name."
  (:require
   [metabase.sql-parsing.common :as common]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.field-references :as field-references]
   [metabase.sql-parsing.sqlglot-java.qualify :as qualify]
   [metabase.sql-parsing.sqlglot-java.references :as references]
   [metabase.sql-parsing.sqlglot-java.rewrite :as rewrite]
   [metabase.sql-parsing.sqlglot-java.statements :as statements]
   [metabase.sql-parsing.sqlglot-java.transpile :as transpile]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot.reference Parser$DialectError)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "The port's java.util.logging loggers, each with a filter that drops every record.

  The port's parser warns with the SQL it falls back on (\"'<sql>' contains unsupported syntax. Falling back to
  parsing as a 'Command'.\"), and Metabase bridges java.util.logging into its own log. sql_tools.py silences sqlglot's
  logger so customer SQL never reaches server logs; this does the same for the port. A filter rather than a level,
  since the Log4j bridge resets java.util.logging levels whenever the Log4j configuration changes. The names are the
  port's `Logger/getLogger` calls (rc.3). The loggers are held in this var because java.util.logging keeps loggers
  only weakly, and a collected one would lose its filter."}
  port-loggers
  (mapv (fn [logger-name]
          (doto (java.util.logging.Logger/getLogger ^String logger-name)
            (.setFilter (reify java.util.logging.Filter
                          (isLoggable [_ _] false)))))
        ["com.metabase.sqlglot.reference.Parser"
         "com.metabase.sqlglot.reference.Generator"
         "com.metabase.sqlglot.reference.TypeAnnotator"
         ;; the BigQuery generator's
         "sqlglot"]))

(defn- error-type
  "The error name `e` is reported under: the Python name where the shim knows it, else the Java class name."
  [^Throwable e]
  (cond
    (instance? Parser$DialectError e)    "ValueError"
    (ast/python-error-type e)            (ast/python-error-type e)
    ;; Python raises a TypeError for a None argument (nil SQL).
    (instance? NullPointerException e)   "TypeError"
    :else                                (.getSimpleName (class e))))

(defn- call
  "Call `f`, turning any failure into the exception every parser throws, whose message and cause read
  `ErrorType: message` as the GraalPy transport's do, so [[metabase.sql-parsing.core/parse-error-message]] reads both
  the same way. SQL nested too deeply for the stack is a RecursionError, with GraalPy's message."
  [f]
  (try
    (f)
    (catch StackOverflowError e
      (let [error "RecursionError: maximum recursion depth exceeded"]
        (throw (common/call-failed-ex error (ex-info error {} e)))))
    (catch Exception e
      (let [error (str (error-type e) ": " (ex-message e))]
        (throw (common/call-failed-ex error (ex-info error {} e)))))))

(defn- json-shaped
  "`x` with keyword keys and values as strings, the shape `sql_tools.py` reads its JSON arguments in."
  [x]
  (cond
    (map? x)     (into {} (map (fn [[k v]] [(if (keyword? k) (u/qualified-name k) k) (json-shaped v)])) x)
    (keyword? x) (u/qualified-name x)
    (coll? x)    (mapv json-shaped x)
    :else        x))

(defn parser
  "The `:sqlglot-java` SqlParser."
  []
  (reify protocol/SqlParser
    (referenced-tables [_ dialect sql]
      (call #(references/referenced-tables sql dialect)))
    (referenced-fields [_ dialect sql]
      (call #(references/referenced-fields sql dialect)))
    (returned-columns-lineage [_ dialect sql default-table-schema sqlglot-schema]
      (call #(qualify/returned-columns-lineage dialect sql default-table-schema (json-shaped sqlglot-schema))))
    (validate-query [_ dialect sql default-table-schema sqlglot-schema]
      (call #(qualify/validate-query dialect sql default-table-schema (json-shaped sqlglot-schema))))
    (simple-query [_ dialect sql]
      (call #(statements/simple-query sql dialect)))
    (add-into-clause [_ dialect sql table-name]
      (call #(rewrite/add-into-clause sql table-name dialect)))
    (field-references [_ dialect sql]
      (call #(field-references/field-references sql dialect)))
    (replace-names [_ dialect sql replacements]
      (call #(rewrite/replace-names sql (json-shaped replacements) dialect)))
    (single-stmt-of-type [_ dialect sql stmt-type]
      (call #(statements/single-stmt-of-type sql stmt-type dialect)))
    (transpile-sql [_ sql from-dialect to-dialect]
      (call #(transpile/transpile-sql sql from-dialect to-dialect)))))
