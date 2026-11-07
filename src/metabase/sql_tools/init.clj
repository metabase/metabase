(ns metabase.sql-tools.init
  (:require
   ;; Registers the :macaw methods. sql-tools.core already loads the :sqlglot methods.
   [metabase.sql-tools.macaw.core]
   [metabase.sql-tools.metrics]
   [metabase.sql-tools.settings]))
