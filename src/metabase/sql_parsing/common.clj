(ns metabase.sql-parsing.common
  (:require
   [potemkin :as p]))

(p/defprotocol+ PythonEval
  "Protocol for evaluating Python code. Abstracts over raw Context and pooled contexts."
  (eval-python [this code]
    "Evaluate Python code."))
