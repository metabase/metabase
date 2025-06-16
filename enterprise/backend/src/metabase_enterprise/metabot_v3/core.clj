(ns metabase-enterprise.metabot-v3.core
  "API namespace for the `metabase-enterprise.metabot-v3` module."
  (:require
   [metabase-enterprise.metabot-v3.api]
   [metabase-enterprise.metabot-v3.client]
   [metabase-enterprise.metabot-v3.table-utils]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.metabot-v3.api
  routes]
 [metabase-enterprise.metabot-v3.client
  analyze-chart
  analyze-dashboard
  fix-sql
  generate-sql]
 [metabase-enterprise.metabot-v3.table-utils
  database-tables
  used-tables])
