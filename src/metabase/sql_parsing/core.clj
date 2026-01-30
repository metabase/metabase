(ns metabase.sql-parsing.core
  "Stateless SQL parsing via sqlglot (Python) and GraalVM Polyglot.

  This module provides dialect-aware SQL parsing with no Metabase dependencies.
  All functions take strings and return strings/simple data structures.

  API:
    (referenced-tables sql dialect) → [[schema table] ...]
    (returned-columns-lineage dialect sql schema schema-map) → [[col pure? deps] ...]
    (validate-query dialect sql schema schema-map) → {:status :ok} | {:status :error ...}"
  (:require
   [metabase.sql-parsing.common :as common]
   [metabase.sql-parsing.pool :as python.pool]
   [metabase.util.json :as json])
  (:import
   (java.io Closeable)
   (org.graalvm.polyglot Value)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn referenced-tables
  "Extract table references from SQL.

   Returns a vector of [schema-or-nil table-name] pairs:
   [[nil \"users\"] [\"public\" \"orders\"]]

   This is the pure parsing layer - it returns what's literally in the SQL.
   Default schema resolution happens in the matching layer (core.clj)."
  [dialect sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.referenced_tables")
        (.execute ^Value (object-array [sql dialect]))
        .asString
        json/decode
        vec)))

(comment
  (referenced-tables "postgres"
                     "select * from transactions")
  )
