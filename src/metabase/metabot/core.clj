(ns metabase.metabot.core
  "API namespace for the `metabase.metabot` module."
  (:require
   [metabase.metabot.api]
   [metabase.metabot.client]
   [metabase.metabot.table-utils]
   [metabase.metabot.util]
   [potemkin :as p]))

(p/import-vars
 [metabase.metabot.api
  routes]
 [metabase.metabot.client
  analyze-chart
  analyze-dashboard
  fix-sql
  generate-sql]
 [metabase.metabot.table-utils
  database-tables
  used-tables
  schema-sample])
