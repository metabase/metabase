(ns metabase.sql-parsing.parser
  "Selects GraalPy or Java SQLGlot behind the SqlParser protocol. Uses the existing
  sql-tools-parser-backend setting; implementations are loaded only when selected."
  (:require
   [metabase.sql-tools.settings :as settings]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *backend*
  "Optional parser override for direct protocol comparisons and sql-tools dispatch."
  nil)

(defn parser
  "Return the configured parser, or explicitly select :graalvm or :sqlglot-java."
  ([] (parser (or *backend*
                  (when (= :sqlglot-java (settings/current-parser-backend)) :sqlglot-java)
                  :graalvm)))
  ([backend]
   (case (keyword backend)
     (:sqlglot :graalvm :graal) ((requiring-resolve 'metabase.sql-parsing.graal/parser))
     :sqlglot-java ((requiring-resolve 'metabase.sql-parsing.sqlglot-java/parser))
     (throw (ex-info "Unknown SQL parser backend; choose graalvm or sqlglot-java."
                     {:backend backend})))))
