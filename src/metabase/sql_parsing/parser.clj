(ns metabase.sql-parsing.parser
  "Hands callers the [[metabase.sql-parsing.protocol/SqlParser]] implementation for the configured
  [[metabase.sql-parsing.settings/sql-parsing-mode]]: the in-process GraalPy parser (default) or a pool
  of external native CPython processes. Kept behind the protocol so the caller
  ([[metabase.sql-parsing.core]]) doesn't care which backend runs."
  (:require
   [metabase.sql-parsing.graal :as graal]
   [metabase.sql-parsing.python :as python]
   [metabase.sql-parsing.settings :as settings]))

(set! *warn-on-reflection* true)

(defn parser
  "The sqlglot parser for the configured mode."
  []
  (if (= :python (settings/sql-parsing-mode))
    (python/parser)
    (graal/parser)))
