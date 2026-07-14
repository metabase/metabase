(ns metabase.sql-tools.init
  (:require
   ;; The common implements shims provided through sql-tools.core. Following ensures method registration.
   [metabase.sql-tools.common]
   [metabase.sql-tools.metrics]
   ;; metabase.sql-tools.sqlglot.core is required to ensure method registration
   [metabase.sql-tools.sqlglot.core]))
