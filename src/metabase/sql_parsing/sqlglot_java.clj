(ns metabase.sql-parsing.sqlglot-java
  "The `:sqlglot-java` [[metabase.sql-parsing.protocol/SqlParser]]: `sql_tools.py` ported to Clojure over the Java port
  of sqlglot, with the same contract as the GraalPy parser.

  The port's AST stays inside `metabase.sql-parsing.sqlglot-java.*`: every method returns strings, vectors and maps,
  and every failure is a [[metabase.sql-parsing.common/call-failed-ex]] named for the error Python would raise."
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

(defn- error-type
  "The name of the error Python raises for `e`."
  [^Throwable e]
  (cond
    (instance? Parser$DialectError e) "ValueError"
    (ast/python-error-type e)         (ast/python-error-type e)
    :else                             (.getSimpleName (class e))))

(defn- call
  "Call `f`, turning any failure into the exception every parser throws: its cause carries `ErrorType: message`,
  as the GraalPy transport's does, so [[metabase.sql-parsing.core/parse-error-message]] reads both the same way."
  [f]
  (try
    (f)
    (catch StackOverflowError _
      (throw (common/call-failed-ex "RecursionError: SQL is too complex to analyze (maximum recursion depth exceeded)")))
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
