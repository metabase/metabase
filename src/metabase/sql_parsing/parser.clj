(ns metabase.sql-parsing.parser
  "Hands callers the [[metabase.sql-parsing.protocol/SqlParser]] implementation for a backend: GraalPy or the Java
  port of sqlglot. Each implementation is loaded on first use.")

(set! *warn-on-reflection* true)

(defn parser
  "The SqlParser for `backend`: `:sqlglot` runs sqlglot on GraalPy, `:sqlglot-java` runs the Java port."
  [backend]
  (case backend
    :sqlglot      ((requiring-resolve 'metabase.sql-parsing.graal/parser))
    :sqlglot-java ((requiring-resolve 'metabase.sql-parsing.sqlglot-java/parser))
    (throw (ex-info "Unknown SQL parser backend; choose :sqlglot (GraalPy) or :sqlglot-java."
                    {:backend backend}))))
