(ns metabase.sql-parsing.parser
  "Hands callers the [[metabase.sql-parsing.protocol/SqlParser]] implementation: the in-process GraalPy
  parser. Kept behind the protocol so the caller ([[metabase.sql-parsing.core]]) doesn't care which
  backend runs."
  (:require
   [metabase.sql-parsing.graal :as graal]))

(set! *warn-on-reflection* true)

(defn parser
  "The sqlglot parser."
  []
  (graal/parser))
