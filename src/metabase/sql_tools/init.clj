(ns metabase.sql-tools.init
  (:require
   ;; The common implements shims provided through sql-tools.core. Following ensures method registration.
   [metabase.sql-tools.common]
   ;; metabase.sql-tools.<parser> is required to ensure method's registration
   [metabase.sql-tools.macaw.core]
   [metabase.sql-tools.metrics]
   [metabase.sql-tools.settings]
   [metabase.sql-tools.sqlglot.core]))
